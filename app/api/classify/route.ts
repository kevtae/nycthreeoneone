import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { embed } from "@/lib/openai";
import { supabase } from "@/lib/supabase";
import { anthropic, CLASSIFY_MODEL } from "@/lib/anthropic";

export const runtime = "nodejs";
export const maxDuration = 30;

// Phase 2 — Filing classifier.
// embed query -> pgvector top-N over `catalog` (match_catalog RPC)
// -> Claude picks the single best report option via a forced tool call
// -> return { match, explanation, needs_clarification, candidates }.

type Candidate = {
  ka: string;
  title: string;
  label: string | null;
  agency: string | null;
  entry_url: string;
  similarity: number;
};

type Selection = {
  best_match_index: number; // 0-based into candidates, or -1 if none fit
  confidence: "high" | "medium" | "low";
  explanation: string;
  needs_clarification: boolean;
  clarifying_question: string | null;
};

const SYSTEM = `You route NYC 311 complaints. Given a resident's free-text description and a short list of candidate 311 report options (already narrowed by semantic search), pick the single best match by calling the select_complaint tool.

Guidelines:
- Pick the option that most precisely matches what the resident wants to report.
- If two options are plausible and the distinction matters (e.g. noise sub-types, residential vs. commercial), set needs_clarification = true and ask ONE short clarifying question.
- If none of the candidates genuinely fit, set best_match_index = -1.
- Write the explanation in one or two plain sentences addressed to the resident.`;

const SELECT_TOOL: Anthropic.Tool = {
  name: "select_complaint",
  description: "Record the chosen 311 report option for the resident's complaint.",
  input_schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      best_match_index: {
        type: "integer",
        description: "0-based index into the candidate list, or -1 if none fit.",
      },
      confidence: { type: "string", enum: ["high", "medium", "low"] },
      explanation: { type: "string", description: "One or two sentences for the resident." },
      needs_clarification: { type: "boolean" },
      clarifying_question: {
        type: ["string", "null"],
        description: "A single short question, or null if no clarification is needed.",
      },
    },
    required: [
      "best_match_index",
      "confidence",
      "explanation",
      "needs_clarification",
      "clarifying_question",
    ],
  },
};

export async function POST(req: NextRequest) {
  const { query } = await req.json().catch(() => ({}));
  if (!query || typeof query !== "string") {
    return NextResponse.json({ error: "Missing 'query' string." }, { status: 400 });
  }

  // 1. Embed + retrieve candidates from pgvector.
  const queryEmbedding = await embed(query);
  const { data, error } = await supabase().rpc("match_catalog", {
    query_embedding: queryEmbedding,
    match_count: 8,
  });
  if (error) {
    return NextResponse.json({ error: `Retrieval failed: ${error.message}` }, { status: 500 });
  }
  const candidates = (data ?? []) as Candidate[];
  if (candidates.length === 0) {
    return NextResponse.json({ match: null, explanation: "No matching complaint type found." });
  }

  // 2. Claude picks the best candidate (forced tool call = structured output).
  const candidateList = candidates
    .map(
      (c, i) =>
        `${i}. ${c.title}${c.label ? ` — ${c.label}` : ""} (agency: ${c.agency ?? "n/a"})`,
    )
    .join("\n");

  const msg = await anthropic().messages.create({
    model: CLASSIFY_MODEL,
    max_tokens: 1024,
    system: SYSTEM,
    tools: [SELECT_TOOL],
    tool_choice: { type: "tool", name: "select_complaint" },
    messages: [
      {
        role: "user",
        content: `Resident's description:\n"${query}"\n\nCandidate report options:\n${candidateList}`,
      },
    ],
  });

  const toolUse = msg.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
  );
  if (!toolUse) {
    return NextResponse.json({ error: "Classifier returned no selection." }, { status: 502 });
  }
  const sel = toolUse.input as Selection;
  const picked =
    sel.best_match_index >= 0 && sel.best_match_index < candidates.length
      ? candidates[sel.best_match_index]
      : null;

  return NextResponse.json({
    match: picked
      ? { ka: picked.ka, title: picked.title, agency: picked.agency, entry_url: picked.entry_url }
      : null,
    confidence: sel.confidence,
    explanation: sel.explanation,
    needs_clarification: sel.needs_clarification,
    clarifying_question: sel.clarifying_question,
    candidates: candidates.map((c) => ({
      ka: c.ka,
      title: c.title,
      agency: c.agency,
      similarity: c.similarity,
    })),
  });
}

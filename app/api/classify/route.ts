import { NextRequest, NextResponse } from "next/server";
import { embed, openai, CLASSIFY_MODEL } from "@/lib/openai";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const maxDuration = 30;

// Phase 2 — Filing classifier.
// embed query -> pgvector top-N over `catalog` (match_catalog RPC)
// -> OpenAI picks the single best report option via strict JSON-schema output
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

const SYSTEM = `You route NYC 311 complaints. Given a resident's free-text description and a short list of candidate 311 report options (already narrowed by semantic search), pick the single best match.

Guidelines:
- Pick the option that most precisely matches what the resident wants to report.
- If two options are plausible and the distinction matters (e.g. noise sub-types, residential vs. commercial), set needs_clarification = true and ask ONE short clarifying question.
- If none of the candidates genuinely fit, set best_match_index = -1.
- Write the explanation in one or two plain sentences addressed to the resident.`;

const SELECTION_SCHEMA = {
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
} as const;

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

  // 2. Model picks the best candidate (strict JSON schema = structured output).
  const candidateList = candidates
    .map(
      (c, i) =>
        `${i}. ${c.title}${c.label ? ` — ${c.label}` : ""} (agency: ${c.agency ?? "n/a"})`,
    )
    .join("\n");

  const completion = await openai().chat.completions.create({
    model: CLASSIFY_MODEL,
    max_tokens: 1024,
    messages: [
      { role: "system", content: SYSTEM },
      {
        role: "user",
        content: `Resident's description:\n"${query}"\n\nCandidate report options:\n${candidateList}`,
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: { name: "complaint_selection", strict: true, schema: SELECTION_SCHEMA },
    },
  });

  const raw = completion.choices[0]?.message.content;
  if (!raw) {
    return NextResponse.json({ error: "Classifier returned no selection." }, { status: 502 });
  }
  const sel = JSON.parse(raw) as Selection;
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

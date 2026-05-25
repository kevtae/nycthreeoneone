import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { embed } from "@/lib/openai";
import { supabase } from "@/lib/supabase";
import { anthropic, CLAUDE_MODEL } from "@/lib/anthropic";

export const runtime = "nodejs";
export const maxDuration = 30;

// Phase 3 — Q&A (RAG).
// embed question -> pgvector top-K over `knowledge_chunks` (match_knowledge_chunks RPC)
// -> Claude answers from the retrieved chunks only, citing the preserved links.

type Chunk = {
  ka: string;
  title: string;
  section: string | null;
  body: string;
  links: { text: string; href: string }[];
  similarity: number;
};

const ARTICLE_URL = (ka: string) =>
  `https://portal.311.nyc.gov/article/?kanumber=${ka}`;

// Below this cosine similarity, retrieval is too weak to ground an answer.
const MIN_SIMILARITY = 0.3;

const SYSTEM = `You answer questions about NYC 311 services using ONLY the official 311 knowledge base excerpts provided in the user message.

Rules:
- Answer strictly from the excerpts. If they don't contain the answer, say you don't have that information and point to the most relevant official page if one is present. Never invent facts, fees, timelines, or eligibility rules.
- Cite sources inline using the markdown links that appear in the excerpts (application forms, related pages, phone numbers, etc.). Preserve them as markdown links.
- Be concise and practical — short paragraphs or bullet points. Address the resident directly.
- This is official NYC 311 material; do not offer legal advice beyond what it states.`;

export async function POST(req: NextRequest) {
  const { question } = await req.json().catch(() => ({}));
  if (!question || typeof question !== "string") {
    return NextResponse.json({ error: "Missing 'question' string." }, { status: 400 });
  }

  // 1. Embed + retrieve chunks.
  const queryEmbedding = await embed(question);
  const { data, error } = await supabase().rpc("match_knowledge_chunks", {
    query_embedding: queryEmbedding,
    match_count: 8,
  });
  if (error) {
    return NextResponse.json({ error: `Retrieval failed: ${error.message}` }, { status: 500 });
  }
  const chunks = ((data ?? []) as Chunk[]).filter((c) => c.similarity >= MIN_SIMILARITY);
  if (chunks.length === 0) {
    return NextResponse.json({
      answer:
        "I couldn't find anything about that in the NYC 311 knowledge base. Try rephrasing, or contact 311 directly by calling 311 (212-639-9675).",
      sources: [],
    });
  }

  // 2. Synthesize a grounded answer from the chunks.
  const context = chunks
    .map(
      (c, i) =>
        `[Source ${i + 1}: ${c.title}${c.section ? ` — ${c.section}` : ""}]\n${c.body}`,
    )
    .join("\n\n---\n\n");

  const msg = await anthropic().messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 1500,
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: `Question: ${question}\n\nOfficial NYC 311 knowledge base excerpts:\n\n${context}`,
      },
    ],
  });

  const answer = msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  // Dedupe sources by article, preserving retrieval order.
  const seen = new Set<string>();
  const sources = chunks
    .filter((c) => (seen.has(c.ka) ? false : (seen.add(c.ka), true)))
    .map((c) => ({ ka: c.ka, title: c.title, url: ARTICLE_URL(c.ka) }));

  return NextResponse.json({ answer, sources });
}

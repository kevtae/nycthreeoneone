import { embed, openai, ANSWER_MODEL } from "./openai";
import { supabase } from "./supabase";

// Q&A (RAG): embed question -> pgvector top-K over `knowledge_chunks` -> model
// answers from the retrieved chunks only, citing the preserved links.

type Chunk = {
  ka: string;
  title: string;
  section: string | null;
  body: string;
  links: { text: string; href: string }[];
  similarity: number;
};

export type AnswerResult = {
  answer: string;
  sources: { ka: string; title: string; url: string }[];
};

const ARTICLE_URL = (ka: string) => `https://portal.311.nyc.gov/article/?kanumber=${ka}`;
const MIN_SIMILARITY = 0.3;

const SYSTEM = `You answer questions about NYC 311 services using ONLY the official 311 knowledge base excerpts provided in the user message.

Rules:
- Answer strictly from the excerpts. If they don't contain the answer, say you don't have that information and point to the most relevant official page if one is present. Never invent facts, fees, timelines, or eligibility rules.
- Cite sources inline using the markdown links that appear in the excerpts (application forms, related pages, phone numbers, etc.). Preserve them as markdown links.
- Be concise and practical — short paragraphs or bullet points. Address the resident directly.
- This is official NYC 311 material; do not offer legal advice beyond what it states.`;

const FALLBACK =
  "I couldn't find anything about that in the NYC 311 knowledge base. Try rephrasing, or contact 311 directly by calling 311 (212-639-9675).";

export async function answerQuestion(question: string): Promise<AnswerResult> {
  const queryEmbedding = await embed(question);
  const { data, error } = await supabase().rpc("match_knowledge_chunks", {
    query_embedding: queryEmbedding,
    match_count: 8,
  });
  if (error) throw new Error(`Retrieval failed: ${error.message}`);

  const chunks = ((data ?? []) as Chunk[]).filter((c) => c.similarity >= MIN_SIMILARITY);
  if (chunks.length === 0) return { answer: FALLBACK, sources: [] };

  const context = chunks
    .map((c, i) => `[Source ${i + 1}: ${c.title}${c.section ? ` — ${c.section}` : ""}]\n${c.body}`)
    .join("\n\n---\n\n");

  const completion = await openai().chat.completions.create({
    model: ANSWER_MODEL,
    max_tokens: 1500,
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: `Question: ${question}\n\nOfficial NYC 311 knowledge base excerpts:\n\n${context}` },
    ],
  });

  const answer = completion.choices[0]?.message.content ?? "";
  const seen = new Set<string>();
  const sources = chunks
    .filter((c) => (seen.has(c.ka) ? false : (seen.add(c.ka), true)))
    .map((c) => ({ ka: c.ka, title: c.title, url: ARTICLE_URL(c.ka) }));

  return { answer, sources };
}

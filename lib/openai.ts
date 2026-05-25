import OpenAI from "openai";
import { env } from "./env";

// Embeddings — locked in (see nyc-311-plan.md); pgvector columns are vector(1536).
export const EMBEDDING_MODEL = "text-embedding-3-small";
export const EMBEDDING_DIM = 1536;

// Chat models per task, tuned for a free high-volume public tool:
//   classify = pick-from-5  -> mini (cheap, fast, supports strict JSON schema)
//   answer   = grounded Q&A -> 4o   (better synthesis, still affordable)
// Bump either to a newer/larger model if quality needs it.
export const CLASSIFY_MODEL = "gpt-4o-mini";
export const ANSWER_MODEL = "gpt-4o";
export const LOOKUP_MODEL = "gpt-4o-mini"; // cheap NL -> structured-params parse

let _client: OpenAI | null = null;
export function openai(): OpenAI {
  if (!_client) _client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  return _client;
}

export async function embed(text: string): Promise<number[]> {
  const res = await openai().embeddings.create({
    model: EMBEDDING_MODEL,
    input: text,
  });
  return res.data[0].embedding;
}

export async function embedBatch(texts: string[]): Promise<number[][]> {
  const res = await openai().embeddings.create({
    model: EMBEDDING_MODEL,
    input: texts,
  });
  return res.data.map((d) => d.embedding);
}

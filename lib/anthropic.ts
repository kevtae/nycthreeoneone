import Anthropic from "@anthropic-ai/sdk";
import { env } from "./env";

// Per-task models, tuned for a free high-volume public tool:
//   classify = pick-from-5 → Haiku (cheapest, fast)
//   answer   = grounded Q&A synthesis → Sonnet (better prose, still affordable)
// Bump either toward claude-opus-4-7 if quality needs it.
export const CLASSIFY_MODEL = "claude-haiku-4-5";
export const ANSWER_MODEL = "claude-sonnet-4-6";

// General default for other routes (e.g. prep drafting in Phase 5).
export const CLAUDE_MODEL = "claude-sonnet-4-6";

let _client: Anthropic | null = null;
export function anthropic(): Anthropic {
  if (!_client) _client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  return _client;
}

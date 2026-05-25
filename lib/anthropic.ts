import Anthropic from "@anthropic-ai/sdk";
import { env } from "./env";

// Claude model for generation (classification pick, Q&A synthesis, prep drafting).
// Default is the most capable model. For a high-volume free public tool, cost
// may warrant switching to "claude-haiku-4-5" (classify) or "claude-sonnet-4-6"
// (Q&A) — change this one constant. See the cost note in the build summary.
export const CLAUDE_MODEL = "claude-opus-4-7";

let _client: Anthropic | null = null;
export function anthropic(): Anthropic {
  if (!_client) _client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  return _client;
}

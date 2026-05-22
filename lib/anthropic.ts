import Anthropic from "@anthropic-ai/sdk";
import { env } from "./env";

// Claude model for generation (classification pick, Q&A synthesis, prep drafting).
// Sonnet balances quality and cost for a free public tool; cheaper paths can
// switch to Haiku. NOTE: when the real generation logic lands (Phases 2–3),
// follow the claude-api skill — add prompt caching and tool use there.
export const CLAUDE_MODEL = "claude-sonnet-4-6";

let _client: Anthropic | null = null;
export function anthropic(): Anthropic {
  if (!_client) _client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  return _client;
}

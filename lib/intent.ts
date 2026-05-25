import { openai, ROUTER_MODEL } from "./openai";

// Intent router: classify a chat message into one of three capabilities.
//   file   -> report a problem (classify -> deep-link)
//   ask    -> question about how a 311 service works
//   lookup -> status of a specific request, or stats/trends of complaints

export type Intent = "file" | "ask" | "lookup";

const SYSTEM = `Classify the resident's message into exactly one intent:
- "file": they want to report a problem or complaint (noise, pothole, no heat, illegal parking, etc.).
- "ask": a how-to / eligibility / process question about a NYC 311 service.
- "lookup": checking the status of a specific service request, or asking for counts/statistics/trends of complaints (e.g. "how many ... near me").`;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: { intent: { type: "string", enum: ["file", "ask", "lookup"] } },
  required: ["intent"],
} as const;

export async function classifyIntent(message: string): Promise<Intent> {
  const completion = await openai().chat.completions.create({
    model: ROUTER_MODEL,
    max_tokens: 16,
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: message },
    ],
    response_format: { type: "json_schema", json_schema: { name: "intent", strict: true, schema: SCHEMA } },
  });
  const raw = completion.choices[0]?.message.content;
  if (!raw) return "ask"; // safe default
  return (JSON.parse(raw) as { intent: Intent }).intent;
}

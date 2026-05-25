import { openai, ROUTER_MODEL } from "./openai";

// One cheap call does three things: classify intent, detect language, and
// translate the message to English (for retrieval + processing).
//   file   -> report a problem (classify -> deep-link)
//   ask    -> question about how a 311 service works
//   lookup -> status of a specific request, or stats/trends of complaints

export type Intent = "file" | "ask" | "lookup";
export type Analysis = {
  intent: Intent;
  languageName: string;
  isEnglish: boolean;
  englishText: string;
};

const SYSTEM = `Analyze the resident's message about NYC 311. Return:
- intent: "file" (report a problem/complaint), "ask" (a how-to / eligibility / process question), or "lookup" (status of a specific service request, or counts/statistics/trends).
- language_name: the language the message is written in (e.g. "English", "Spanish", "Chinese", "Bengali").
- is_english: true only if the message is written in English.
- english_text: the message in English. If it is already English, copy it verbatim. Otherwise translate it faithfully and completely.`;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    intent: { type: "string", enum: ["file", "ask", "lookup"] },
    language_name: { type: "string" },
    is_english: { type: "boolean" },
    english_text: { type: "string" },
  },
  required: ["intent", "language_name", "is_english", "english_text"],
} as const;

export async function analyzeMessage(message: string): Promise<Analysis> {
  const completion = await openai().chat.completions.create({
    model: ROUTER_MODEL,
    max_tokens: 1024,
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: message },
    ],
    response_format: { type: "json_schema", json_schema: { name: "analysis", strict: true, schema: SCHEMA } },
  });
  const raw = completion.choices[0]?.message.content;
  if (!raw) return { intent: "ask", languageName: "English", isEnglish: true, englishText: message };
  const p = JSON.parse(raw) as {
    intent: Intent;
    language_name: string;
    is_english: boolean;
    english_text: string;
  };
  return {
    intent: p.intent,
    languageName: p.language_name || "English",
    isEnglish: p.is_english,
    englishText: p.english_text || message,
  };
}

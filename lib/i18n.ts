import { openai, ROUTER_MODEL } from "./openai";

// Translate a set of user-facing strings into the target language in one call.
// Preserves markdown links, NYC agency names/acronyms, and phone numbers.
export async function translateFields(
  fields: Record<string, string>,
  languageName: string,
): Promise<Record<string, string>> {
  const obj = Object.fromEntries(Object.entries(fields).filter(([, v]) => v && v.trim()));
  if (Object.keys(obj).length === 0) return {};

  const completion = await openai().chat.completions.create({
    model: ROUTER_MODEL,
    max_tokens: 2000,
    messages: [
      {
        role: "system",
        content: `Translate each string VALUE of the given JSON object into ${languageName}. Keep the keys unchanged. Preserve any markdown links [text](url) — keep the URL and link structure intact (you may translate the visible link text). Keep proper nouns, NYC agency names/acronyms (NYPD, DSNY, HPD, DOB, DEP, etc.), and phone numbers unchanged. Return ONLY a JSON object with the same keys and translated values.`,
      },
      { role: "user", content: JSON.stringify(obj) },
    ],
    response_format: { type: "json_object" },
  });

  const raw = completion.choices[0]?.message.content;
  if (!raw) return obj;
  try {
    return { ...obj, ...(JSON.parse(raw) as Record<string, string>) };
  } catch {
    return obj;
  }
}

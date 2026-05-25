import { NextRequest, NextResponse } from "next/server";
import { analyzeMessage } from "@/lib/intent";
import { translateFields } from "@/lib/i18n";
import { classifyComplaint, type ClassifyResult } from "@/lib/classify";
import { answerQuestion, type AnswerResult } from "@/lib/answer";
import { lookupRequests } from "@/lib/lookup";
import { createConversation, logMessage, logEvent, caidFromUrl } from "@/lib/log";

export const runtime = "nodejs";
export const maxDuration = 30;

// Phase 4 + 7 — Intent router, conversation logging, and multilingual.
// One call classifies intent + detects language + translates to English. The
// pipeline runs in English (best retrieval); user-facing output is translated
// back to the resident's language. For "file", the English text to paste into
// the official 311 form is returned alongside the localized guidance.
//
// Logging is anonymous and best-effort: a logging failure never blocks a reply.

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const message: unknown = body.message;
  if (!message || typeof message !== "string") {
    return NextResponse.json({ error: "Missing 'message' string." }, { status: 400 });
  }
  const sessionId = typeof body.session_id === "string" ? body.session_id : null;

  // Analyze: intent + language + English translation (one cheap call).
  const a = await analyzeMessage(message);
  const intent = a.intent;
  const proc = a.englishText; // English for retrieval/processing

  // Resolve/create the conversation (best-effort).
  let convId: string | null = typeof body.conversation_id === "string" ? body.conversation_id : null;
  if (!convId) {
    try {
      convId = await createConversation(sessionId, a.languageName);
    } catch {
      convId = null;
    }
  }
  if (convId) {
    try {
      await logMessage(convId, "user", message, intent);
    } catch {}
  }

  // Dispatch (in English).
  let result: Record<string, unknown>;
  let summary = "";
  try {
    if (intent === "file") {
      const r = await classifyComplaint(proc);
      result = r as unknown as Record<string, unknown>;
      summary = r.explanation;
    } else if (intent === "lookup") {
      const r = await lookupRequests(proc);
      result = r;
      summary = r.summary;
    } else {
      const r = await answerQuestion(proc);
      result = r as unknown as Record<string, unknown>;
      summary = r.answer;
    }
  } catch (e) {
    return NextResponse.json(
      { conversation_id: convId, intent, language: a.languageName, error: (e as Error).message },
      { status: 502 },
    );
  }

  // Localize user-facing output if the resident wrote in another language.
  if (!a.isEnglish) {
    try {
      if (intent === "file") {
        const r = result as unknown as ClassifyResult;
        const t = await translateFields(
          { explanation: r.explanation ?? "", clarifying_question: r.clarifying_question ?? "" },
          a.languageName,
        );
        result = {
          ...result,
          explanation: t.explanation ?? r.explanation,
          clarifying_question: t.clarifying_question ?? r.clarifying_question,
          english_text: proc, // paste this into the official (English) 311 form
        };
      } else if (intent === "ask") {
        const r = result as unknown as AnswerResult;
        const t = await translateFields({ answer: r.answer }, a.languageName);
        result = { ...result, answer: t.answer ?? r.answer };
      } else {
        const t = await translateFields(
          { summary: String(result.summary ?? ""), caveat: String(result.caveat ?? "") },
          a.languageName,
        );
        result = { ...result, summary: t.summary ?? result.summary, caveat: t.caveat ?? result.caveat };
      }
    } catch {
      // translation failed — return the English result rather than nothing
    }
  }

  // Log assistant turn + attribution event (English summary, best-effort).
  if (convId) {
    try {
      await logMessage(convId, "assistant", summary, intent);
      if (intent === "file") {
        const m = (result as unknown as ClassifyResult).match;
        await logEvent(convId, "classified", m ? { ka: m.ka, caid: caidFromUrl(m.entry_url) } : {});
      } else {
        await logEvent(convId, intent === "lookup" ? "looked_up" : "answered", {});
      }
    } catch {}
  }

  return NextResponse.json({ conversation_id: convId, intent, language: a.languageName, result });
}

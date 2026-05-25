import { NextRequest, NextResponse } from "next/server";
import { classifyIntent } from "@/lib/intent";
import { classifyComplaint } from "@/lib/classify";
import { answerQuestion } from "@/lib/answer";
import { lookupRequests } from "@/lib/lookup";
import { createConversation, logMessage, logEvent, caidFromUrl } from "@/lib/log";

export const runtime = "nodejs";
export const maxDuration = 30;

// Phase 4 — Intent router + conversation logging.
// Single front door: classify intent (file | ask | lookup) -> dispatch to the
// matching capability -> log the turn (anonymous). Returns the conversation_id
// so the client can keep posting to the same conversation.
//
// Logging is best-effort: a logging failure never blocks the user's answer.

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const message: unknown = body.message;
  if (!message || typeof message !== "string") {
    return NextResponse.json({ error: "Missing 'message' string." }, { status: 400 });
  }
  const sessionId = typeof body.session_id === "string" ? body.session_id : null;
  const lang = typeof body.lang === "string" ? body.lang : null;

  // Resolve/create the conversation (best-effort).
  let convId: string | null = typeof body.conversation_id === "string" ? body.conversation_id : null;
  if (!convId) {
    try {
      convId = await createConversation(sessionId, lang);
    } catch {
      convId = null; // logging unavailable — proceed without it
    }
  }

  const intent = await classifyIntent(message);
  if (convId) {
    try {
      await logMessage(convId, "user", message, intent);
    } catch {}
  }

  // Dispatch.
  let result: unknown;
  let summary = "";
  try {
    if (intent === "file") {
      const r = await classifyComplaint(message);
      result = r;
      summary = r.explanation;
    } else if (intent === "lookup") {
      const r = await lookupRequests(message);
      result = r;
      summary = r.summary;
    } else {
      const r = await answerQuestion(message);
      result = r;
      summary = r.answer;
    }
  } catch (e) {
    return NextResponse.json(
      { conversation_id: convId, intent, error: (e as Error).message },
      { status: 502 },
    );
  }

  // Log the assistant turn + an attribution event (best-effort).
  if (convId) {
    try {
      await logMessage(convId, "assistant", summary, intent);
      if (intent === "file") {
        const m = (result as { match: { ka: string; entry_url: string } | null }).match;
        await logEvent(convId, "classified", m ? { ka: m.ka, caid: caidFromUrl(m.entry_url) } : {});
      } else {
        await logEvent(convId, intent === "lookup" ? "looked_up" : "answered", {});
      }
    } catch {}
  }

  return NextResponse.json({ conversation_id: convId, intent, result });
}

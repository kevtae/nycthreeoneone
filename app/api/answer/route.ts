import { NextRequest, NextResponse } from "next/server";
import { answerQuestion } from "@/lib/answer";

export const runtime = "nodejs";
export const maxDuration = 30;

// Phase 3 — Q&A (RAG). Thin wrapper over lib/answer.
export async function POST(req: NextRequest) {
  const { question } = await req.json().catch(() => ({}));
  if (!question || typeof question !== "string") {
    return NextResponse.json({ error: "Missing 'question' string." }, { status: 400 });
  }
  try {
    return NextResponse.json(await answerQuestion(question));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}

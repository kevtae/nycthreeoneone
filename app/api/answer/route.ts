import { NextRequest, NextResponse } from "next/server";

// Q&A / RAG (Phase 3): embed question -> pgvector top-K over `knowledge_chunks`
// -> Claude answers from the retrieved chunks only, citing the preserved links.
export async function POST(req: NextRequest) {
  const { question } = await req.json().catch(() => ({}));
  return NextResponse.json({
    ok: false,
    todo: "Phase 3: retrieve knowledge chunks -> grounded answer + citations",
    question: question ?? null,
  });
}

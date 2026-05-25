import { NextRequest, NextResponse } from "next/server";
import { classifyComplaint } from "@/lib/classify";

export const runtime = "nodejs";
export const maxDuration = 30;

// Phase 2 — Filing classifier. Thin wrapper over lib/classify.
export async function POST(req: NextRequest) {
  const { query } = await req.json().catch(() => ({}));
  if (!query || typeof query !== "string") {
    return NextResponse.json({ error: "Missing 'query' string." }, { status: 400 });
  }
  try {
    return NextResponse.json(await classifyComplaint(query));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}

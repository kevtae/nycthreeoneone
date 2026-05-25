import { NextRequest, NextResponse } from "next/server";
import { lookupRequests } from "@/lib/lookup";

export const runtime = "nodejs";
export const maxDuration = 30;

// Phase 6 — Lookup (Socrata). Thin wrapper over lib/lookup.
export async function POST(req: NextRequest) {
  const { query } = await req.json().catch(() => ({}));
  if (!query || typeof query !== "string") {
    return NextResponse.json({ error: "Missing 'query' string." }, { status: 400 });
  }
  try {
    return NextResponse.json(await lookupRequests(query));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}

import { NextRequest, NextResponse } from "next/server";

// Lookup (Phase 6): NL -> SoQL against Socrata erm2-nwe9 for status and
// neighborhood trends. Caveats: closed != resolved, duplicates, ~daily lag.
export async function POST(req: NextRequest) {
  const { query } = await req.json().catch(() => ({}));
  return NextResponse.json({
    ok: false,
    todo: "Phase 6: Socrata SoQL for status + neighborhood trends",
    query: query ?? null,
  });
}

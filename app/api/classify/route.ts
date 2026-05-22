import { NextRequest, NextResponse } from "next/server";

// Filing classifier (Phase 2): embed query -> pgvector top-5 over `catalog`
// -> Claude picks the best report option, explains, asks a disambiguating
// question if needed -> returns { title, agency, entry_url }.
export async function POST(req: NextRequest) {
  const { query } = await req.json().catch(() => ({}));
  return NextResponse.json({
    ok: false,
    todo: "Phase 2: classify free-text -> report option + deep-link",
    query: query ?? null,
  });
}

import { NextRequest, NextResponse } from "next/server";

// Intent router (Phase 4): tool-calling front door that decides per message
// whether to file (classify), ask (answer), or lookup (Socrata), and logs the
// conversation to Supabase.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  return NextResponse.json({
    ok: false,
    todo: "Phase 4: intent router (file | ask | lookup) + conversation logging",
    received: body,
  });
}

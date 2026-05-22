import { NextRequest, NextResponse } from "next/server";

// Complaint prep (Phase 5): Claude drafts a paste-ready description + required-
// field checklist + portal path for the chosen report option.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  return NextResponse.json({
    ok: false,
    todo: "Phase 5: draft paste-ready complaint + required fields + portal path",
    received: body,
  });
}

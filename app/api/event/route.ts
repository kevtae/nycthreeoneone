import { NextRequest, NextResponse } from "next/server";
import { logEvent } from "@/lib/log";

export const runtime = "nodejs";

// Phase 4 — client-side event logging (e.g. the UI fires this when the resident
// clicks through to the official 311 form). Best-effort analytics.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { conversation_id, type, ka, caid, deep_link_clicked } = body;
  if (typeof conversation_id !== "string" || typeof type !== "string") {
    return NextResponse.json({ error: "Need 'conversation_id' and 'type'." }, { status: 400 });
  }
  try {
    await logEvent(conversation_id, type, {
      ka: ka ?? null,
      caid: caid ?? null,
      deep_link_clicked: deep_link_clicked ?? null,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { openai, LOOKUP_MODEL } from "@/lib/openai";
import { soql, esc, BOROUGHS } from "@/lib/socrata";

export const runtime = "nodejs";
export const maxDuration = 30;

// Phase 6 — Lookup (NYC Open Data / Socrata erm2-nwe9).
// NL -> structured params (one cheap LLM call) -> deterministic, sanitized SoQL
// -> { status record } or { trend counts } + templated summary.
//
// Data caveats surfaced to the user: "Closed" = the agency's disposition, not
// proof the problem was fixed; counts may include duplicate reports; the dataset
// updates roughly daily, so very recent requests may lag.

type Params = {
  kind: "status" | "trends";
  sr_number: string | null;
  complaint_keyword: string | null;
  zip: string | null;
  borough: string | null;
  days: number;
};

const EXTRACT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    kind: { type: "string", enum: ["status", "trends"] },
    sr_number: { type: ["string", "null"], description: "A specific 311 service request number, if referenced." },
    complaint_keyword: { type: ["string", "null"], description: "Kind of complaint, e.g. 'noise', 'rat', 'pothole'." },
    zip: { type: ["string", "null"], description: "5-digit ZIP if present." },
    borough: {
      type: ["string", "null"],
      enum: ["MANHATTAN", "BRONX", "BROOKLYN", "QUEENS", "STATEN ISLAND", null],
    },
    days: { type: "integer", description: "Time window in days; default 90 if unspecified." },
  },
  required: ["kind", "sr_number", "complaint_keyword", "zip", "borough", "days"],
} as const;

const CAVEAT =
  '"Closed" reflects the agency\'s disposition, not proof the issue was fixed. Counts may include duplicate reports, and the dataset updates roughly daily.';

export async function POST(req: NextRequest) {
  const { query } = await req.json().catch(() => ({}));
  if (!query || typeof query !== "string") {
    return NextResponse.json({ error: "Missing 'query' string." }, { status: 400 });
  }

  // 1. Extract structured params.
  const completion = await openai().chat.completions.create({
    model: LOOKUP_MODEL,
    max_tokens: 256,
    messages: [
      {
        role: "system",
        content:
          "Extract structured lookup parameters from a resident's question about NYC 311 service requests. kind='status' only if a specific service-request number is referenced; otherwise 'trends'. days defaults to 90 when unspecified.",
      },
      { role: "user", content: query },
    ],
    response_format: {
      type: "json_schema",
      json_schema: { name: "lookup_params", strict: true, schema: EXTRACT_SCHEMA },
    },
  });
  const raw = completion.choices[0]?.message.content;
  if (!raw) return NextResponse.json({ error: "Could not parse the lookup." }, { status: 502 });
  const p = JSON.parse(raw) as Params;

  // 2. Sanitize.
  const days = Math.min(Math.max(Math.round(p.days || 90), 1), 365);
  const zip = p.zip && /^\d{5}$/.test(p.zip) ? p.zip : null;
  const borough = p.borough && (BOROUGHS as readonly string[]).includes(p.borough) ? p.borough : null;
  const keyword = p.complaint_keyword ? p.complaint_keyword.replace(/[^a-zA-Z /-]/g, "").trim() : "";

  try {
    // --- Status of a specific SR# ---
    if (p.kind === "status" && p.sr_number) {
      const sr = p.sr_number.replace(/[^a-zA-Z0-9-]/g, "");
      const rows = await soql({
        $select:
          "unique_key, created_date, closed_date, agency_name, complaint_type, descriptor, status, resolution_description, borough, incident_address",
        $where: `unique_key='${esc(sr)}'`,
        $limit: "1",
      });
      if (rows.length === 0) {
        return NextResponse.json({
          kind: "status",
          record: null,
          summary: `No service request found with number ${sr}. Double-check it, or look it up on the official 311 status checker.`,
        });
      }
      const r = rows[0];
      const opened = (r.created_date || "").slice(0, 10);
      const closed = r.closed_date ? (r.closed_date as string).slice(0, 10) : null;
      return NextResponse.json({
        kind: "status",
        record: r,
        summary:
          `SR ${r.unique_key} — ${r.complaint_type}${r.descriptor ? ` (${r.descriptor})` : ""}, handled by ${r.agency_name}. ` +
          `Status: ${r.status}. Opened ${opened}${closed ? `, closed ${closed}` : ""}.` +
          (r.resolution_description ? ` Resolution: ${r.resolution_description}` : ""),
        caveat: CAVEAT,
        status_lookup_url: "https://portal.311.nyc.gov/check-status/",
      });
    }

    // --- Trends / counts ---
    const cutoff = new Date(Date.now() - days * 86400000).toISOString().slice(0, 19);
    const filters = [`created_date > '${cutoff}'`];
    if (keyword) filters.push(`upper(complaint_type) like '%${esc(keyword.toUpperCase())}%'`);
    if (zip) filters.push(`incident_zip='${zip}'`);
    if (borough) filters.push(`borough='${borough}'`);
    const where = filters.join(" AND ");

    const [totalRows, byStatus, topTypes] = await Promise.all([
      soql({ $select: "count(*) as n", $where: where }),
      soql({ $select: "status, count(*) as n", $where: where, $group: "status", $order: "n DESC" }),
      keyword
        ? Promise.resolve([])
        : soql({
            $select: "complaint_type, count(*) as n",
            $where: where,
            $group: "complaint_type",
            $order: "n DESC",
            $limit: "5",
          }),
    ]);

    const total = parseInt(totalRows[0]?.n ?? "0", 10);
    const where_label =
      [keyword ? `${keyword.toLowerCase()} ` : "", "311 complaints"].join("") +
      (zip ? ` in ${zip}` : borough ? ` in ${borough}` : " citywide");
    const openN = byStatus
      .filter((s) => /open|progress|pending|assigned|started/i.test(s.status || ""))
      .reduce((a, s) => a + parseInt(s.n, 10), 0);

    return NextResponse.json({
      kind: "trends",
      filters: { keyword: keyword || null, zip, borough, days },
      total,
      by_status: byStatus.map((s) => ({ status: s.status || "(unspecified)", count: parseInt(s.n, 10) })),
      top_types: topTypes.map((t) => ({ complaint_type: t.complaint_type, count: parseInt(t.n, 10) })),
      summary:
        total === 0
          ? `No ${where_label} found in the last ${days} days.`
          : `${total.toLocaleString()} ${where_label} in the last ${days} days` +
            (openN ? `, of which ~${openN.toLocaleString()} are still open.` : "."),
      caveat: CAVEAT,
    });
  } catch (e) {
    return NextResponse.json({ error: `Lookup failed: ${(e as Error).message}` }, { status: 502 });
  }
}

// NYC Open Data — 311 Service Requests (dataset erm2-nwe9).
// Public SoQL endpoint; no key required for light use. An optional app token
// (SOCRATA_APP_TOKEN) raises rate limits if set.
const BASE = "https://data.cityofnewyork.us/resource/erm2-nwe9.json";

export async function soql(params: Record<string, string>): Promise<Record<string, string>[]> {
  const url = `${BASE}?${new URLSearchParams(params).toString()}`;
  const headers: Record<string, string> = { accept: "application/json" };
  if (process.env.SOCRATA_APP_TOKEN) headers["X-App-Token"] = process.env.SOCRATA_APP_TOKEN;
  const res = await fetch(url, { headers });
  if (!res.ok) {
    throw new Error(`Socrata ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  return res.json();
}

// SoQL string-literal escaping: double single-quotes.
export const esc = (s: string) => s.replace(/'/g, "''");

export const BOROUGHS = ["MANHATTAN", "BRONX", "BROOKLYN", "QUEENS", "STATEN ISLAND"] as const;

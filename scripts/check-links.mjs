// Link-health check: verify each catalog deep-link's caid still appears on its
// 311 article page. The portal regenerates caid/kasid GUIDs on updates, so a
// missing caid means a stale deep-link — time to re-harvest + re-seed.
//
// Run: node scripts/check-links.mjs   (exits non-zero if any stale/errored)
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = join(__dirname, "..", "data");
const BASE = "https://portal.311.nyc.gov/article/?kanumber=";
const CONCURRENCY = 6;

const catalog = JSON.parse(readFileSync(join(DATA, "catalog.json"), "utf8"));
const byKa = new Map(); // ka -> Set<caid>
for (const r of catalog) {
  if (!byKa.has(r.ka)) byKa.set(r.ka, new Set());
  byKa.get(r.ka).add(r.caid);
}
const kas = [...byKa.keys()];

let ok = 0, stale = 0, errors = 0;
const problems = [];

async function check(ka) {
  try {
    const res = await fetch(BASE + ka, { headers: { "User-Agent": "nyc311-linkcheck" } });
    if (!res.ok) {
      errors++; problems.push(`${ka}: HTTP ${res.status}`); return;
    }
    const html = await res.text();
    const missing = [...byKa.get(ka)].filter((caid) => !html.includes(caid));
    if (missing.length) { stale++; problems.push(`${ka}: ${missing.length} stale caid(s)`); }
    else ok++;
  } catch (e) {
    errors++; problems.push(`${ka}: ${e.message}`);
  }
}

let i = 0;
async function worker() {
  while (i < kas.length) {
    const k = kas[i++];
    await check(k);
    if (i % 50 === 0) process.stdout.write(`  checked ${i}/${kas.length}\r`);
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));
process.stdout.write("\n");

console.log(`articles checked: ${kas.length}`);
console.log(`  ok:     ${ok}`);
console.log(`  stale:  ${stale}  (deep-link caid no longer on the article)`);
console.log(`  errors: ${errors}`);
if (problems.length) {
  console.log("\nproblems:");
  for (const p of problems.slice(0, 30)) console.log("  " + p);
  if (problems.length > 30) console.log(`  …and ${problems.length - 30} more`);
}
process.exit(stale + errors > 0 ? 1 : 0);

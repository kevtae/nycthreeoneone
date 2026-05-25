// Log retention: delete conversations older than RETENTION_DAYS (default 90).
// messages and events cascade via their foreign keys. Run on a schedule.
//
// Run: node scripts/prune-logs.mjs [days]
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

function loadEnv(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = line.match(/^\s*([\w.]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    const v = m[2].replace(/^["']|["']$/g, "");
    if (!(m[1] in process.env)) process.env[m[1]] = v;
  }
}
loadEnv(join(ROOT, ".env"));
loadEnv(join(ROOT, ".env.local"));

const days = parseInt(process.env.RETENTION_DAYS || process.argv[2] || "90", 10);
const cutoff = new Date(Date.now() - days * 86400000).toISOString();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env");
  process.exit(1);
}
const supabase = createClient(url, key, { auth: { persistSession: false } });

const { data, error } = await supabase
  .from("conversations")
  .delete()
  .lt("created_at", cutoff)
  .select("id");

if (error) {
  console.error("prune failed:", error.message);
  process.exit(1);
}
console.log(`deleted ${data.length} conversation(s) older than ${days} days (messages/events cascade).`);

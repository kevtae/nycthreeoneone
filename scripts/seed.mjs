// Seed catalog + knowledge_chunks into Supabase via the REST client (supabase-js).
// No DATABASE_URL needed — uses NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
// Idempotent: clears each table, then bulk-inserts in batches.
//
// Prereq: run the migrations in supabase/migrations/ first (SQL editor).
// Run:    node scripts/seed.mjs
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const DATA = join(ROOT, "data");

// Minimal .env loader (avoids a Node-version dependency on --env-file).
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

const EMBED_MODEL = "text-embedding-3-small";
const EMBED_BATCH = 200; // OpenAI inputs per embeddings request
const INSERT_BATCH = 100; // rows per Supabase insert (keeps payloads small)

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env");
  process.exit(1);
}
const supabase = createClient(url, key, { auth: { persistSession: false } });
const openai = new OpenAI(); // OPENAI_API_KEY from env

const load = (f) => JSON.parse(readFileSync(join(DATA, f), "utf8"));

async function embedAll(texts) {
  const out = [];
  for (let i = 0; i < texts.length; i += EMBED_BATCH) {
    const res = await openai.embeddings.create({
      model: EMBED_MODEL,
      input: texts.slice(i, i + EMBED_BATCH),
    });
    for (const d of res.data) out.push(d.embedding);
    process.stdout.write(`  embedded ${Math.min(i + EMBED_BATCH, texts.length)}/${texts.length}\r`);
  }
  process.stdout.write("\n");
  return out;
}

async function clearTable(table) {
  const { error } = await supabase.from(table).delete().gte("id", 0);
  if (error) throw new Error(`clear ${table}: ${error.message}`);
}

async function insertAll(table, rows) {
  for (let i = 0; i < rows.length; i += INSERT_BATCH) {
    const { error } = await supabase.from(table).insert(rows.slice(i, i + INSERT_BATCH));
    if (error) throw new Error(`insert ${table} @${i}: ${error.message}`);
    process.stdout.write(`  inserted ${Math.min(i + INSERT_BATCH, rows.length)}/${rows.length}\r`);
  }
  process.stdout.write("\n");
}

async function seedCatalog() {
  const rows = load("catalog.json");
  const texts = rows.map((r) => `${r.title} — ${r.label || ""} (${r.agency || ""})`);
  const embs = await embedAll(texts);
  const records = rows.map((r, i) => ({
    ka: r.ka, title: r.title, label: r.label ?? null, agency: r.agency ?? null,
    caid: r.caid, kasid: r.kasid, entry_url: r.entry_url, embedding: embs[i],
  }));
  await clearTable("catalog");
  await insertAll("catalog", records);
  console.log(`catalog: ${records.length} rows`);
}

async function seedChunks() {
  const rows = load("chunks.json");
  const texts = rows.map((r) => `${r.title}\n${r.section || ""}\n${r.body}`);
  const embs = await embedAll(texts);
  const records = rows.map((r, i) => ({
    ka: r.ka, title: r.title, section: r.section ?? null, body: r.body,
    links: r.links ?? [], embedding: embs[i],
  }));
  await clearTable("knowledge_chunks");
  await insertAll("knowledge_chunks", records);
  console.log(`knowledge_chunks: ${records.length} rows`);
}

console.log("seeding catalog...");
await seedCatalog();
console.log("seeding knowledge_chunks...");
await seedChunks();
console.log("done.");

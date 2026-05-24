"""
Embed the catalog + knowledge chunks and load them into Supabase pgvector.

Idempotent: truncates and reloads the two static tables, so re-running after a
re-harvest / re-chunk gives a clean state. Uses a direct Postgres connection
(efficient for bulk vector inserts) and the OpenAI embeddings API.

Prereqs:
  pip install openai "psycopg[binary]"
  export OPENAI_API_KEY=...
  export DATABASE_URL=postgresql://...   # Supabase: Project Settings -> Database

Usage:  python3 scripts/seed.py
"""
import json, os, sys
import psycopg
from openai import OpenAI

DATA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data")
MODEL = "text-embedding-3-small"          # 1536-dim; must match the vector() columns
BATCH = 200

client = OpenAI()  # reads OPENAI_API_KEY


def embed_all(texts):
    out = []
    for i in range(0, len(texts), BATCH):
        batch = texts[i:i + BATCH]
        res = client.embeddings.create(model=MODEL, input=batch)
        out.extend(d.embedding for d in res.data)
        print(f"  embedded {min(i + BATCH, len(texts))}/{len(texts)}", flush=True)
    return out


def vec(e):
    return "[" + ",".join(f"{x:.7f}" for x in e) + "]"   # pgvector text literal


def seed_catalog(cur):
    rows = json.load(open(f"{DATA}/catalog.json"))
    texts = [f"{r['title']} — {r.get('label') or ''} ({r.get('agency') or ''})" for r in rows]
    embs = embed_all(texts)
    cur.execute("truncate catalog restart identity")
    with cur.copy(
        "copy catalog (ka, title, label, agency, caid, kasid, entry_url, embedding) from stdin"
    ) as cp:
        for r, e in zip(rows, embs):
            cp.write_row((r["ka"], r["title"], r.get("label"), r.get("agency"),
                          r["caid"], r["kasid"], r["entry_url"], vec(e)))
    print(f"catalog: {len(rows)} rows")


def seed_chunks(cur):
    rows = json.load(open(f"{DATA}/chunks.json"))
    # embed with title + section context so the vector carries topic
    texts = [f"{r['title']}\n{r.get('section') or ''}\n{r['body']}" for r in rows]
    embs = embed_all(texts)
    cur.execute("truncate knowledge_chunks restart identity")
    with cur.copy(
        "copy knowledge_chunks (ka, title, section, body, links, embedding) from stdin"
    ) as cp:
        for r, e in zip(rows, embs):
            cp.write_row((r["ka"], r["title"], r.get("section"), r["body"],
                          json.dumps(r["links"]), vec(e)))
    print(f"knowledge_chunks: {len(rows)} rows")


def main():
    dsn = os.environ.get("DATABASE_URL")
    if not dsn:
        sys.exit("Set DATABASE_URL (Supabase Postgres connection string).")
    with psycopg.connect(dsn) as conn:
        with conn.cursor() as cur:
            print("seeding catalog..."); seed_catalog(cur)
            print("seeding knowledge_chunks..."); seed_chunks(cur)
        conn.commit()
    print("done.")


if __name__ == "__main__":
    main()

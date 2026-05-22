-- NYC 311 Quick-File — initial schema
-- pgvector dim = 1536 (OpenAI text-embedding-3-small).

create extension if not exists vector;

-- ---------- static data (seeded from data/*.json + embeddings) ----------

-- Fileable report options (one row per createServiceRequest option).
create table if not exists catalog (
  id         bigint generated always as identity primary key,
  ka         text not null,
  title      text not null,
  label      text,
  agency     text,
  caid       text not null,
  kasid      text not null,
  entry_url  text not null,
  embedding  vector(1536),
  created_at timestamptz not null default now(),
  unique (caid, kasid)
);

-- Knowledge corpus, chunked by section, for Q&A retrieval.
create table if not exists knowledge_chunks (
  id         bigint generated always as identity primary key,
  ka         text not null,
  title      text not null,
  section    text,
  body       text not null,
  links      jsonb not null default '[]'::jsonb,
  embedding  vector(1536),
  created_at timestamptz not null default now()
);

-- HNSW indexes for cosine similarity search.
create index if not exists catalog_embedding_idx
  on catalog using hnsw (embedding vector_cosine_ops);
create index if not exists knowledge_chunks_embedding_idx
  on knowledge_chunks using hnsw (embedding vector_cosine_ops);
create index if not exists knowledge_chunks_ka_idx on knowledge_chunks (ka);

-- ---------- analytics (anonymous; see privacy notes in nyc-311-plan.md) ----------

create table if not exists conversations (
  id         uuid primary key default gen_random_uuid(),
  session_id text,
  lang       text,
  created_at timestamptz not null default now()
);

create table if not exists messages (
  id              bigint generated always as identity primary key,
  conversation_id uuid references conversations(id) on delete cascade,
  role            text not null,            -- 'user' | 'assistant'
  content         text not null,
  intent          text,                     -- 'file' | 'ask' | 'lookup'
  created_at      timestamptz not null default now()
);

create table if not exists events (
  id               bigint generated always as identity primary key,
  conversation_id  uuid references conversations(id) on delete cascade,
  type             text not null,           -- e.g. 'classified', 'deep_link_click'
  ka               text,
  caid             text,
  deep_link_clicked boolean,
  created_at       timestamptz not null default now()
);

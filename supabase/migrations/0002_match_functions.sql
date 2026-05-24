-- Similarity-search RPCs. The app calls these via supabase.rpc(...).
-- Cosine distance (<=>) with the HNSW indexes from 0001; similarity = 1 - distance.

create or replace function match_catalog(
  query_embedding vector(1536),
  match_count int default 5
)
returns table (
  id bigint, ka text, title text, label text, agency text,
  caid text, kasid text, entry_url text, similarity float
)
language sql stable as $$
  select id, ka, title, label, agency, caid, kasid, entry_url,
         1 - (embedding <=> query_embedding) as similarity
  from catalog
  where embedding is not null
  order by embedding <=> query_embedding
  limit match_count;
$$;

create or replace function match_knowledge_chunks(
  query_embedding vector(1536),
  match_count int default 8
)
returns table (
  id bigint, ka text, title text, section text, body text,
  links jsonb, similarity float
)
language sql stable as $$
  select id, ka, title, section, body, links,
         1 - (embedding <=> query_embedding) as similarity
  from knowledge_chunks
  where embedding is not null
  order by embedding <=> query_embedding
  limit match_count;
$$;

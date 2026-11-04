-- ====================================================================
-- Migration 000: what was made by hand in the first Supabase project
-- (never saved in the code, so it was lost with that project on
-- Oct 25, 2026). Run this FIRST in a new project, then 001 to 012.
-- Safe to rerun.
--
--   documents3        the knowledge base: chunks of the uploaded PDFs and
--                     documents (/textIngest → /api/embed), searched by
--                     meaning when the professor answers
--   images2           the picture library (/imageIngest), searched by
--                     meaning when slides are made
--   match_documents3  / match_images2: those searches (closest first)
--   slide-audio       / slide-imagesv2: the storage buckets for the
--                     lessons' recordings and pictures (public: the
--                     lesson plays them straight from their links)
--
-- Everything is read and written by our server only (the service key):
-- row level security is on with no policies, so the public key can't.
-- Embeddings: OpenAI text-embedding-3-small (1536 numbers).
-- ====================================================================

create extension if not exists vector with schema extensions;

create table if not exists public.documents3 (
  id          bigserial primary key,
  content     text not null,
  source      text,                                   -- the uploaded file's name
  metadata    jsonb not null default '{}'::jsonb,
  embedding   extensions.vector(1536),
  created_at  timestamptz not null default now()
);

create table if not exists public.images2 (
  id           bigserial primary key,
  url          text not null,
  description  text,
  embedding    extensions.vector(1536),
  created_at   timestamptz not null default now()
);

alter table public.documents3 enable row level security;
alter table public.images2 enable row level security;

create index if not exists documents3_embedding_idx on public.documents3 using hnsw (embedding extensions.vector_cosine_ops);
create index if not exists images2_embedding_idx on public.images2 using hnsw (embedding extensions.vector_cosine_ops);

-- The closest chunks to a question (similarity: 1 = the same meaning)
create or replace function public.match_documents3(query_embedding extensions.vector(1536), match_count int default 5)
returns table (id bigint, content text, source text, metadata jsonb, similarity double precision)
language sql stable set search_path = public, extensions as $$
  select d.id, d.content, d.source, d.metadata, 1 - (d.embedding <=> query_embedding)
  from public.documents3 d
  where d.embedding is not null
  order by d.embedding <=> query_embedding
  limit least(match_count, 200);
$$;

-- The closest pictures to a description
create or replace function public.match_images2(query_embedding extensions.vector(1536), match_count int default 10)
returns table (id bigint, url text, description text, similarity double precision)
language sql stable set search_path = public, extensions as $$
  select i.id, i.url, i.description, 1 - (i.embedding <=> query_embedding)
  from public.images2 i
  where i.embedding is not null
  order by i.embedding <=> query_embedding
  limit least(match_count, 200);
$$;

-- Our server only
revoke execute on function public.match_documents3(extensions.vector, int) from public, anon, authenticated;
revoke execute on function public.match_images2(extensions.vector, int) from public, anon, authenticated;
grant execute on function public.match_documents3(extensions.vector, int) to service_role;
grant execute on function public.match_images2(extensions.vector, int) to service_role;

-- Storage: public to read (the lesson plays and shows them by link); only the server uploads
insert into storage.buckets (id, name, public)
values ('slide-audio', 'slide-audio', true), ('slide-imagesv2', 'slide-imagesv2', true)
on conflict (id) do update set public = true;

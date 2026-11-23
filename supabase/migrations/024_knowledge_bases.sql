-- ====================================================================
-- 024: knowledge bases (EXPANSION: lessons on any topic)
--
-- Each lesson searches its own sources and pictures, not every lesson's.
-- A knowledge base is a named collection: its source chunks (documents3)
-- and pictures (images2) carry its id. A lesson's profile lists the
-- knowledge bases it uses (lib/canvas/profile.ts knowledgeBases): the blue
-- catfish lesson and its study version share 'blue-catfish'; a new lesson
-- gets its own. Pictures in 'shared' are offered to every lesson.
--
-- Everything already there is the blue catfish lesson's: tagged
-- 'blue-catfish', so nothing changes for it.
--
-- The old searches (match_documents3, match_images2) stay as they were
-- (the live site uses them until this branch is merged); the new ones,
-- match_documents_in and match_images_in, search the given knowledge bases.
-- Safe to run more than once.
-- ====================================================================

-- The knowledge bases
create table if not exists public.knowledge_bases (
  id          text primary key check (id ~ '^[a-z0-9][a-z0-9-]{0,60}$'),
  title       text not null,
  created_at  timestamptz not null default now(),
  created_by  text
);
alter table public.knowledge_bases enable row level security;
insert into public.knowledge_bases (id, title) values
  ('blue-catfish', 'Blue Catfish'),
  ('shared', 'Shared by every lesson (pictures)')
on conflict (id) do nothing;

-- Each chunk and picture: its knowledge base (what's there now: blue catfish)
alter table public.documents3 add column if not exists kb text not null default 'blue-catfish';
alter table public.images2 add column if not exists kb text not null default 'blue-catfish';
create index if not exists documents3_kb_idx on public.documents3 (kb);
create index if not exists images2_kb_idx on public.images2 (kb);

-- Pictures from outside (openly licensed, for lessons on any topic): who made it, its licence, where it came from
alter table public.images2 add column if not exists credit text;
alter table public.images2 add column if not exists license text;
alter table public.images2 add column if not exists source_url text;

-- The closest chunks to a question, in these knowledge bases only
create or replace function public.match_documents_in(query_embedding extensions.vector(1536), match_count int default 5, kbs text[] default array['blue-catfish'])
returns table (id bigint, content text, source text, metadata jsonb, similarity double precision)
language sql stable set search_path = public, extensions as $$
  select d.id, d.content, d.source, d.metadata, 1 - (d.embedding <=> query_embedding)
  from public.documents3 d
  where d.embedding is not null and d.kb = any(kbs)
  order by d.embedding <=> query_embedding
  limit least(match_count, 200);
$$;

-- The closest pictures to a description, in these knowledge bases (and the shared ones)
create or replace function public.match_images_in(query_embedding extensions.vector(1536), match_count int default 10, kbs text[] default array['blue-catfish'])
returns table (id bigint, url text, description text, credit text, license text, similarity double precision)
language sql stable set search_path = public, extensions as $$
  select i.id, i.url, i.description, i.credit, i.license, 1 - (i.embedding <=> query_embedding)
  from public.images2 i
  where i.embedding is not null and (i.kb = any(kbs) or i.kb = 'shared')
  order by i.embedding <=> query_embedding
  limit least(match_count, 200);
$$;

-- Our server only
revoke execute on function public.match_documents_in(extensions.vector, int, text[]) from public, anon, authenticated;
revoke execute on function public.match_images_in(extensions.vector, int, text[]) from public, anon, authenticated;
grant execute on function public.match_documents_in(extensions.vector, int, text[]) to service_role;
grant execute on function public.match_images_in(extensions.vector, int, text[]) to service_role;

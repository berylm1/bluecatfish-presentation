-- Migration 023: errors on people's computers (a crash in the page, the professor not answering), so a broken lesson
-- on a participant's laptop gets noticed. Written by our server only (/api/log-error; RLS on, no policies).
-- Look at them in Supabase: Table Editor -> client_errors, newest first. Safe to rerun.
create table if not exists public.client_errors (
  id           bigserial primary key,
  created_at   timestamptz not null default now(),
  kind         text not null,          -- crash (an error in the page), promise (one nobody caught), tutor (the professor couldn't answer)
  message      text not null,
  detail       text,                   -- where it happened in the code (the stack), cut short
  page         text,                   -- the address, without the query (no ids)
  participant  text,                   -- the study participant's id, when it's a study run
  session      text,                   -- the lesson session (X-Learner-Session)
  browser      text,
  is_test      boolean
);
create index if not exists client_errors_created on public.client_errors (created_at desc);
alter table public.client_errors enable row level security;

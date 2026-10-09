-- Migration 009: the events log is written by our server only.
-- The browser used to write events straight to this table with the public
-- (anon) key, so anyone with that key (it's in every page) could add rows.
-- Events now go through /api/signals/events, which checks each one, applies
-- a rate limit, and writes with the service key (which RLS doesn't apply to).
--
-- Run this in the Supabase SQL editor AFTER the site with that route is live
-- (before it, the old site would lose its events). Safe to rerun.
-- To undo: rerun the "anon can insert events" policy from migration 001.
drop policy if exists "anon can insert events" on public.events;
-- RLS stays on with no policy for anon: anon can neither insert nor read.
alter table public.events enable row level security;

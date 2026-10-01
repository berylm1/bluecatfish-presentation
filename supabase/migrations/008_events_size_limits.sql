-- Migration 008: keep the public events log small and well-formed.
-- The browser writes events straight to this table with the public (anon)
-- key, so anyone can insert rows; these limits stop junk rows from being huge.
-- Run in the Supabase SQL editor. Safe to rerun. Existing rows aren't checked
-- (NOT VALID), only new ones.
alter table public.events drop constraint if exists events_value_size;
alter table public.events add constraint events_value_size
  check (pg_column_size(value) <= 8192) not valid;

alter table public.events drop constraint if exists events_session_id_shape;
alter table public.events add constraint events_session_id_shape
  check (char_length(session_id) between 1 and 64) not valid;

alter table public.events drop constraint if exists events_dwell_range;
alter table public.events add constraint events_dwell_range
  check (dwell_ms is null or (dwell_ms >= 0 and dwell_ms <= 86400000)) not valid;

-- Migration 013: the Security Advisor's warnings on a fresh project
-- "Function Search Path Mutable": each function looks only in public
-- (so nothing put in another schema can stand in for a table it uses).
-- rls_auto_enable(): Supabase's helper for "Enable automatic RLS" (only there
-- when that option was ticked); the database runs it itself, nobody calls it.
-- Safe to rerun.
alter function public.section_stats set search_path = public;
alter function public.put_learner_state set search_path = public;
alter function public.put_learner_state_v3 set search_path = public;
alter function public.study_assign set search_path = public;
do $$ begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end $$;

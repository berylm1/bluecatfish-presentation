-- ====================================================================
-- Migration 010: the AI classmates in learner_state
-- Run after 003. Safe to rerun. Until it's run, the site keeps writing
-- the v2 columns (app/api/signals/state falls back to put_learner_state).
--
--   classmate_turns: times a classmate (Maya, Finn, Leo) spoke up in the
--                    section: at its end, or asking after the learner
--   bank_answers:    the learner's questions answered at once from the
--                    question bank (an answer slide made ahead of time)
-- How often the classmates speak adapts to how often the learner asks
-- (app/presentation/page.tsx classmateBudget); these show what happened.
-- ====================================================================

alter table public.learner_state
  add column if not exists classmate_turns int not null default 0,
  add column if not exists bank_answers    int not null default 0;

create or replace function public.put_learner_state_v3(
  p_session_id        text,
  p_section           int,
  p_seq               bigint,
  p_visits            int,
  p_repeats           int,
  p_simplify_requests int,
  p_confusion_marks   int,
  p_skips             int,
  p_jumps             int,
  p_questions         int,
  p_barge_ins         int,
  p_quiz_misses       int,
  p_quiz_passed       boolean,
  p_self_check        text,
  p_dwell_ms_total    bigint,
  p_last_state        text,
  p_classmate_turns   int,
  p_bank_answers      int
) returns boolean language plpgsql as $$
declare
  written int;
begin
  insert into public.learner_state as ls (
    session_id, section, seq, visits, repeats, simplify_requests, confusion_marks,
    skips, jumps, questions, barge_ins, quiz_misses, quiz_passed, self_check,
    dwell_ms_total, last_state, classmate_turns, bank_answers, updated_at
  ) values (
    p_session_id, p_section, p_seq, p_visits, p_repeats, p_simplify_requests, p_confusion_marks,
    p_skips, p_jumps, p_questions, p_barge_ins, p_quiz_misses, p_quiz_passed, p_self_check,
    p_dwell_ms_total, p_last_state, p_classmate_turns, p_bank_answers, now()
  )
  on conflict (session_id, section) do update set
    seq               = excluded.seq,
    visits            = excluded.visits,
    repeats           = excluded.repeats,
    simplify_requests = excluded.simplify_requests,
    confusion_marks   = excluded.confusion_marks,
    skips             = excluded.skips,
    jumps             = excluded.jumps,
    questions         = excluded.questions,
    barge_ins         = excluded.barge_ins,
    quiz_misses       = excluded.quiz_misses,
    quiz_passed       = excluded.quiz_passed,
    self_check        = excluded.self_check,
    dwell_ms_total    = excluded.dwell_ms_total,
    last_state        = excluded.last_state,
    classmate_turns   = excluded.classmate_turns,
    bank_answers      = excluded.bank_answers,
    updated_at        = now()
  where ls.seq < excluded.seq;

  get diagnostics written = row_count;
  return written > 0;
end;
$$;

revoke all on function public.put_learner_state_v3(text, int, bigint, int, int, int, int, int, int, int, int, int, boolean, text, bigint, text, int, int) from public, anon, authenticated;
grant execute on function public.put_learner_state_v3(text, int, bigint, int, int, int, int, int, int, int, int, int, boolean, text, bigint, text, int, int) to service_role;

-- The per-section review view, with the classmates
create or replace view public.section_difficulty as
select
  section,
  count(*)                                                    as sessions,
  round(avg(dwell_ms_total) / 1000.0, 1)                      as avg_dwell_s,
  round(avg(repeats + simplify_requests + confusion_marks), 2) as avg_help_requests,
  round(avg(skips), 2)                                        as avg_skips,
  round(avg(quiz_misses), 2)                                  as avg_quiz_misses,
  count(*) filter (where last_state = 'confused')             as confused,
  count(*) filter (where last_state = 'frustrated')           as frustrated,
  count(*) filter (where last_state = 'bored')                as bored,
  count(*) filter (where last_state = 'engaged')              as engaged,
  round(avg(questions), 2)                                    as avg_questions,
  round(avg(classmate_turns), 2)                              as avg_classmate_turns,
  round(avg(bank_answers), 2)                                 as avg_bank_answers
from public.learner_state
group by section
order by section;

revoke all on public.section_difficulty from anon, authenticated;
grant select on public.section_difficulty to service_role;

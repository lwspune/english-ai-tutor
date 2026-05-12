-- Phase B of the security-review fix plan. Closes Findings 1, 2, 7.
--
-- Three trust-boundary holes were open:
--   1. Students could INSERT and UPDATE rows in `sessions` directly via the
--      PostgREST API, bypassing analyze-reading entirely. A student in
--      DevTools could set their own score_accuracy=100 without ever speaking.
--   2. `questions.correct_index` was readable by any authenticated client
--      because of a `using (true)` SELECT policy. The frontend code was
--      careful not to fetch it, but a student running `from('questions')
--      .select('correct_index')` got the answer key one query away.
--   3. A defensive `using (true)` policy on passages was checked into
--      migration 001 (already manually dropped in prod, but a fresh
--      checkout would re-introduce it and neutralise the grade-aware
--      policy added in migration 009).
--
-- This migration drops those policies and adds two SECURITY DEFINER RPCs
-- so the legitimate paths (saving vocab-retention answers; reading
-- questions to render the quiz) still work.

-- ─── Drop the policies that allowed direct writes ─────────────────────────────

drop policy if exists "insert session" on sessions;
drop policy if exists "student submit comprehension" on sessions;

-- Drop the policies that exposed too much read access.
drop policy if exists "read questions" on questions;

-- Defensive: drop the orphan permissive policy from migration 001 if it
-- still exists. Already gone from current prod, but a fresh `db push` of
-- this repo would recreate it without this drop.
drop policy if exists "read passages" on passages;

-- Teachers still need to SELECT questions via the existing
-- "teacher manage questions" policy (cmd=ALL using is_teacher check).
-- That policy already covers SELECT so no replacement needed.

-- ─── save_vocab_retention_answers ─────────────────────────────────────────────
-- Replaces the direct `.update(sessions).set(vocab_retention_answers)` call
-- that SessionReport.jsx was making against the now-dropped UPDATE policy.
-- Once-only by design: refuses to overwrite an existing value.

create or replace function save_vocab_retention_answers(
  p_session_id uuid,
  p_answers jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'auth required';
  end if;
  update sessions
  set vocab_retention_answers = p_answers
  where id = p_session_id
    and student_id = auth.uid()
    and vocab_retention_answers is null;
  if not found then
    raise exception 'session not found, not owned, or retention already recorded';
  end if;
end;
$$;

revoke all on function save_vocab_retention_answers(uuid, jsonb) from public;
grant execute on function save_vocab_retention_answers(uuid, jsonb) to authenticated;

-- ─── get_questions_for_session ────────────────────────────────────────────────
-- Replaces direct `from('questions').select(...).eq('passage_id', ...)` reads
-- from student-facing code. Returns the question shape needed by both the
-- quiz-taking UI and the post-submission results UI, with `correct_index`
-- visible ONLY after the student has submitted (or always for teachers).
--
-- The function does its own access check: caller must own the session OR
-- be a teacher.

create or replace function get_questions_for_session(p_session_id uuid)
returns table (
  id            uuid,
  question_text text,
  options       jsonb,
  display_order int,
  correct_index int
)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_passage_id uuid;
  v_answered   boolean;
  v_teacher    boolean := is_teacher();
begin
  select s.passage_id, s.comprehension_answers is not null
    into v_passage_id, v_answered
  from sessions s
  where s.id = p_session_id
    and (s.student_id = auth.uid() or v_teacher);

  if v_passage_id is null then
    raise exception 'session not found or access denied';
  end if;

  return query
  select q.id, q.question_text, q.options, q.display_order,
         case when v_answered or v_teacher then q.correct_index else null end
  from questions q
  where q.passage_id = v_passage_id
  order by q.display_order;
end;
$$;

revoke all on function get_questions_for_session(uuid) from public;
grant execute on function get_questions_for_session(uuid) to authenticated;

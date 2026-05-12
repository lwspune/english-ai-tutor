-- Hardening pass on the older SECURITY DEFINER functions in this repo.
--
-- Two motivations:
-- 1. `set search_path = public` was missing on functions created before
--    migration 014. After pg_cron / pg_net landed in 013, the bare `profiles`
--    or `sessions` references in these functions resolve through a longer
--    search_path and can be hijacked or simply break when extensions install
--    objects of the same name. The same trap already bit `handle_new_user`
--    and was patched via MCP (`handle_new_user_search_path`) but never
--    committed to the repo.
-- 2. `grade_comprehension` accepts duplicate `question_id`s and any answer
--    count. A student can submit one correct answer N times and score 100%
--    while only knowing one answer. Defeats the mastery gate.
--
-- All re-definitions are idempotent via `create or replace` and preserve the
-- original happy-path semantics; only the trust-boundary checks change.

-- ─── handle_new_user ──────────────────────────────────────────────────────────
-- Captures the prod fix that's been live since 2026-05-08 but missing from
-- this repo. Qualifies inserts as `public.profiles` and pins search_path.

create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role, grade)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    coalesce(new.raw_user_meta_data->>'role', 'student'),
    new.raw_user_meta_data->>'grade'
  );
  return new;
end;
$$;

-- ─── reset_comprehension ──────────────────────────────────────────────────────
-- Same body, now with search_path pinned. Also routes the teacher check
-- through is_teacher() (defined in migration 022) for consistency with the
-- vocab and milestone RPCs.

create or replace function reset_comprehension(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_teacher() then
    raise exception 'Access denied: teachers only';
  end if;
  update sessions
  set score_comprehension = null,
      comprehension_answers = null
  where id = p_session_id;
end;
$$;

-- ─── validate_class_code ──────────────────────────────────────────────────────
-- Same body; search_path pinned. Still anon-callable.

create or replace function validate_class_code(p_code text)
returns boolean
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_stored text;
begin
  select class_code into v_stored from app_settings where id = true;
  return lower(v_stored) = lower(p_code);
end;
$$;

revoke all on function validate_class_code(text) from public;
grant execute on function validate_class_code(text) to anon, authenticated;

-- ─── grade_comprehension ──────────────────────────────────────────────────────
-- Adds three trust-boundary checks (Finding 6) and pins search_path
-- (Finding 9). Happy path unchanged.
--
-- Check 1: answer count must equal question count.
-- Check 2: no duplicate question_ids.
-- Check 3: every submitted question_id must belong to this passage.

create or replace function grade_comprehension(p_session_id uuid, p_answers jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_passage_id  uuid;
  v_questions   jsonb;
  v_total       int;
  v_correct     int := 0;
  v_graded      jsonb := '[]'::jsonb;
  v_answer      jsonb;
  v_question_id text;
  v_correct_idx int;
  v_selected    int;
  v_is_correct  boolean;
  v_seen_ids    text[] := array[]::text[];
  v_score       int;
begin
  -- Verify session belongs to caller and is not yet graded.
  select passage_id into v_passage_id
  from sessions
  where id = p_session_id
    and student_id = auth.uid()
    and comprehension_answers is null;

  if v_passage_id is null then
    raise exception 'Session not found, access denied, or already graded';
  end if;

  -- Fetch all questions (correct_index stays server-side).
  select jsonb_agg(q order by q.display_order) into v_questions
  from questions q
  where q.passage_id = v_passage_id;

  v_total := jsonb_array_length(v_questions);
  if v_total = 0 then
    raise exception 'No questions found for this passage';
  end if;

  -- Check 1: count must match.
  if jsonb_array_length(p_answers) <> v_total then
    raise exception 'Answer count (%) does not match question count (%)',
      jsonb_array_length(p_answers), v_total;
  end if;

  for v_answer in select * from jsonb_array_elements(p_answers) loop
    v_question_id := v_answer->>'question_id';

    -- Check 2: reject duplicates.
    if v_question_id = any(v_seen_ids) then
      raise exception 'Duplicate question_id in submission: %', v_question_id;
    end if;
    v_seen_ids := array_append(v_seen_ids, v_question_id);

    -- Resolve correct_index from the fetched question list.
    select (q->>'correct_index')::int into v_correct_idx
    from jsonb_array_elements(v_questions) q
    where q->>'id' = v_question_id;

    -- Check 3: unknown question_id (not part of this passage).
    if v_correct_idx is null then
      raise exception 'Unknown question_id for this passage: %', v_question_id;
    end if;

    v_selected   := (v_answer->>'selected_index')::int;
    v_is_correct := (v_selected = v_correct_idx);

    if v_is_correct then
      v_correct := v_correct + 1;
    end if;

    v_graded := v_graded || jsonb_build_array(jsonb_build_object(
      'question_id',    v_question_id,
      'selected_index', v_selected,
      'is_correct',     v_is_correct
    ));
  end loop;

  v_score := round((v_correct::numeric / v_total) * 100);

  update sessions
  set score_comprehension  = v_score,
      comprehension_answers = v_graded
  where id = p_session_id;

  return jsonb_build_object('score', v_score);
end;
$$;

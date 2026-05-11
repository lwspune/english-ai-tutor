-- v2.1 reading-integration: bump total_encounters when a student reads a
-- vocab word during a reading session. Reading is exposure-only — never
-- advances SRS state. Track which surface produced the most recent
-- encounter so the UI can attribute mastery progress.

alter table student_word_progress
  add column if not exists last_encounter_source text
  check (last_encounter_source in ('practice', 'reading'));

-- Bulk encounter recorder: takes a student_id + array of normalised
-- (lowercase, no leading/trailing punctuation) passage words and bumps
-- total_encounters for every vocab match. Service-role only — only the
-- analyze-reading edge function should call it, after it has verified
-- the student owned the session. Idempotent across re-plays.
create or replace function record_vocab_reading_encounters(
  p_student_id uuid,
  p_words text[]
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rows int;
begin
  if p_student_id is null then
    raise exception 'student_id required';
  end if;
  if p_words is null or array_length(p_words, 1) is null then
    return 0;
  end if;

  with matches as (
    select id from vocabulary_words
    where lower(word) = any (p_words)
  )
  insert into student_word_progress (
    student_id, word_id, srs_box, next_review_at,
    correct_count, total_encounters, last_encounter_source,
    created_at, updated_at
  )
  select p_student_id, m.id, 1, now(), 0, 1, 'reading', now(), now()
  from matches m
  on conflict (student_id, word_id) do update set
    total_encounters = student_word_progress.total_encounters + 1,
    last_encounter_source = 'reading',
    updated_at = now();

  get diagnostics v_rows = ROW_COUNT;
  return v_rows;
end;
$$;

revoke all on function record_vocab_reading_encounters(uuid, text[]) from public;
revoke all on function record_vocab_reading_encounters(uuid, text[]) from authenticated;
grant execute on function record_vocab_reading_encounters(uuid, text[]) to service_role;

-- Update grade_vocab_attempt to stamp the source so the UI can attribute
-- mastery progress between reading and practice surfaces.
create or replace function grade_vocab_attempt(p_word_id uuid, p_was_correct boolean)
returns student_word_progress
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student_id uuid := auth.uid();
  v_current_box smallint;
  v_current_correct int;
  v_current_mastered timestamptz;
  v_next_box smallint;
  v_interval_days int;
  v_new_correct int;
  v_new_mastered timestamptz;
  v_intervals constant int[] := array[1, 3, 7, 14, 30];
  v_max_box constant smallint := 5;
  v_mastery_threshold constant int := 3;
  v_result student_word_progress;
begin
  if v_student_id is null then
    raise exception 'authentication required';
  end if;
  if not exists (select 1 from vocabulary_words where id = p_word_id) then
    raise exception 'invalid word_id';
  end if;

  select srs_box, correct_count, mastered_at
    into v_current_box, v_current_correct, v_current_mastered
  from student_word_progress
  where student_id = v_student_id and word_id = p_word_id;

  v_current_box := coalesce(v_current_box, 1);
  v_current_correct := coalesce(v_current_correct, 0);

  if p_was_correct then
    v_next_box := least(v_current_box + 1, v_max_box);
    v_new_correct := v_current_correct + 1;
  else
    v_next_box := 1;
    v_new_correct := v_current_correct;
  end if;
  v_interval_days := v_intervals[v_next_box];

  v_new_mastered := case
    when v_current_mastered is not null then v_current_mastered
    when p_was_correct and v_next_box = v_max_box and v_new_correct >= v_mastery_threshold then now()
    else null
  end;

  insert into student_word_progress (
    student_id, word_id, srs_box, next_review_at,
    correct_count, total_encounters, mastered_at,
    last_encounter_source, updated_at
  )
  values (
    v_student_id, p_word_id, v_next_box, now() + (v_interval_days || ' days')::interval,
    v_new_correct, 1, v_new_mastered, 'practice', now()
  )
  on conflict (student_id, word_id) do update set
    srs_box = excluded.srs_box,
    next_review_at = excluded.next_review_at,
    correct_count = excluded.correct_count,
    total_encounters = student_word_progress.total_encounters + 1,
    mastered_at = excluded.mastered_at,
    last_encounter_source = 'practice',
    updated_at = excluded.updated_at
  returning * into v_result;

  return v_result;
end;
$$;

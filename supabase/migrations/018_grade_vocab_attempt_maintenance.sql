-- v2 maintenance check: mastery is no longer permanent.
-- Correct answer on a previously-mastered word refreshes mastered_at (push the
-- next maintenance check 30 days out). Wrong answer on a previously-mastered
-- word clears mastered_at and drops the word back to box 1, where the standard
-- Leitner climb resumes.

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
    -- Wrong on a previously-mastered word: drop mastery; the climb starts over.
    when v_current_mastered is not null and not p_was_correct then null
    -- Correct on a previously-mastered word: refresh; next maintenance check 30 days out.
    when v_current_mastered is not null and p_was_correct then now()
    -- Newly reaching mastery this attempt.
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

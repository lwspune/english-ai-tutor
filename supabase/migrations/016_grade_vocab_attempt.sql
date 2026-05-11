-- Atomic SRS update for a student's vocabulary attempt.
-- Leitner 5-box: correct → bump box (cap 5), wrong → box 1. Intervals 1/3/7/14/30 days.
-- Mastery sticks once awarded; subsequent attempts keep mastered_at and just
-- update total_encounters so the deck still reflects exposure.

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
    correct_count, total_encounters, mastered_at, updated_at
  )
  values (
    v_student_id, p_word_id, v_next_box, now() + (v_interval_days || ' days')::interval,
    v_new_correct, 1, v_new_mastered, now()
  )
  on conflict (student_id, word_id) do update set
    srs_box = excluded.srs_box,
    next_review_at = excluded.next_review_at,
    correct_count = excluded.correct_count,
    total_encounters = student_word_progress.total_encounters + 1,
    mastered_at = excluded.mastered_at,
    updated_at = excluded.updated_at
  returning * into v_result;

  return v_result;
end;
$$;

revoke all on function grade_vocab_attempt(uuid, boolean) from public;
grant execute on function grade_vocab_attempt(uuid, boolean) to authenticated;

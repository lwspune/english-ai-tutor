-- Server-side comprehension grading.
-- Fetches correct_index inside the DB so it is never exposed to the client.
-- Validates session ownership, prevents re-grading, saves score atomically.
create or replace function grade_comprehension(p_session_id uuid, p_answers jsonb)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_passage_id uuid;
  v_questions   jsonb;
  v_total       int;
  v_correct     int := 0;
  v_graded      jsonb := '[]'::jsonb;
  v_answer      jsonb;
  v_correct_idx int;
  v_selected    int;
  v_is_correct  boolean;
  v_score       int;
begin
  -- verify session belongs to the calling user and is not yet graded
  select passage_id into v_passage_id
  from sessions
  where id = p_session_id
    and student_id = auth.uid()
    and comprehension_answers is null;

  if v_passage_id is null then
    raise exception 'Session not found, access denied, or already graded';
  end if;

  -- fetch all questions (including correct_index — never sent to client)
  select jsonb_agg(q order by q.display_order) into v_questions
  from questions q
  where q.passage_id = v_passage_id;

  v_total := jsonb_array_length(v_questions);

  if v_total = 0 then
    raise exception 'No questions found for this passage';
  end if;

  -- grade each submitted answer
  for v_answer in select * from jsonb_array_elements(p_answers) loop
    select (q->>'correct_index')::int into v_correct_idx
    from jsonb_array_elements(v_questions) q
    where q->>'id' = v_answer->>'question_id';

    v_selected   := (v_answer->>'selected_index')::int;
    v_is_correct := (v_selected = v_correct_idx);

    if v_is_correct then
      v_correct := v_correct + 1;
    end if;

    v_graded := v_graded || jsonb_build_array(jsonb_build_object(
      'question_id',    v_answer->>'question_id',
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

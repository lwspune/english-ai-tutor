-- Extend the milestones.kind CHECK constraint to include 'drill_session_aced'
-- and teach award_milestone how to validate it.
--
-- Awarded when, for a given session, the student has at least 3 distinct
-- stumble_words with at least one was_correct=true drill_attempt. Idempotent
-- via dedupe_key on session_id.

-- ─── replace the CHECK constraint defensively (auto-named in migration 021) ────
do $$
declare
  cname text;
begin
  select conname into cname
  from pg_constraint
  where conrelid = 'milestones'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) ilike '%word_mastered%';
  if cname is not null then
    execute format('alter table milestones drop constraint %I', cname);
  end if;
end $$;

alter table milestones
  add constraint milestones_kind_check
  check (kind in (
    'streak_5', 'streak_10', 'streak_20',
    'personal_best_accuracy', 'personal_best_wpm',
    'comprehension_aced', 'word_mastered',
    'drill_session_aced'
  ));

-- ─── teach award_milestone the new kind ────────────────────────────────────────

create or replace function award_milestone(p_kind text, p_payload jsonb default '{}'::jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student_id uuid := auth.uid();
  v_id uuid;
  v_session sessions%rowtype;
  v_progress student_word_progress%rowtype;
  v_word_text text;
  v_prev_best numeric;
  v_streak int;
  v_threshold int;
  v_ace_count int;
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
begin
  if v_student_id is null then
    raise exception 'authentication required';
  end if;

  case p_kind
    when 'streak_5', 'streak_10', 'streak_20' then
      v_threshold := case p_kind
        when 'streak_5' then 5
        when 'streak_10' then 10
        else 20
      end;
      v_streak := compute_student_streak(v_student_id);
      if v_streak < v_threshold then
        raise exception 'milestone not yet earned: streak % < %', v_streak, v_threshold;
      end if;
      v_payload := v_payload || jsonb_build_object('dedupe', '', 'streak', v_streak);

    when 'personal_best_accuracy', 'personal_best_wpm' then
      if not (v_payload ? 'session_id') then
        raise exception 'session_id required in payload';
      end if;
      select * into v_session from sessions
        where id = (v_payload->>'session_id')::uuid and student_id = v_student_id;
      if v_session.id is null then
        raise exception 'session not found or not owned';
      end if;
      if p_kind = 'personal_best_accuracy' then
        select coalesce(max(score_accuracy), -1) into v_prev_best
        from sessions
        where student_id = v_student_id
          and passage_id = v_session.passage_id
          and id <> v_session.id
          and created_at < v_session.created_at;
        if v_session.score_accuracy is null or v_session.score_accuracy <= v_prev_best then
          raise exception 'not a new accuracy best: % <= %', v_session.score_accuracy, v_prev_best;
        end if;
        v_payload := v_payload || jsonb_build_object(
          'dedupe', v_session.id::text,
          'score', v_session.score_accuracy,
          'passage_id', v_session.passage_id
        );
      else
        select coalesce(max(score_wpm), -1) into v_prev_best
        from sessions
        where student_id = v_student_id
          and passage_id = v_session.passage_id
          and id <> v_session.id
          and created_at < v_session.created_at;
        if v_session.score_wpm is null or v_session.score_wpm <= v_prev_best then
          raise exception 'not a new wpm best: % <= %', v_session.score_wpm, v_prev_best;
        end if;
        v_payload := v_payload || jsonb_build_object(
          'dedupe', v_session.id::text,
          'score', v_session.score_wpm,
          'passage_id', v_session.passage_id
        );
      end if;

    when 'comprehension_aced' then
      if not (v_payload ? 'session_id') then
        raise exception 'session_id required in payload';
      end if;
      select * into v_session from sessions
        where id = (v_payload->>'session_id')::uuid and student_id = v_student_id;
      if v_session.id is null then
        raise exception 'session not found or not owned';
      end if;
      if coalesce(v_session.score_comprehension, 0) < 80 then
        raise exception 'comprehension not aced: %', v_session.score_comprehension;
      end if;
      v_payload := v_payload || jsonb_build_object(
        'dedupe', v_session.id::text,
        'score', v_session.score_comprehension,
        'passage_id', v_session.passage_id
      );

    when 'word_mastered' then
      if not (v_payload ? 'word_id') then
        raise exception 'word_id required in payload';
      end if;
      select * into v_progress from student_word_progress
        where student_id = v_student_id and word_id = (v_payload->>'word_id')::uuid;
      if v_progress.mastered_at is null
         or v_progress.srs_box < 5
         or v_progress.correct_count < 3 then
        raise exception 'word not mastered';
      end if;
      select word into v_word_text from vocabulary_words where id = (v_payload->>'word_id')::uuid;
      v_payload := v_payload || jsonb_build_object(
        'dedupe', (v_payload->>'word_id'),
        'word', v_word_text
      );

    when 'drill_session_aced' then
      if not (v_payload ? 'session_id') then
        raise exception 'session_id required in payload';
      end if;
      select * into v_session from sessions
        where id = (v_payload->>'session_id')::uuid and student_id = v_student_id;
      if v_session.id is null then
        raise exception 'session not found or not owned';
      end if;
      select count(distinct lower(stumble_word)) into v_ace_count
      from drill_attempts
      where session_id = v_session.id
        and student_id = v_student_id
        and was_correct = true;
      if v_ace_count < 3 then
        raise exception 'drill session not aced: % < 3 distinct stumbles correct', v_ace_count;
      end if;
      v_payload := v_payload || jsonb_build_object(
        'dedupe', v_session.id::text,
        'count', v_ace_count
      );

    else
      raise exception 'unknown milestone kind: %', p_kind;
  end case;

  insert into milestones (student_id, kind, payload)
  values (v_student_id, p_kind, v_payload)
  on conflict (student_id, dedupe_key) do nothing
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function award_milestone(text, jsonb) from public;
grant execute on function award_milestone(text, jsonb) to authenticated;

-- Milestone log: durable record of celebration-worthy events so the student can
-- see their own trajectory (StudentProgress "Recent milestones" surface).
--
-- Two contracts:
--   1. Awards go through the SECURITY DEFINER RPC `award_milestone(kind, payload)`,
--      which server-validates the claim against source data (sessions, progress, streak)
--      so a malicious client cannot manufacture milestones.
--   2. Idempotency is enforced by a generated `dedupe_key` column +
--      unique index on (student_id, dedupe_key). Repeatable kinds (personal_best, etc.)
--      key on session_id; once-ever kinds (streak crossings) key on empty string.

-- ─── streak helper ─────────────────────────────────────────────────────────────
-- Mirrors src/lib/streak.js: count consecutive school days (Mon-Fri IST) ending
-- today (or the previous school day if today has no session) on which the student
-- recorded at least one session.

create or replace function compute_student_streak(p_student_id uuid)
returns int
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  v_session_dates date[];
  v_current date;
  v_streak int := 0;
  v_dow int;
begin
  select coalesce(array_agg(distinct d order by d desc), array[]::date[])
    into v_session_dates
  from (
    select (created_at at time zone 'Asia/Kolkata')::date as d
    from sessions
    where student_id = p_student_id
      and extract(isodow from (created_at at time zone 'Asia/Kolkata')) between 1 and 5
  ) s;

  if array_length(v_session_dates, 1) is null then
    return 0;
  end if;

  v_dow := extract(isodow from v_today);
  if v_dow between 1 and 5 and v_today = any(v_session_dates) then
    v_current := v_today;
  else
    v_current := v_today;
    loop
      v_current := v_current - 1;
      exit when extract(isodow from v_current) between 1 and 5;
    end loop;
  end if;

  while v_current = any(v_session_dates) loop
    v_streak := v_streak + 1;
    loop
      v_current := v_current - 1;
      exit when extract(isodow from v_current) between 1 and 5;
    end loop;
  end loop;

  return v_streak;
end;
$$;

grant execute on function compute_student_streak(uuid) to authenticated;

-- ─── table ─────────────────────────────────────────────────────────────────────

create table if not exists milestones (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references profiles(id) on delete cascade,
  kind text not null check (kind in (
    'streak_5', 'streak_10', 'streak_20',
    'personal_best_accuracy', 'personal_best_wpm',
    'comprehension_aced', 'word_mastered'
  )),
  achieved_at timestamptz not null default now(),
  payload jsonb not null default '{}'::jsonb,
  dedupe_key text generated always as (kind || ':' || coalesce(payload->>'dedupe', '')) stored
);

create unique index if not exists milestones_unique_per_student
  on milestones (student_id, dedupe_key);

create index if not exists milestones_by_student_recent
  on milestones (student_id, achieved_at desc);

alter table milestones enable row level security;

-- Students see their own; teachers see all (re-uses is_teacher() from migration 001
-- to avoid the profile-recursion trap).
create policy "milestones own read"
  on milestones for select to authenticated
  using (student_id = auth.uid() or is_teacher());

-- Direct modification disabled; everything goes through award_milestone.
revoke insert, update, delete on milestones from authenticated;

-- ─── RPC: award_milestone ──────────────────────────────────────────────────────

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

-- ─── one-shot backfill ─────────────────────────────────────────────────────────
-- Uses accurate achieved_at where available (session.created_at, progress.mastered_at);
-- streaks fall back to now() since the date the student CROSSED a 5/10/20-day
-- streak isn't cheap to derive from session history without porting more logic.

-- 1. Personal best (accuracy): a session is a best if it beats every PRIOR session
--    on the same (student, passage). First-ever attempts don't count.
insert into milestones (student_id, kind, payload, achieved_at)
select s.student_id, 'personal_best_accuracy',
       jsonb_build_object(
         'dedupe', s.id::text,
         'session_id', s.id::text,
         'score', s.score_accuracy,
         'passage_id', s.passage_id,
         'backfilled', true
       ),
       s.created_at
from sessions s
where s.score_accuracy is not null
  and exists (
    select 1 from sessions p
    where p.student_id = s.student_id
      and p.passage_id = s.passage_id
      and p.created_at < s.created_at
  )
  and s.score_accuracy > (
    select coalesce(max(p.score_accuracy), -1)
    from sessions p
    where p.student_id = s.student_id
      and p.passage_id = s.passage_id
      and p.created_at < s.created_at
  )
on conflict (student_id, dedupe_key) do nothing;

-- 2. Personal best (wpm): same idea.
insert into milestones (student_id, kind, payload, achieved_at)
select s.student_id, 'personal_best_wpm',
       jsonb_build_object(
         'dedupe', s.id::text,
         'session_id', s.id::text,
         'score', s.score_wpm,
         'passage_id', s.passage_id,
         'backfilled', true
       ),
       s.created_at
from sessions s
where s.score_wpm is not null
  and exists (
    select 1 from sessions p
    where p.student_id = s.student_id
      and p.passage_id = s.passage_id
      and p.created_at < s.created_at
  )
  and s.score_wpm > (
    select coalesce(max(p.score_wpm), -1)
    from sessions p
    where p.student_id = s.student_id
      and p.passage_id = s.passage_id
      and p.created_at < s.created_at
  )
on conflict (student_id, dedupe_key) do nothing;

-- 3. Comprehension aced: every session with score_comprehension >= 80.
insert into milestones (student_id, kind, payload, achieved_at)
select s.student_id, 'comprehension_aced',
       jsonb_build_object(
         'dedupe', s.id::text,
         'session_id', s.id::text,
         'score', s.score_comprehension,
         'passage_id', s.passage_id,
         'backfilled', true
       ),
       s.created_at
from sessions s
where coalesce(s.score_comprehension, 0) >= 80
on conflict (student_id, dedupe_key) do nothing;

-- 4. Word mastered: every progress row that already has mastered_at set.
insert into milestones (student_id, kind, payload, achieved_at)
select swp.student_id, 'word_mastered',
       jsonb_build_object(
         'dedupe', swp.word_id::text,
         'word_id', swp.word_id::text,
         'word', vw.word,
         'backfilled', true
       ),
       swp.mastered_at
from student_word_progress swp
join vocabulary_words vw on vw.id = swp.word_id
where swp.mastered_at is not null
on conflict (student_id, dedupe_key) do nothing;

-- 5. Streak crossings: for each student, award streak_N if their current streak
-- (as of migration time) is >= N. achieved_at = now() (imprecise, see note above).
insert into milestones (student_id, kind, payload)
select p.id, 'streak_5',
       jsonb_build_object('dedupe', '', 'streak', compute_student_streak(p.id), 'backfilled', true)
from profiles p
where p.role = 'student' and compute_student_streak(p.id) >= 5
on conflict (student_id, dedupe_key) do nothing;

insert into milestones (student_id, kind, payload)
select p.id, 'streak_10',
       jsonb_build_object('dedupe', '', 'streak', compute_student_streak(p.id), 'backfilled', true)
from profiles p
where p.role = 'student' and compute_student_streak(p.id) >= 10
on conflict (student_id, dedupe_key) do nothing;

insert into milestones (student_id, kind, payload)
select p.id, 'streak_20',
       jsonb_build_object('dedupe', '', 'streak', compute_student_streak(p.id), 'backfilled', true)
from profiles p
where p.role = 'student' and compute_student_streak(p.id) >= 20
on conflict (student_id, dedupe_key) do nothing;

-- Deliberate-practice drill on stumble words (v1c, sentence-in-context).
--
-- After a reading session, students drill the specific words they got wrong.
-- One drill_attempt row per attempt; max 3 attempts per (student, session,
-- stumble_word). Writes happen only through the analyze-drill edge function
-- (service role); RLS allows owner SELECT + teacher SELECT.

create table if not exists drill_attempts (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references profiles(id) on delete cascade,
  session_id uuid not null references sessions(id) on delete cascade,
  stumble_word text not null,
  sentence text not null,
  score numeric,
  was_correct boolean not null default false,
  attempt_index smallint not null check (attempt_index between 1 and 3),
  created_at timestamptz not null default now()
);

create index if not exists drill_attempts_by_student_recent
  on drill_attempts (student_id, created_at desc);

create index if not exists drill_attempts_by_session_word
  on drill_attempts (session_id, stumble_word);

alter table drill_attempts enable row level security;

create policy "drill_attempts own read"
  on drill_attempts for select to authenticated
  using (student_id = auth.uid() or is_teacher());

-- All writes go through analyze-drill (service role bypasses RLS).
revoke insert, update, delete on drill_attempts from authenticated;

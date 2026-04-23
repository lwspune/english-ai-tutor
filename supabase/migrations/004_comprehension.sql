-- comprehension questions per passage
create table questions (
  id             uuid primary key default gen_random_uuid(),
  passage_id     uuid not null references passages(id) on delete cascade,
  question_text  text not null,
  options        jsonb not null,  -- array of 4 strings
  correct_index  int  not null check (correct_index between 0 and 3),
  display_order  int  not null default 0,
  created_at     timestamptz default now()
);

-- enforce 3–5 questions per passage
create or replace function check_question_count()
returns trigger language plpgsql as $$
declare
  cnt int;
begin
  select count(*) into cnt from questions where passage_id = NEW.passage_id;
  if cnt >= 5 then
    raise exception 'A passage may have at most 5 comprehension questions';
  end if;
  return NEW;
end;
$$;

create trigger enforce_question_limit
  before insert on questions
  for each row execute function check_question_count();

-- RLS
alter table questions enable row level security;

create policy "read questions" on questions for select using (true);

create policy "teacher manage questions" on questions for all
  using (exists (select 1 from profiles where id = auth.uid() and role = 'teacher'));

-- add comprehension columns to sessions
alter table sessions
  add column if not exists score_comprehension    int,
  add column if not exists comprehension_answers  jsonb;

-- allow students to update their own session's comprehension fields (once)
create policy "student submit comprehension" on sessions for update
  using (student_id = auth.uid())
  with check (student_id = auth.uid());

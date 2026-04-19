-- profiles (extends auth.users)
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role text not null check (role in ('teacher', 'student')),
  grade int check (grade between 9 and 12),
  created_at timestamptz default now()
);

-- auto-create profile on signup
create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into profiles (id, full_name, role, grade)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    coalesce(new.raw_user_meta_data->>'role', 'student'),
    (new.raw_user_meta_data->>'grade')::int
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- passages
create table passages (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  content text not null,
  word_count int not null,
  grade_level int check (grade_level between 9 and 12),
  created_by uuid references profiles(id),
  created_at timestamptz default now()
);

-- sessions
create table sessions (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references profiles(id) on delete cascade,
  passage_id uuid not null references passages(id) on delete cascade,
  transcript text,
  score_accuracy int,
  score_wpm int,
  score_fluency int,
  word_results jsonb,
  feedback text,
  created_at timestamptz default now()
);

-- RLS
alter table profiles enable row level security;
alter table passages enable row level security;
alter table sessions enable row level security;

-- profiles: users see their own; teachers see all students
create policy "own profile" on profiles for select using (auth.uid() = id);
create policy "teachers see students" on profiles for select
  using (exists (select 1 from profiles where id = auth.uid() and role = 'teacher'));

-- passages: everyone can read; only teachers can insert/update/delete
create policy "read passages" on passages for select using (true);
create policy "teacher manage passages" on passages for all
  using (exists (select 1 from profiles where id = auth.uid() and role = 'teacher'));

-- sessions: students see own; teachers see all
create policy "student own sessions" on sessions for select using (student_id = auth.uid());
create policy "teacher see all sessions" on sessions for select
  using (exists (select 1 from profiles where id = auth.uid() and role = 'teacher'));
create policy "insert session" on sessions for insert with check (student_id = auth.uid());

-- storage bucket for audio (create in dashboard: name = "audio", private)

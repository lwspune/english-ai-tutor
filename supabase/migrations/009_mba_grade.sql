-- Allow MBA as a grade level alongside 9-12.
-- Changes profiles.grade and passages.grade_level from int to text.

-- Step 1: drop the RLS policy and integer check constraints that block the type change
drop policy if exists "students read grade passages" on passages;
alter table profiles drop constraint if exists profiles_grade_check;
alter table passages drop constraint if exists passages_grade_level_check;

-- Step 2: change column types int → text
alter table profiles alter column grade type text using grade::text;
alter table passages alter column grade_level type text using grade_level::text;

-- Step 3: add new text-based check constraints
alter table profiles add constraint profiles_grade_check
  check (grade is null or grade in ('9', '10', '11', '12', 'MBA'));
alter table passages add constraint passages_grade_level_check
  check (grade_level is null or grade_level in ('9', '10', '11', '12', 'MBA'));

-- Step 4: recreate RLS policy (both sides are now text)
create policy "students read grade passages" on passages
  for select using (
    grade_level is null or grade_level = (
      select grade from profiles where id = auth.uid()
    )
  );

-- Step 5: fix handle_new_user trigger — remove ::int cast so 'MBA' stores as-is
create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into profiles (id, full_name, role, grade)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    coalesce(new.raw_user_meta_data->>'role', 'student'),
    new.raw_user_meta_data->>'grade'
  );
  return new;
end;
$$;

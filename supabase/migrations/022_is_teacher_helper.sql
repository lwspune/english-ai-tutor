-- Captures the is_teacher() helper that has been live in prod since the early
-- days of the project but was never committed as a numbered migration.
-- Migrations 015 (vocabulary RLS) and 021 (milestones RLS) both reference it;
-- a fresh `supabase db push` against an empty database would fail at 015
-- without this definition.
--
-- The prod version (created via MCP / dashboard) is also missing
-- `set search_path = public`. This migration both captures the function and
-- hardens it against the schema-shift trap that bit `handle_new_user`.

create or replace function is_teacher()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'teacher'
  )
$$;

revoke all on function is_teacher() from public;
grant execute on function is_teacher() to authenticated, service_role;

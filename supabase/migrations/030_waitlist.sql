-- Waitlist for public NDA-aspirant trial. Validates demand pre-build:
-- when sign-up count crosses ~50 organically, commit to the Phase 1 build
-- (payments + FA + content scaling + guest/demo class).
--
-- Read access is teacher-only (via is_teacher()). Anyone can insert, including
-- anon visitors — no auth required to join the waitlist. The unique(email)
-- constraint lets the frontend show a friendly "already on the list" message
-- on duplicate submission.

create table waitlist_signups (
  id         uuid primary key default gen_random_uuid(),
  email      text not null,
  source     text,
  created_at timestamptz not null default now()
);

create unique index waitlist_signups_email_lower_uniq
  on waitlist_signups (lower(email));

alter table waitlist_signups enable row level security;

create policy "anyone can join waitlist" on waitlist_signups
  for insert with check (true);

create policy "teacher reads waitlist" on waitlist_signups
  for select using (is_teacher());

-- No UPDATE / DELETE policies — those stay closed. If we ever need to remove
-- an entry (right-to-erasure request), do it via SQL with service role.

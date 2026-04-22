create table app_settings (
  id boolean primary key default true check (id),  -- enforces single row
  ai_feedback_enabled boolean not null default true
);

insert into app_settings (id, ai_feedback_enabled) values (true, true);

alter table app_settings enable row level security;

-- everyone authenticated can read
create policy "read settings" on app_settings for select using (auth.role() = 'authenticated');

-- only teachers can update
create policy "teacher update settings" on app_settings for update
  using (exists (select 1 from profiles where id = auth.uid() and role = 'teacher'));

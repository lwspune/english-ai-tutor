-- Activation engine: last_reminder_sent column, cron_secret, and daily reminder job

alter table profiles add column if not exists last_reminder_sent timestamptz;

-- Auto-generated secret shared between pg_cron and the edge function validator
alter table app_settings
  add column if not exists cron_secret text not null default encode(gen_random_bytes(16), 'hex');

-- Extensions (safe to run even if already enabled)
create extension if not exists pg_net;
create extension if not exists pg_cron;

-- Idempotent schedule setup
do $$ begin
  perform cron.unschedule('send-daily-reminders');
exception when others then null;
end $$;

-- 10:00 AM IST = 04:30 UTC
select cron.schedule(
  'send-daily-reminders',
  '30 4 * * *',
  $$
  select net.http_post(
    url     := 'https://ixxrwbvrkkrlzwizloai.supabase.co/functions/v1/send-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select cron_secret from app_settings where id = true)
    ),
    body    := '{}'::jsonb
  )
  $$
);

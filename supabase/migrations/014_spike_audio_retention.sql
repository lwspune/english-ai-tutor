-- Temporary audio retention for Phase 1 forced-alignment spike.
-- Captures the next N completed sessions' audio so we can re-score them
-- with a forced-alignment model and compare against Whisper.
-- All columns/RPCs are non-breaking; they stay in schema after the spike
-- with the flag set to false.

alter table app_settings
  add column if not exists spike_audio_retention boolean not null default false;

alter table app_settings
  add column if not exists spike_audio_retention_count int not null default 0;

alter table app_settings
  add column if not exists spike_audio_retention_limit int not null default 10;

alter table sessions
  add column if not exists spike_audio_path text;

-- Atomic slot claim: returns the new count if we won a retention slot,
-- otherwise null. Auto-disables retention once the limit is reached.
create or replace function try_claim_spike_slot()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new_count int;
begin
  update app_settings
  set
    spike_audio_retention_count = spike_audio_retention_count + 1,
    spike_audio_retention = (spike_audio_retention_count + 1 < spike_audio_retention_limit)
  where
    id = true
    and spike_audio_retention = true
    and spike_audio_retention_count < spike_audio_retention_limit
  returning spike_audio_retention_count into v_new_count;

  return v_new_count;
end;
$$;

revoke all on function try_claim_spike_slot() from public;
grant execute on function try_claim_spike_slot() to service_role;

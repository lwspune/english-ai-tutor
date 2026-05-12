-- Generalise the FA-spike audio retention mechanism into a rolling research-
-- retention slot system. Teacher takes offline consent from parents; app
-- retains the latest 100 reading-session recordings for research, analysis,
-- and app improvement. Replaces the time-bounded `spike_audio_retention`
-- pattern (parked spike) with always-on rolling retention.
--
-- Caps at 100 by default; new captures evict oldest via FIFO inside the RPC.

-- 1. Rename the column (spike semantics → general retention semantics)
alter table sessions rename column spike_audio_path to retained_audio_path;

-- 2. Add review-workflow status column
alter table sessions
  add column if not exists retention_reviewed_status text
  check (retention_reviewed_status is null
         or retention_reviewed_status in ('reviewed', 'disputed', 'no_action'));

-- 3. Generalise app_settings fields. Spike fields drop; rolling-retention
-- fields take their place. `enabled` defaults to true (consent has already
-- been collected offline); `cap` defaults to 100.
alter table app_settings drop column if exists spike_audio_retention;
alter table app_settings drop column if exists spike_audio_retention_count;
alter table app_settings drop column if exists spike_audio_retention_limit;
alter table app_settings
  add column if not exists audio_retention_enabled boolean not null default true;
alter table app_settings
  add column if not exists audio_retention_cap int not null default 100;

-- 4. Drop the old spike-specific RPC
drop function if exists try_claim_spike_slot();

-- 5. New RPC: claim_retention_slot()
--   Returns jsonb { retain: bool, evicted_path: text|null }
--   - If retention is disabled: { retain: false, evicted_path: null }
--   - If retention enabled and under cap: { retain: true, evicted_path: null }
--   - If retention enabled and at cap: clears the oldest retained session's
--     retained_audio_path and returns that path so the caller can delete it
--     from storage. Returns { retain: true, evicted_path: <old_path> }.
--
-- Service-role only — called from the analyze-reading edge function before
-- inserting the new session row. The edge function then sets the new
-- session's retained_audio_path to the just-uploaded audio path when
-- retain=true, and deletes the evicted path from storage.
create or replace function claim_retention_slot()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_enabled boolean;
  v_cap int;
  v_current_count int;
  v_oldest_id uuid;
  v_evicted_path text;
begin
  select audio_retention_enabled, audio_retention_cap
    into v_enabled, v_cap
  from app_settings where id = true;

  if v_enabled is null or v_enabled = false then
    return jsonb_build_object('retain', false, 'evicted_path', null);
  end if;

  select count(*) into v_current_count
  from sessions where retained_audio_path is not null;

  if v_current_count >= v_cap then
    select id, retained_audio_path
      into v_oldest_id, v_evicted_path
    from sessions
    where retained_audio_path is not null
    order by created_at asc
    limit 1;

    update sessions set retained_audio_path = null where id = v_oldest_id;
  end if;

  return jsonb_build_object('retain', true, 'evicted_path', v_evicted_path);
end;
$$;

revoke all on function claim_retention_slot() from public, authenticated;
grant execute on function claim_retention_slot() to service_role;

-- 6. New RPC: mark_retention_review(p_session_id, p_status)
--   Teacher-only via is_teacher(). Status must be null, 'reviewed',
--   'disputed', or 'no_action'. Used by the teacher /teacher/audio-review
--   page to track which retained recordings have been listened to.
create or replace function mark_retention_review(p_session_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_teacher() then
    raise exception 'teacher role required';
  end if;
  if p_status is not null and p_status not in ('reviewed', 'disputed', 'no_action') then
    raise exception 'invalid status: %', p_status;
  end if;
  update sessions
  set retention_reviewed_status = p_status
  where id = p_session_id;
end;
$$;

revoke all on function mark_retention_review(uuid, text) from public;
grant execute on function mark_retention_review(uuid, text) to authenticated;

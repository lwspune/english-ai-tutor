-- Add class code to app_settings so students can self-register.
-- A random 6-char hex code is assigned on migration; teacher shares it verbally or on notice board.
alter table app_settings add column class_code text not null default 'CHANGE1';
update app_settings set class_code = upper(substring(md5(random()::text), 1, 6)) where id = true;

-- Callable by unauthenticated (anon) users — validates code without exposing it.
create or replace function validate_class_code(p_code text)
returns boolean
language plpgsql
security definer
as $$
declare
  v_stored text;
begin
  select class_code into v_stored from app_settings where id = true;
  return lower(v_stored) = lower(p_code);
end;
$$;

grant execute on function validate_class_code(text) to anon;

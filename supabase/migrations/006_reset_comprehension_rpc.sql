-- Teacher-only RPC to clear comprehension results for a session.
-- Allows recovery when a student accidentally submits or misreads a question.
create or replace function reset_comprehension(p_session_id uuid)
returns void
language plpgsql
security definer
as $$
begin
  if not exists (
    select 1 from profiles where id = auth.uid() and role = 'teacher'
  ) then
    raise exception 'Access denied: teachers only';
  end if;

  update sessions
  set score_comprehension   = null,
      comprehension_answers = null
  where id = p_session_id;
end;
$$;

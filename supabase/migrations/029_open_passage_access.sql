-- Drops the grade-gated passage SELECT policy added in migration 009.
-- Replaces it with a permissive read policy. `passages.grade_level` remains
-- on the table as a label; it is no longer used to filter access.
--
-- Companion changes (same commit): analyze-reading drops its server-side
-- 403 grade-mismatch check; the StudentHome client filter is removed;
-- vocab/BottomNav stops gating on grade.

drop policy if exists "students read grade passages" on passages;

create policy "read passages" on passages
  for select using (true);

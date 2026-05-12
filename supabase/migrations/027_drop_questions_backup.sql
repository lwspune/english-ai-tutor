-- Drop the questions_backup_preshuffle table.
--
-- This snapshot was created before the bulk shuffleOptions migration ran
-- on all 266 existing questions (so that LLM-generated MCQs no longer
-- skewed toward "B"). The shuffled state has been live for several weeks;
-- 69 comprehension attempts averaging 93% with 58 aced confirm the
-- shuffled correct_index values are correct.
--
-- If we ever need to compare the pre-shuffle correct answer for a
-- specific question, the original LLM-generated entries.json content
-- remains in git history. The backup table is no longer earning its
-- keep in production.

drop table if exists public.questions_backup_preshuffle;

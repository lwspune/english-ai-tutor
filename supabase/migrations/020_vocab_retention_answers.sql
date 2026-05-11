-- v2 post-passage retention quiz: store per-session answers so the section
-- is once-only (like the comprehension quiz) and so we can analyse later.
-- Each row in the array: { word_id, selected_index, was_correct }.

alter table sessions
  add column if not exists vocab_retention_answers jsonb;

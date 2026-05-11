-- Vocabulary practice v1 (Phase 4 of the reading-improvement loop, scoped to grade 11+).
-- Two tables: the curated word list and per-student SRS progress.
-- Writes go through SECURITY DEFINER RPC (added in a later migration), so RLS
-- here only enables SELECT for the appropriate audience.

create table if not exists vocabulary_words (
  id uuid primary key default gen_random_uuid(),
  word text not null unique,
  part_of_speech text,
  definition text not null,
  example_sentence text,
  synonyms jsonb not null default '[]'::jsonb,
  antonyms jsonb not null default '[]'::jsonb,
  difficulty text not null default 'hard' check (difficulty in ('medium', 'hard', 'very_hard')),
  source text not null default 'nda-2026',
  created_at timestamptz not null default now()
);

create index if not exists vocabulary_words_source_idx on vocabulary_words(source);

create table if not exists student_word_progress (
  student_id uuid not null references profiles(id) on delete cascade,
  word_id uuid not null references vocabulary_words(id) on delete cascade,
  srs_box smallint not null default 1 check (srs_box between 1 and 5),
  next_review_at timestamptz not null default now(),
  correct_count int not null default 0 check (correct_count >= 0),
  total_encounters int not null default 0 check (total_encounters >= 0),
  mastered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (student_id, word_id)
);

-- For deck assembly: "find due-for-review unmastered words for this student"
create index if not exists student_word_progress_due_idx
  on student_word_progress(student_id, next_review_at)
  where mastered_at is null;

alter table vocabulary_words enable row level security;
alter table student_word_progress enable row level security;

-- Word list: any authenticated user can read. Edits happen via service role only.
create policy "authenticated read words"
  on vocabulary_words for select to authenticated using (true);

-- Progress rows: a student sees only their own; teachers see everyone's
-- (re-uses is_teacher() security-definer helper from migration 001 to avoid
-- the infinite-recursion trap on the profiles table).
create policy "own progress read"
  on student_word_progress for select to authenticated
  using (student_id = auth.uid() or is_teacher());

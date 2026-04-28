DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'passages_difficulty_check'
      AND conrelid = 'passages'::regclass
  ) THEN
    ALTER TABLE passages
      ADD CONSTRAINT passages_difficulty_check
      CHECK (difficulty IN ('easy', 'moderate', 'hard'));
  END IF;
END $$;

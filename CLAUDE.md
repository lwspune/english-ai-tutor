# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Learning Principles

Every feature must serve at least one of these principles. If it doesn't, question whether it belongs.

### Retrieval Practice
Test recall, don't just re-expose. Comprehension quizzes, vocabulary exercises, and any "check yourself" mechanic are higher value than re-reading. Never build a feature that only shows information passively.

### Spaced Repetition
Material the student struggled with must resurface. Mastery threshold is 80% accuracy. A student who passes 80% has earned the right to move on; below that, keep the item in rotation. Never permanently hide content the student hasn't mastered.

### Immediate Feedback
Feedback is most effective when it arrives right after the attempt, before the student moves on. Any scored activity must show results on the same screen or the next immediate one — never deferred to a dashboard the student has to go find.

### Deliberate Practice
Surface the specific thing the student got wrong and make them practice that exact thing. Generic "keep practising" is weak. "You skipped 'therefore' in 4 sessions — here it is in a sentence, read it aloud" is strong. Build toward the latter.

### Mastery Before Progression
Don't let students accumulate attempts and move on with a 40% score. Gate progression on demonstrated mastery (80%). If all attempts are exhausted below threshold, that's a signal for the teacher, not a silent pass.

### Metacognition
Students learn better when they can see their own trajectory. Every metric we track (accuracy, WPM, phrasing, comprehension) must be visible to the student in plain language, not just the teacher. Progress charts, trend arrows, and session comparisons all serve this.

### Growth-Framed Feedback
Feedback must name what went well and what to work on next — never just a score. The GPT feedback fields (`wentWell`, `focusOn`, `tip`) encode this. Any new feedback surface must follow the same pattern.

## Engagement Mechanics

These mechanics keep students returning and make progress feel real. Apply them when building any student-facing feature. Never use manipulative patterns (variable rewards, loss aversion, social pressure) — this is a school context with minors.

### Streaks — built
Daily reading habit is the goal. Show a streak counter for consecutive school days (Mon–Fri) with at least one session. Weekends don't break the streak. A missed school day does. Streak shows even before today's session is done (it's "at risk", not broken). Never punish a broken streak — just reset to 0 and let the student rebuild. Implementation: `src/lib/streak.js` → `computeStreak(sessions, today)`.

### Personal Best — built
After every scored attempt, compare against all previous attempts on the same item. Show "New personal best!" with the specific improvement (accuracy %, WPM). If not a new best, show the current best quietly so the student knows what to aim for. Track accuracy and WPM independently — either improving is worth celebrating. Never show a score in isolation without context of where the student has been.

### Milestones — not yet built
Mark real learning events, not arbitrary game points. Good milestones: first 80%+ accuracy, 5-passage streak, improved accuracy week-over-week, first comprehension quiz completed. Bad milestones: "logged in 3 days in a row", "earned 100 XP". Each milestone must correspond to a genuine learning achievement.

### Weekly summary — built
Shows on the first load of `StudentHome` each new Mon–Sun week (IST). Displays passages read last week, accuracy with ↑/↓/→ trend vs the prior week, and current streak. Single "Let's go!" dismiss button. Skipped for brand-new students with no sessions. localStorage key `weekly_summary_seen_{studentId}` tracks the seen week so it won't repeat. Implementation: `src/lib/weeklySummary.js` + `src/components/WeeklySummaryModal.jsx`.

### What to avoid
- Leaderboards: demotivate the bottom half of the class in a known-peer setting.
- Hearts / lives: create anxiety, not learning.
- Variable rewards / loot boxes: exploitative, no learning benefit.
- Streak shields or freezes: adds complexity without learning value.

## Development Preferences

### UI
- All student-facing screens must be mobile-first. Use Tailwind responsive prefixes (`sm:`, `md:`) and test layouts at 375px width. Touch targets must be at least 44px. Avoid horizontal scroll.

### Backend Integrity
- Validate and reject bad input at the edge function boundary before any external API call (fail fast). Return `{ data }` on success, `{ error }` on failure from all edge functions. Keep all scoring and business logic server-side.

### Accessibility
- Use Tailwind `focus-visible:` utilities for focus styles on all interactive elements.

### Definition of Done
- Golden path must be verified in the browser at 375px width specifically.

### Security
- Never use `dangerouslySetInnerHTML` with user-supplied content. Keep RLS enabled on all Supabase tables.

### Dependency Management
- Stack is React 19, Tailwind v4, and Supabase — exhaust these before adding any package.

### Function Size / Cohesion
- Each function or component should do one thing. If you need "and" to describe what it does, split it. Prefer small, named functions over large inline logic blocks.

### Performance
- Avoid N+1 queries — batch Supabase calls where possible. Avoid unnecessary React re-renders. Keep the bundle lean by code-splitting routes. Don't optimise prematurely — only when there is a measured problem.

## Commands

```bash
npm run dev        # start dev server (localhost:5173)
npm run build      # production build → dist/
npm run lint       # ESLint
npm run preview    # preview production build locally
```

Edge functions (Deno, always deploy with `--no-verify-jwt`). On Windows CMD:
```cmd
set SUPABASE_ACCESS_TOKEN=<token>
npx supabase functions deploy analyze-reading --no-verify-jwt
npx supabase functions deploy create-student --no-verify-jwt
npx supabase functions deploy reset-student-password --no-verify-jwt
npx supabase functions deploy send-reminders --no-verify-jwt
```
In bash (Git Bash / WSL): `SUPABASE_ACCESS_TOKEN=<token> npx supabase functions deploy <name> --no-verify-jwt`

## Architecture

English reading-aloud evaluation app for students (grades 9–12 and MBA) with a teacher dashboard. Designed to be teacher-independent — AI provides per-session feedback so the teacher acts as facilitator.

**Stack:** React 19 + Vite + Tailwind v4, Supabase (auth, PostgreSQL, storage, edge functions), OpenAI Whisper API + GPT-4o-mini.  
**Deployed:** Frontend on Vercel, edge function on Supabase (ap-south-1), repo: github.com/lwspune/english-ai-tutor.

### Data flow for a reading session
1. Student opens a passage → `ReadingSession` fetches existing session count and shows "Attempt X of 3"; Start Recording is disabled if all 3 are used. Records audio via `useAudioRecorder` (MediaRecorder → WebM blob). Recording auto-stops at `max(60s, word_count / 70 * 1.5 * 60)` seconds.
2. Audio uploaded to Supabase Storage bucket `audio` under `{studentId}/{timestamp}.webm`
3. Frontend reads `app_settings.ai_feedback_enabled` and passes it along with `grade` to the edge function
4. Edge function `analyze-reading`:
   - Checks attempt count (max 3 per passage per student) — rejects before any API call if exceeded
   - Checks daily session limit (`app_settings.daily_session_limit`, default 5) — rejects if student has already hit today's cap (IST timezone); deletes uploaded audio on reject
   - Checks audio blob size (min 5 KB) — rejects silent/accidental recordings
   - Calls Whisper API (`verbose_json`, word-level timestamps)
   - Aligns spoken words to passage using DP sequence alignment (not positional matching)
   - Computes `score_accuracy`, `score_wpm`, `score_phrasing`, `count_omissions`, `count_substitutions`
   - If AI feedback on AND transcript coverage ≥ 20%: calls GPT-4o-mini → structured JSON feedback; captures `llm_input_tokens` + `llm_output_tokens` from `usage` field
   - Falls back to rule-based feedback if AI is off or GPT fails
   - Saves `sessions` row (including `whisper_duration_seconds`, `llm_input_tokens`, `llm_output_tokens`) → deletes audio → returns `{ sessionId }`
5. Student redirected to `/student/report/:sessionId` — word-by-word colour-coded report with structured feedback

### Metrics
- **Accuracy** — % of passage words read correctly (via sequence alignment)
- **Pace (WPM)** — words per minute vs grade-level target (grade 9→140, 10→150, 11→160, 12→170, MBA→180)
- **Phrasing** — % of notable pauses (>0.4s) that fall at punctuation boundaries (from Whisper timestamps)
- **Omissions** — passage words skipped entirely
- **Substitutions** — wrong word said in place of a passage word

### AI Feedback structure (GPT-4o-mini, stored as JSON in `feedback` column)
```json
{ "wentWell": "...", "focusOn": "...", "practiseWords": ["word1"], "tip": "..." }
```
`SessionReport` detects JSON vs plain text and renders accordingly — old sessions with plain-text feedback still display correctly.

### Comprehension quiz flow
After a reading session, if the passage has questions attached:
1. `SessionReport` shows an "Answer Comprehension Questions" button (only when not yet answered)
2. Student navigates to `/student/comprehension/:sessionId` — `ComprehensionQuiz` page
3. Passage text shown in a scrollable card (max-h-48) above the questions so the student can refer back
4. All questions shown at once (3–5 per passage); submit button disabled until all answered
5. Tapping Submit shows a confirmation modal ("cannot be changed") before calling the RPC
6. Answers graded server-side via `grade_comprehension` RPC — `correct_index` is never sent to the client
7. Session updated with `score_comprehension` (0–100) and `comprehension_answers` (jsonb)
8. Student redirected back to report — comprehension score ring + per-question results shown
- Quiz is **once-only per session** — revisiting the route redirects back to report
- `ComprehensionQuiz` also redirects silently if the passage has no questions
- Teacher can reset a student's comprehension attempt via the `reset_comprehension` RPC (button in StudentDetail Comp. column)

### Student pages
- `StudentHome` (`/student`) — segmented tabs (To Read | Practise | History); hero card highlights next-up passage (indigo-600, "Read Now"/"Retry Now" button); hero excluded from the tab list and hidden when paging past page 1; status bar: streak pill (amber) + daily count chip (red at limit); weekly summary modal on first visit each week. Passage lists are sorted easy → moderate → hard via `sortByDifficulty` so the hero is always the easiest unfinished passage. All tab lists paginated at 5 per page via `Pagination`. Fixed `BottomNav` at bottom.
- `ReadingSession` (`/student/session/:passageId`) — audio recording with animate-pulse red dot + countdown timer during recording; Start Recording disabled when per-passage attempt limit (3) OR daily session limit is reached
- `SessionReport` (`/student/report/:sessionId`) — accuracy hero (large `text-7xl` %, indigo-600); compact secondary metric rings (WPM, Phrasing, Comprehension); personal best banner (green, full-width) when new record; feedback card (indigo-50); comprehension CTA; word-by-word panel where vocab words appearing in the passage are marked with a dotted indigo underline and open a bottom-sheet definition card on tap (grade 11+ only, gated by `VOCAB_GRADES` set). Sheet renders `VocabSheet` with word, part of speech, definition, example sentence.
- `ComprehensionQuiz` (`/student/comprehension/:sessionId`) — once-only quiz with confirmation modal
- `StudentProgress` (`/student/progress`) — sparkline trend charts for Accuracy, Pace, Phrasing, Comprehension; fixed `BottomNav` at bottom
- `VocabHome` (`/student/vocab`) — grades 11/12/MBA only (others see "Vocabulary practice unlocks in grade 11"). Loads total word count + own progress, shows mastered/total card with indigo progress bar + due-today CTA with Start Practice button. Button disabled when no due AND no new available (`canPractice = due > 0 || newAvailable > 0`). Shows a small `seen-from-reading` line under the mastered bar when `last_encounter_source = 'reading'` rows exist, attributing reading exposure separately from practice. Fixed `BottomNav` at bottom.
- `VocabPractice` (`/student/vocab/practice`) — daily deck flow. On mount: pulls all words + own progress → `assembleDeck` → `buildPracticeCards` (max 10). Per card: shows word, part of speech, definition, example sentence, then a 4-option MCQ (synonym/antonym alternating). Tap option → immediate green/red feedback + Next/Finish button → calls `grade_vocab_attempt` RPC in the background. End screen shows `X of Y` correct + Done. Single-shot per session; revisit re-assembles the deck.

### Teacher dashboard
- **Header** — two rows: identity row (title + teacher name + sign out) + controls strip (Manage Passages / Passage Completion nav links; class code chip with one-tap copy; daily limit stepper clamped 1–20; AI Feedback toggle — indigo when on, slate when off)
- **Summary stat chips** — 4 chips above the class table (2×2 on mobile, 1×4 on `sm:`): total Students, total Sessions, class Avg Accuracy, Vocab Mastery (% averaged across grade 11+ students). All `data-testid`d (`stat-students`, `stat-sessions`, `stat-accuracy`, `stat-vocab`); vocab chip shows `—` when no grade 11+ students.
- **Add Student button** — opens `AddStudentModal` (two tabs: Single student form / Import CSV); calls `create-student` edge function; refreshes class list on success
- **Class Performance table** — per-student: sessions, avg accuracy, avg WPM, last session, total OpenAI cost; class total cost shown below table; row hover `bg-indigo-50`
- **Passage Completion** (`/teacher/completion`) — per-passage cards showing count completed + chips for students who haven't read yet; chips link to student detail
- **Student detail** (`/teacher/student/:id`) — summary stats, sparkline performance trends (Accuracy, Pace, Phrasing, Comprehension), recurring difficult words, session progress table with ↑/↓ trend arrows, per-session OpenAI cost, comprehension Reset button, expandable per-session AI feedback panel, and Reset Password button (calls `reset-student-password` edge function)
- **Passage editing** — Edit button on each passage card in `PassageManager` pre-fills the form; submit runs UPDATE and recalculates `word_count`
- **Question Manager** — inline panel per passage in `PassageManager`; add/edit/delete MCQs (3–5 per passage, DB-enforced by trigger); edit pre-fills the form and stays accessible even at the 5-question limit

### Shared components / lib
- `src/components/PerformanceCharts.jsx` — exports `MetricCard` (sparkline card with Latest/Best/Change stats); used in both `StudentProgress` and `StudentDetail`
- `src/components/AddStudentModal.jsx` — two-tab modal (Single / Import CSV) for teacher to add students; calls `create-student` edge function
- `src/lib/wpmTargets.js` — exports `WPM_TARGETS` constant `{ 9: 140, 10: 150, 11: 160, 12: 170, MBA: 180 }`
- `src/lib/studentStats.js` — exports `computeAvgComprehension(sessions)`
- `src/lib/passageClassifier.js` — exports `classifyPassages(passages, sessions)` → `{ todo, retry }`; mastery threshold `MASTERY_THRESHOLD = 80`
- `src/lib/passageOrder.js` — exports `sortByDifficulty(passages)`; orders easy → moderate → hard, tiebreaks by `created_at` ASC, treats null/missing difficulty as easy. Used by `StudentHome` so the hero "Next Up" picks the easiest unfinished passage and the To Read / Practise lists progress by difficulty.
- `src/lib/streak.js` — exports `computeStreak(sessions, today)` → number; school days (Mon–Fri) only, IST timezone
- `src/lib/costUtils.js` — exports `computeSessionCost({ whisper_duration_seconds, llm_input_tokens, llm_output_tokens })` → USD or null; `formatCost(usd)` → `"$0.0042"` or `"—"`. Pricing: Whisper $0.006/min, GPT-4o-mini $0.15/$0.60 per 1M tokens
- `src/lib/edgeFunctionError.js` — exports `extractEdgeFunctionError(fnError)`; reads JSON body from `fnError.context.json()` and returns `body.error`, falling back to `fnError.message`. Use this instead of `data?.error` because `data` is always `null` for non-2xx edge function responses
- `src/lib/weeklySummary.js` — exports `getWeekKey(date)`, `shouldShowWeeklySummary(studentId)`, `markWeeklySummaryShown(studentId)`, `computeWeeklySummaryData(sessions, today)`. Week boundary is Mon–Sun IST. localStorage-backed.
- `src/components/WeeklySummaryModal.jsx` — overlay modal for weekly summary; props: `data`, `streak`, `onDismiss`
- `src/components/Pagination.jsx` — shared pagination control; exports `PAGE_SIZE = 5` (named) and the component (default); props: `page`, `total`, `onPrev`, `onNext`, `testIdPrefix` (optional); renders nothing when `total ≤ PAGE_SIZE`
- `src/components/BottomNav.jsx` — fixed bottom nav for student screens; tabs are Home (`/student`), Vocab (`/student/vocab`, only shown when `profile.grade ∈ {'11','12','MBA'}`), Progress (`/student/progress`); `aria-current="page"` on active tab; Vocab tab matches `/student/vocab*` so it stays active on the practice screen; `min-h-[56px]` touch target.
- `src/lib/reminders.js` — exports `buildReminderList(users, profiles, sessions, now)` → `[{ id, name, email, type: 'activation'|'reengagement', lastAccuracy? }]`. Pure function (no Supabase/Deno deps) used by `send-reminders` edge function and unit-tested in `src/lib/reminders.test.js`. Constants: `REMINDER_INTERVAL_MS` = 3 days, `MIN_ACCOUNT_AGE_MS` = 2 days.
- `src/lib/shuffleQuestionOptions.js` — exports `shuffleOptions({ options, correct_index }, rng?)` → Fisher-Yates permutation that preserves the correct-answer text at the new `correct_index`. Called by `QuestionPanel.handleSubmit` so every saved/updated MCQ has a randomised option order. Default RNG is `Math.random`; tests pass a seeded RNG.
- `src/lib/srs.js` — Leitner 5-box spaced-repetition primitives. Exports `BOX_INTERVALS_DAYS = [1, 3, 7, 14, 30]`, `MAX_BOX = 5`, `MASTERY_CORRECT_THRESHOLD = 3`, and pure functions `nextReview(currentBox, wasCorrect, now)` → `{ nextBox, nextReviewAt }`, `isMastered({ srs_box, correct_count, mastered_at })` → bool, `dueWords(progressList, now)` → filtered + sorted list.
- `src/lib/vocabDeck.js` — exports `assembleDeck(progressList, allWords, now, options?)` → ordered cards (due first by `next_review_at` asc, then up to `maxNew` new words by `created_at` asc; default `maxNew = 5`). Excludes mastered words. Attaches the matching progress row (or `null`) to each card.
- `src/lib/vocabPracticeCard.js` — exports `buildPracticeCards(deckWords, allWords, options?)`. For each deck word: alternates `synonym` / `antonym` exercise type, picks the first synonym/antonym as the correct answer, draws 3 distractors from other words' synonym/antonym strings (excluding forbidden), shuffles options. Falls back to synonym when antonyms are empty; skips words with both empty. Default `maxCards = 10`.
- `src/pages/ResetPasswordPage.jsx` — public route at `/reset-password`. Three states: waiting (before `PASSWORD_RECOVERY` event), Set-password form (after event), expired/invalid link (when URL hash carries `error_code`). The expired state inlines an email form that re-calls `supabase.auth.resetPasswordForEmail`.

### Auth & routing
- `AuthContext` holds both the Supabase `user` and app `profile` (from `profiles` table). Always use `profile` for role/grade — never `user.user_metadata` in components.
- `ProtectedRoute` accepts optional `role` prop (`"teacher"` | `"student"`). Root `/` redirects based on `profile.role`.
- **Student self-registration:** `LoginPage` has Sign In / Sign Up tabs. Sign Up validates a class code via `validate_class_code` RPC (callable by anon), then calls `supabase.auth.signUp()` with `raw_user_meta_data: { full_name, role: 'student', grade }`. The `handle_new_user` trigger auto-creates the profile. Teachers cannot self-register.
- **Password reset (self-service):** `LoginPage` sign-in form has a "Forgot password?" trigger that switches to an inline form calling `supabase.auth.resetPasswordForEmail(email, { redirectTo: '/reset-password' })`. The recovery link lands on the public `/reset-password` route (`ResetPasswordPage`), which listens for the `PASSWORD_RECOVERY` auth event and shows a Set-password form. If the link is expired/invalid, the URL hash carries `error_code=otp_expired|...` and the page renders an inline "Send new link" form instead. The Supabase recovery email subject + HTML template was customised via Management API to match the slate/indigo design system; `uri_allow_list` includes the production `/reset-password` URL.
- The `handle_new_user` DB trigger auto-creates a `profiles` row on signup using `raw_user_meta_data`. The function pins `search_path = public` and qualifies inserts as `public.profiles` — see Known production quirks for why. When creating users manually via the Supabase dashboard, insert profiles via SQL instead (the dashboard doesn't set metadata at creation time).
- `onAuthStateChange` intentionally ignores `TOKEN_REFRESHED` and `INITIAL_SESSION` events — acting on them sets `loading=true` and causes a full page remount when the user switches back to the tab.

### Database schema (key points)
- `profiles` — `role` is `teacher` or `student`; `grade` is `text` (`'9'`–`'12'` or `'MBA'`, null for teachers); migration 009 changed this from `int`. `last_reminder_sent timestamptz` (added migration 013) tracks last activation/re-engagement email timestamp.
- `passages` — `word_count` computed client-side on insert/edit in `PassageManager`; `grade_level` is `text` (`'9'`–`'12'` or `'MBA'`, nullable for all-grades passages); migration 009 changed this from `int`; `difficulty` is `text` (`'easy'` | `'moderate'` | `'hard'`, default `'easy'`, CHECK constraint enforced) added in migration 011; constraint made idempotent in migration 012
- `sessions` — `word_results` JSONB `[{ word, spoken, status }]`, status ∈ `correct | substitution | omission`; also stores `score_accuracy`, `score_wpm`, `score_phrasing`, `score_fluency` (same as phrasing, kept for compat), `count_omissions`, `count_substitutions`, `feedback` (JSON string or plain text), `score_comprehension` (int nullable), `comprehension_answers` (jsonb nullable — `[{ question_id, selected_index, is_correct }]`), `whisper_duration_seconds` (numeric nullable), `llm_input_tokens` (int nullable), `llm_output_tokens` (int nullable), and `spike_audio_path` (text nullable; added migration 014) — populated only when the Phase 1 audio-retention flag is on. Last three are null for sessions recorded before migration 010.
- `questions` — `passage_id` FK, `question_text`, `options` (jsonb array of 4 strings), `correct_index` (0–3), `display_order`; max 5 per passage enforced by DB trigger `enforce_question_limit`
- `vocabulary_words` (migration 015) — `word text unique`, `part_of_speech text`, `definition text`, `example_sentence text`, `synonyms jsonb` (array of strings), `antonyms jsonb` (array of strings), `difficulty text` CHECK in `('medium','hard','very_hard')`, `source text` default `'nda-2026'`. 865 NDA-prep words seeded via in-conversation LLM generation (`scripts/vocab/entries.json` + `upload.py`). RLS: `SELECT` open to all `authenticated`; writes via service role only.
- `student_word_progress` (migration 015) — composite PK `(student_id, word_id)`. `srs_box smallint` CHECK 1–5 default 1, `next_review_at timestamptz` default now, `correct_count int` default 0, `total_encounters int` default 0, `mastered_at timestamptz` nullable, `last_encounter_source text` CHECK in `('practice','reading')` nullable (added migration 017), `created_at` + `updated_at`. Index on `(student_id, next_review_at) WHERE mastered_at IS NULL` for fast deck queries. RLS: `SELECT` own rows + teachers (via `is_teacher()`); writes only via `grade_vocab_attempt` (practice) or `record_vocab_reading_encounters` (reading) RPCs.
- `app_settings` — single-row table (`id boolean PK default true`), holds `ai_feedback_enabled boolean`, `class_code text` (random 6-char code set on migration; teacher shares with students for self-registration), `daily_session_limit int` (default 5; teacher adjusts via dashboard stepper, clamped 1–20), `cron_secret text` (auto-generated in migration 013; shared between pg_cron job and `send-reminders` edge function), and three Phase 1 spike fields added in migration 014: `spike_audio_retention boolean` (default false), `spike_audio_retention_count int` (default 0), `spike_audio_retention_limit int` (default 10). When `spike_audio_retention` is on, `analyze-reading` retains the audio for up to `limit` sessions instead of deleting it. The flag auto-disables itself when the count reaches the limit.
- RLS on all tables. `is_teacher()` security definer function used in profiles policy to avoid infinite recursion.
- **Scheduled jobs:** pg_cron + pg_net schedule `send-daily-reminders` runs at 04:30 UTC (10:00 AM IST) and POSTs to the `send-reminders` edge function with `x-cron-secret` header. Defined in migration 013.

### RPCs
- `grade_comprehension(p_session_id, p_answers)` — server-side comprehension grading; validates session ownership, prevents re-grading, saves score atomically
- `reset_comprehension(p_session_id)` — teacher-only; clears `score_comprehension` and `comprehension_answers` for a session
- `validate_class_code(p_code)` — callable by anon; returns boolean; used during student signup
- `try_claim_spike_slot()` — service-role only; atomically increments `app_settings.spike_audio_retention_count` and returns the new count, or null if the flag is off or the limit is reached. Auto-flips `spike_audio_retention` to false when the limit is hit. Called by `analyze-reading` to decide whether to retain or delete audio for the Phase 1 spike.
- `grade_vocab_attempt(p_word_id uuid, p_was_correct boolean)` — security-definer, granted to `authenticated`. Atomically upserts the caller's `student_word_progress` row applying the Leitner SRS rule (intervals `[1,3,7,14,30]` days, max box 5). Correct increments `correct_count`; wrong drops to box 1 (count preserved). `mastered_at` is set when reaching box 5 with `correct_count >= 3` and stays set thereafter — subsequent attempts still increment `total_encounters` but never un-master. Stamps `last_encounter_source = 'practice'`.
- `record_vocab_reading_encounters(p_student_id uuid, p_words text[])` — service-role only. Bulk-bumps `total_encounters` for any vocab words whose `lower(word)` appears in `p_words` (passed as normalised lowercase tokens). Stamps `last_encounter_source = 'reading'`. Does NOT change `srs_box`, `correct_count`, `next_review_at`, or `mastered_at` — reading is exposure-only. Idempotent across replays. Called best-effort by `analyze-reading` after the session row is saved.

### Edge functions
- `analyze-reading` — main reading evaluation pipeline (Whisper + GPT-4o-mini); saves cost metrics to sessions. Before deletion, calls `try_claim_spike_slot()`; when a slot is claimed, audio is kept and `spike_audio_path` is written to the session row. After the session insert, best-effort calls `record_vocab_reading_encounters` with the passage's normalised words to bump vocab exposure counters (v2.1 reading integration).
- `create-student` — teacher creates one or many students; accepts `{ students: [{ full_name, email, password, grade }] }`; verifies caller is teacher; uses `auth.admin.createUser` with `email_confirm: true`; `handle_new_user` trigger auto-creates profiles. After successful creation, sends a welcome email per student via Resend (wrapped in `Promise.allSettled` — email failures do not fail the user creation).
- `reset-student-password` — teacher resets a student's password; accepts `{ student_id, new_password }`; verifies caller is teacher; guards against resetting non-student accounts; uses `auth.admin.updateUserById`
- `send-reminders` — daily activation/re-engagement engine; called by pg_cron at 04:30 UTC. Validates `x-cron-secret` header against `app_settings.cron_secret`. Builds a list of students who either never logged in (account ≥ 2 days old) or have been inactive 3+ days, with a 3-day cooldown between reminders to the same student. Activation emails contain a fresh `admin.generateLink({ type: 'recovery' })` link so the student can set their own password (not a stored plaintext). Re-engagement emails link directly to the app. Pure list-building logic lives in `src/lib/reminders.js` (`buildReminderList`) and is unit-tested.
- **Deployed via MCP but not in repo source** — three one-shot helper functions live on the project with no `supabase/functions/*` directory; if you ever need a clean redeploy from `git`, rewrite them (small) or recover from conversation history:
  - `spike-audio-url` — accepts `{ sessionId }`, returns a 10-minute signed URL for the matching `spike_audio_path` (used by `scripts/spike/spike_compare.py`).
  - `spike-cleanup` — bulk-deletes every retained audio file from the `audio` bucket and clears `spike_audio_path` on all sessions.
  - `vocab-insert` — bulk upsert into `vocabulary_words`; was used once for the 865-word seed and can be deleted (replaced by `scripts/vocab/upload.py` + the committed `entries.json`).
  - All three deploy with `verify_jwt: false` and authorise via service role internally.

### Phase 1 forced-alignment spike (in progress — not yet a production feature)

A validation effort to replace Whisper as the scoring engine with CTC forced alignment. Whisper's LM smoothing inflates accuracy on weak/fast readers (n=2 spike: clean read scored Whisper 100% vs FA 56%). FA is structurally accent-tolerant once a rule layer is applied. Cost trajectory: ~$135/mo Whisper → ~$10/mo Fly.io-hosted FA service.

- `services/forced-alignment/ie-v1.json` — versioned Indian-English phoneme tolerance rules (th-stopping, /v/-/w/ merger, retroflex /t/-/d/, epenthetic vowels in clusters). Drafted but not yet applied — Phase 1 service will consume it.
- `scripts/spike/spike_fa.py` — standalone CTC forced-alignment scorer (wav2vec2-base-960h + torchaudio `forced_align` + Python stdlib `wave` for decoded WAV reading). Run via the venv at `scripts/spike/.venv/`.
- `scripts/spike/spike_compare.py` — orchestrator. Reads a manifest JSON of `{session_id, passage_text, whisper: {...}}`, calls `spike-audio-url` to download retained audio, runs FA, writes `spike-audio/results.csv` and per-session detail JSONs.
- `scripts/spike/inspect_detail.py` — ad-hoc analyser of FA detail JSON (score distributions, low-scoring words). Used to diagnose threshold + status mapping issues.
- `scripts/spike/README.md` — setup + run instructions.
- `spike-audio/` — gitignored output dir; captured `.webm` files, `details/*.json`, and `results.csv` live here during a spike run. Cleanup via `spike-cleanup` edge function once the round is done.

Live state of the spike (count, recent verdict, next steps) is tracked in `memory/project_fa_spike.md`, not in this file.

### Known production quirks
- **Edge function must be deployed with `--no-verify-jwt`** — Supabase's new `sb_publishable_...` key format is not a JWT, so the runtime rejects requests otherwise.
- **On Windows CMD, `KEY=value command` syntax doesn't work** — use `set KEY=value` then the command on a separate line. In bash (Git Bash / WSL) the inline syntax works fine.
- **`handle_new_user` must qualify `public.profiles` and pin `search_path = public`** — installing `pg_cron` / `pg_net` (migration 013) shifted the function's resolved schemas, so unqualified `profiles` started failing with `relation "profiles" does not exist`. Symptom: `auth.admin.createUser` returned an error and `auth.users` had no row. Fix was applied via `apply_migration` (`handle_new_user_search_path`) but is not yet captured as a numbered migration file in the repo.
- **Resend domain verification:** sender `tutor@lwspune.in` requires the domain to be verified on Resend (SPF + DKIM DNS records). Until verified, Resend returns `403 "domain not verified"` and `Promise.allSettled` swallows the error so users get created without a welcome email. Pending — see `memory/project_pending_resend.md`.
- **Creating teacher accounts manually:** Supabase Auth dashboard doesn't set `raw_user_meta_data` at creation time, so the trigger inserts with default role `student`. Always follow up with a manual SQL insert into `profiles` for the correct role/name.
- **Email confirmation:** If Supabase Auth email confirmation is enabled, students see a "check your email" screen after signup. For school use, consider disabling it (Auth → Settings → disable email confirmations).
- **Storage RLS:** `storage.objects` has a policy `students can upload audio` allowing authenticated users to upload to their own folder (`{uid}/...`). Service role in the edge function bypasses this for downloads.
- **Class code:** Set once by migration (random 6-char hex). To change it: `update app_settings set class_code = 'NEWCODE' where id = true;`
- **Vercel repo visibility:** The repo is public on GitHub. Vercel Hobby plan blocks deployment of commits from non-member collaborators on private repos — making the repo public was the fix. If the repo is ever made private again, all committers must be added as Vercel team members (requires a paid plan).
- **Creating student accounts:** Use the "Add Student" button on the teacher dashboard (single or CSV bulk). For emergency SQL inserts: use `auth.users` directly with `crypt(password, gen_salt('bf'))` and `raw_user_meta_data: { full_name, role: 'student', grade }` — do NOT use the Supabase dashboard UI as it doesn't set `raw_user_meta_data`.

### Environment variables
Frontend (`.env.local`):
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY` (new format: `sb_publishable_...`)

Edge function secrets (Supabase dashboard → Edge Functions → Secrets):
- `OPENAI_API_KEY` — used for both Whisper and GPT-4o-mini
- `RESEND_API_KEY` — used by `create-student` (welcome emails) and `send-reminders` (activation/re-engagement emails)
- `SUPABASE_SERVICE_ROLE_KEY` (auto-injected by Supabase runtime)

### Decisions log

Key product and architecture decisions captured here so future sessions don't re-debate them.

| Decision | Chosen | Why |
|---|---|---|
| Daily session limit scope | Class-wide (one value in `app_settings`) | Per-student overrides add complexity with little learning benefit; teacher can adjust the global limit |
| Daily limit enforcement | Server-side in edge function (fetched from DB, not trusted from client) | Client-side only is trivially bypassed; server fetch adds one extra DB read which is acceptable |
| AI feedback flag | Passed from client, not re-fetched server-side | Not security-critical — a student enabling their own AI feedback is harmless |
| Day boundary timezone | IST throughout (client and edge function) | All users are in the same school; IST midnight is the natural reset point |
| Comprehension grading | Server-side RPC; `correct_index` never sent to client | Prevents client-side cheating; once-only enforced in the RPC |
| Confirmation modal before comprehension submit | Required | Quiz is irreversible; modal prevents accidental submission |
| Leaderboards | Explicitly excluded | Demotivate the bottom half of the class in a known-peer setting |
| MBA as a grade level | `grade`/`grade_level` stored as `text` (not int) | Allows non-numeric grade labels; migration 009 cast existing int values to text |
| Creating student accounts manually | Insert directly into `auth.users` via SQL (not via dashboard) | Supabase dashboard doesn't set `raw_user_meta_data` at creation time; direct SQL insert lets the `handle_new_user` trigger fire correctly with grade and role |
| Teacher adds students from dashboard | `create-student` edge function (service role); teacher-set password; `email_confirm: true` | Service role key cannot be in the browser; teacher-set password is simpler than invite email for a school context where teachers distribute credentials |
| CSV bulk import | Client-side parse (native FileReader + split); validation preview before import; same edge function as single-add (array payload) | No library needed for simple CSV; previewing errors before import prevents surprises |
| Teacher resets student password | `reset-student-password` edge function; guards against resetting non-student accounts | Requires service role; guard prevents a teacher accidentally resetting another teacher's password |
| OpenAI cost tracking | Store raw metrics (`whisper_duration_seconds`, `llm_input_tokens`, `llm_output_tokens`); compute cost in JS at render time | Raw metrics survive pricing changes; `costUtils.js` is the single place to update rates |
| Weekly summary trigger | localStorage (key per student ID) not server-side column | No migration needed; acceptable risk of reset on browser clear; simpler than a DB column for low-stakes feature |
| Assigned passages pagination | 5 per page, client-side slice of already-fetched array | No extra DB queries; all passages already fetched on load; 5 fits comfortably on a phone screen |
| Recent sessions storage | Store all sessions in state (was capped at 10) | Needed for correct pagination; sessions array is small (students rarely exceed 100 total) |
| UI colour system | `slate-*` for neutrals, `indigo-*` for primary actions; red/green/amber retained as semantic colours | Consistent single palette across all components; gray/blue were mixed inconsistently before |
| StudentHome layout | Segmented tabs (To Read / Practise / History) + hero card for next-up passage | Hero gives the student a clear single call to action; tabs reduce visual noise vs three stacked lists |
| TeacherDashboard header | Split identity row + controls strip | Cramped single-row header wrapped on laptop screens; separation makes each group of controls scannable |
| TeacherDashboard stat chips | 3 summary chips (Students / Sessions / Avg Accuracy) computed from already-fetched student list | Teacher needs a class pulse at a glance before drilling into rows; no extra DB query needed |
| Colour-only UI changes | No new tests required | Presentational changes carry no behaviour to test; existing tests already verify component renders correctly |
| Self-service password reset | `supabase.auth.resetPasswordForEmail` called from frontend (no edge function); landing page is `/reset-password` | Built-in Supabase flow is rate-limited (2/hour) and free; an edge function would just be a wrapper |
| Activation flow uses recovery links | `admin.generateLink({ type: 'recovery' })` in welcome/activation emails, not stored plaintext passwords | Same UX as forgot-password; works for re-engagement of existing users; avoids exposing teacher-set passwords in email |
| Reminder scheduling | pg_cron + pg_net inside Supabase, not external cron service | Stays on the existing stack; cron secret in `app_settings` shared with edge function for auth |
| Email provider | Resend with custom domain (`tutor@lwspune.in`) | Owned-domain sender for trust; Supabase invite emails were skipped because they don't fit a teacher-distributed-credentials flow |
| Recovery email template | Customised once via Management API to serve both first-time activation and password reset | Supabase only has one `recovery` template — copy is written generically ("set your password") to fit both contexts |
| Passage ordering on StudentHome | Sort by difficulty (easy → moderate → hard), tiebreak by `created_at` ASC; client-side via `sortByDifficulty` | PostgREST sorts text columns alphabetically (`easy, hard, moderate` — wrong order), so a pure helper is the right place. Teacher views still order by `created_at DESC` |
| MCQ option order randomised on save | `QuestionPanel.handleSubmit` calls `shuffleOptions` before insert/update; bulk re-shuffle migration ran on all 266 existing questions (backup in `questions_backup_preshuffle` until dropped) | LLM-generated MCQs (especially MBA-level) skewed heavily — 21 of 30 5-question passages had every answer as "B". Students could pick B and pass. Word-level shuffling preserves the correct option's text and prevents future drift. |
| Phase 1 scoring engine | Migrate from Whisper to CTC forced alignment on Fly.io (Mumbai region), word-level scoring only, accent-tolerance rules applied post-alignment | Whisper's LM smooths real reading errors (regressive bias — biggest lift goes to weakest readers), corrupting the mastery gate. FA scoring is structurally honest. Self-hosted is cost-flat vs Whisper's per-minute pricing. |
| Accent-bias defense | Layered: (1) word-level scoring (not phoneme) for grading, (2) IE-aware acoustic model when available, (3) JSON ruleset of tolerated phoneme substitutions (`services/forced-alignment/ie-v1.json`). Default stance: "when ambiguous, favour 'correct'" | Indian English speakers systematically substitute /θ/→/t/, /v/↔/w/, etc. — these are legitimate dialect features, not errors. Penalising them is pedagogically wrong. Word-level scoring is robust across accents; phoneme rules cover the remaining cases. |
| Phase 1 spike methodology | Toggle `spike_audio_retention`, capture N production sessions, re-score with FA, compare CSV to Whisper — instead of synthetic test audio | Real production audio is the only honest validator. Avoids synthetic-audio bias and forces us to handle the real WebM/Opus pipeline. Capture is gated by a per-session atomic counter so we never accidentally retain more than configured. |
| Vocabulary practice scope (v1) | Standalone deck flow at `/student/vocab*`, grade-gated to 11+, MCQ-only (synonym + antonym alternation), Leitner 5-box SRS, no audio | NDA-prep audience needs synonym/antonym recognition more than pronunciation. Pure-MCQ ships in a week. Read-aloud + TTS audio waits for v2 after Phase 1 FA migration so vocab scoring auto-improves rather than carrying Whisper inflation. |
| Vocabulary seeding | Generated in-conversation via Claude (this assistant), saved as `scripts/vocab/entries.json` + `batch_*.json`, uploaded via the `vocab-insert` edge function | User chose Claude over OpenAI for the seed pass: zero extra vendor cost (already paying for the conversation), better contextual control over school tone. One-shot operation, repeatability provided by `entries.json` + `upload.py` rather than the LLM call itself. |
| Vocabulary mastery rule | `srs_box = 5 AND correct_count >= 3` sets `mastered_at` and it sticks — failed attempts on mastered words bump `total_encounters` but never un-master. | Avoids the inconsistent state "previously mastered but currently in box 1". Maintenance check resurfacing is a v2 concern. Pragmatic v1 simplification. |
| Reading-as-vocab-exposure (v2.1) | Reading a passage bumps `total_encounters` for any vocab word in the passage but does NOT change SRS state (`srs_box`, `correct_count`, `next_review_at`, `mastered_at` unchanged). Both hits and misses count as exposure. Source tracked via `last_encounter_source = 'reading'`. | Reading is passive recognition, not active recall — SRS is meant for active practice. Counting reading exposures as mastery progress would let students master words without actively recalling them, defeating the gate. Tracking source still gives the UI a way to surface "X words encountered through your reading." |

### Adding teacher accounts (manual process)
```sql
-- After creating user in Auth dashboard (email + password only):
insert into profiles (id, full_name, role, grade)
select id, 'Full Name', 'teacher', null
from auth.users where email = 'teacher@school.com';
```

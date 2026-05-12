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
Daily reading habit is the goal. Show a streak counter for consecutive school days (Mon–Fri) with at least one session. Weekends don't break the streak. A missed school day does. Streak shows even before today's session is done (it's "at risk", not broken). Never punish a broken streak — just reset to 0 and let the student rebuild. Implementation: `src/lib/streak.js` → `computeStreak(sessions, today)`. Crossing a 5/10/20-day milestone for the first time fires `Confetti` + `feedback('celebrate')` on `StudentHome` (localStorage key `streak_milestone_seen_{studentId}` tracks the highest seen milestone so it fires only once per crossing).

### Personal Best — built
After every scored attempt, compare against all previous attempts on the same item. Show "New personal best!" with the specific improvement (accuracy %, WPM). If not a new best, show the current best quietly so the student knows what to aim for. Track accuracy and WPM independently — either improving is worth celebrating. Never show a score in isolation without context of where the student has been. A new personal best (or comprehension ≥80%) fires full-screen `Confetti` + `feedback('celebrate')` on `SessionReport`.

### Milestones — partial
The full milestone log (a dedicated "Milestones earned" surface for the student) is not yet built. The in-flight *celebration cues* are: streak crossings (5/10/20), personal best, comprehension ≥80%, and first-mastery of a vocabulary word. Good milestones: first 80%+ accuracy, 5-passage streak, improved accuracy week-over-week, first comprehension quiz completed. Bad milestones: "logged in 3 days in a row", "earned 100 XP". Each milestone must correspond to a genuine learning achievement.

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

## Operations

Deployment commands, environment variables, manual procedures, and production quirks live in [`OPERATIONS.md`](./OPERATIONS.md). Active product priorities live in [`ROADMAP.md`](./ROADMAP.md).

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
- `StudentHome` (`/student`) — segmented tabs (To Read | Practise | History); hero card highlights next-up passage (indigo-600, "Read Now"/"Retry Now" button); hero excluded from the tab list and hidden when paging past page 1; status bar: streak pill (amber) + gear icon (opens `FeedbackSettingsSheet`) + daily count chip (red at limit); weekly summary modal on first visit each week; streak milestone confetti when crossing 5/10/20 days for the first time. Passage lists are sorted easy → moderate → hard via `sortByDifficulty` so the hero is always the easiest unfinished passage. All tab lists paginated at 5 per page via `Pagination`. Fixed `BottomNav` at bottom.
- `ReadingSession` (`/student/session/:passageId`) — audio recording with animate-pulse red dot + countdown timer during recording; Start Recording disabled when per-passage attempt limit (3) OR daily session limit is reached. Start/Stop buttons fire `feedback('tap')` for tactile confirmation.
- `SessionReport` (`/student/report/:sessionId`) — accuracy hero (large `text-7xl` %, indigo-600); compact secondary metric rings (WPM, Phrasing, Comprehension); personal best banner (green, full-width) when new record; feedback card (indigo-50); inline vocab retention quiz (1–3 MCQs, once-only, skippable, persisted to `sessions.vocab_retention_answers`); comprehension CTA; `<StumbleDrillCard>` (chips for top 3 recurring+latest stumble words → `/student/drill/:sessionId/:wordIndex`); word-by-word panel where vocab words appearing in the passage are marked with a dotted indigo underline and open a bottom-sheet definition card on tap (grade 11+ only, gated by `VOCAB_GRADES` set). Sheet renders `VocabSheet` with word, part of speech, definition, example sentence, and an `AudioPlayButton` next to the word; sheet slides up with the `sheet-spring` animation. Personal best OR comprehension ≥80% OR 3 distinct correct drills fires `Confetti` + `feedback('celebrate')` once per session (de-duped via `celebratedRef`); awards the corresponding milestone(s).
- `StumbleDrill` (`/student/drill/:sessionId/:wordIndex`) — deliberate-practice page. On mount: fetches the session + last 5 sessions, re-derives stumbles via `selectStumbleWords`, picks `stumbles[wordIndex]`, extracts a sentence from the passage via `findSentence`, fetches prior `drill_attempts` for the same word. Shows the word + `SpeakWordButton` (browser `speechSynthesis`, no server roundtrip) + the sentence in context. Record → Stop (15s cap) → Submit → uploads audio → invokes `analyze-drill` → shows ✓ "Got it!" or ✗ "Try again" with attempts-remaining counter. After 3 attempts: "No attempts left." Fires `feedback('correct')` / `feedback('wrong')` on result; `feedback('tap')` on Record/Stop. Done button returns to `/student/report/:sessionId` where the ace-detection trigger picks up. Redirects to report when `wordIndex` is out of bounds.
- `ComprehensionQuiz` (`/student/comprehension/:sessionId`) — once-only quiz with confirmation modal. Confirmed submit fires `feedback('swoosh')`.
- `StudentProgress` (`/student/progress`) — sparkline trend charts for Accuracy, Pace, Phrasing, Comprehension; fixed `BottomNav` at bottom
- `VocabHome` (`/student/vocab`) — grades 11/12/MBA only (others see "Vocabulary practice unlocks in grade 11"). Loads total word count + own progress, shows mastered/total card with indigo progress bar + due-today CTA with Start Practice button. Button disabled when no due AND no new available (`canPractice = due > 0 || newAvailable > 0`). Shows a small `seen-from-reading` line under the mastered bar when `last_encounter_source = 'reading'` rows exist, attributing reading exposure separately from practice. Fixed `BottomNav` at bottom.
- `VocabPractice` (`/student/vocab/practice`) — daily deck flow. On mount: pulls all words + own progress → `assembleDeck` (includes maintenance-due mastered words) → `buildPracticeCards` (max 10). Per card: shows word, part of speech, an `AudioPlayButton` to play pronunciation, definition, example sentence, then a 4-option MCQ (synonym/antonym alternating). Tap option → `feedback('correct')`/`feedback('wrong')` + card-pulse-correct or card-shake-wrong animation on the chosen option → Next/Finish button → calls `grade_vocab_attempt` RPC in the background. First-mastery detection: if the pre-answer progress row was at the tipping point (`srs_box ≥ MAX_BOX - 1 AND correct_count + 1 ≥ MASTERY_CORRECT_THRESHOLD AND mastered_at IS NULL`), a correct answer fires `Confetti` + `feedback('celebrate')` instead of the regular tone. End screen shows `X of Y` correct + Done. Single-shot per session; revisit re-assembles the deck.

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
- `src/lib/srs.js` — Leitner 5-box spaced-repetition primitives. Exports `BOX_INTERVALS_DAYS = [1, 3, 7, 14, 30]`, `MAX_BOX = 5`, `MASTERY_CORRECT_THRESHOLD = 3`, `MAINTENANCE_INTERVAL_DAYS = 30`. Pure functions `nextReview(currentBox, wasCorrect, now)` → `{ nextBox, nextReviewAt }`, `isMastered({ srs_box, correct_count, mastered_at })` → bool, `isDueForMaintenance({ mastered_at }, now)` → bool (true for mastered words ≥30 days old), `dueWords(progressList, now)` → filtered + sorted list.
- `src/lib/vocabDeck.js` — exports `assembleDeck(progressList, allWords, now, options?)` → ordered cards (due first by `next_review_at` asc, then up to `maxNew` new words by `created_at` asc; default `maxNew = 5`). Excludes mastered words **except** those past the maintenance interval, which re-enter the deck for a single check.
- `src/lib/vocabPracticeCard.js` — exports `buildPracticeCards(deckWords, allWords, options?)`. For each deck word: alternates `synonym` / `antonym` exercise type, picks the first synonym/antonym as the correct answer, draws 3 distractors from other words' synonym/antonym strings (excluding forbidden), shuffles options. Falls back to synonym when antonyms are empty; skips words with both empty. Cards include `audio_path` for the tap-to-hear button. Default `maxCards = 10`.
- `src/lib/vocabRetentionQuiz.js` — exports `buildRetentionQuiz(wordResults, vocabMap, studentProgress, allVocab)` and `retentionCap(passageWordCount)`. Picks 1–3 (depending on passage length: <100→1, 100–200→2, 200+→3) unmastered vocab words that appear in `wordResults`, dedupes, and builds MCQ cards via `buildPracticeCards`. Used by SessionReport's inline retention quiz.
- `src/components/AudioPlayButton.jsx` — small speaker-icon button. Takes `audioPath` (the storage path) and `word` (for aria-label). On tap, builds the public URL via `supabase.storage.from('vocab-audio').getPublicUrl(audioPath)` and plays an `Audio` instance. Toggle to pause; auto-reverts label when `ended` event fires. Renders nothing when `audioPath` is null.
- `src/lib/feedback.js` — engagement-polish primitives. Exports `getPrefs()` / `setPrefs({ sound?, haptics? })` (localStorage-backed, both default ON), `playSound(type)` (Web Audio synthesis — no asset bundle; types: `tap`, `swoosh`, `correct`, `wrong`, `celebrate`), `vibrate(type)` (Vibration API; no-ops on iOS Safari), `feedback(type)` (fires both), and `prefersReducedMotion()` (matchMedia helper). Sound is NOT gated on reduced-motion (audio is not motion in the WCAG sense); only visual animations are.
- `src/components/Confetti.jsx` — CSS-only confetti burst. Props: `active` (bool), `count` (default 30), `durationMs` (default 1800). When `active` flips true, generates randomised particles via `makeParticles(count)` inside `useEffect`, renders absolutely-positioned `<span>` particles using the `confetti-fall` keyframe (defined in `src/index.css`), auto-removes after `durationMs`. Renders nothing when `prefersReducedMotion()` is true. `data-testid="confetti"` for testability.
- `src/components/FeedbackSettingsSheet.jsx` — bottom-sheet with Sound + Haptics toggles. Reached from the gear icon in `StudentHome`'s status bar. Persists via `setPrefs`; enabling a toggle fires a sample (sound or vibrate) so the user confirms the change works on their device. Backdrop click closes; uses the `sheet-spring` keyframe for slide-up.
- `src/index.css` — Tailwind v4 import + four custom keyframes: `confetti-fall` (drop + spin + fade), `card-pulse-correct` (scale + green halo), `card-shake-wrong` (horizontal jitter), `sheet-spring` (overshoot slide-up). All four are nulled inside an `@media (prefers-reduced-motion: reduce)` block so motion-sensitive users see static states.
- `src/lib/milestones.js` — exports `MILESTONE_KIND` enum, `awardMilestone(kind, payload)` (wraps the `award_milestone` RPC; best-effort — returns `null` on error rather than throwing so a celebration never blocks the user flow), and `fetchRecentMilestones(studentId, limit)`.
- `src/components/MilestoneList.jsx` — renders the "Recent milestones" card on `StudentProgress`. Maps `kind` to icon + label (🔥 streak, 🎯 personal best accuracy, ⚡ personal best wpm, 📘 comprehension aced, ⭐ word mastered). Returns null when empty.
- `src/lib/stumbleWords.js` — exports `selectStumbleWords(sessions, { count=3, recencyWindow=5 })` → top stumble words ranked by recurrence (count desc, alphabetical tiebreak) within the recency window. Latest = LAST element of the array. Filters STOP_WORDS (articles, prepositions, short pronouns, common aux verbs) and 1-char words. A word survives the filter if it recurs (≥2 sessions) OR appears in the latest session. Used by SessionReport and StumbleDrill.
- `src/lib/stumbleSentence.js` — exports `findSentence(passageText, word)` → `{ sentence }` or null. Splits on `.!?` boundaries (em-dashes don't split), picks shortest sentence containing the word (case-insensitive, word-boundary), trims a window of ≤25 words around the target if the sentence is longer.
- `src/lib/drillScoring.js` — pure scoring function `scoreDrillAttempt({ transcript, stumbleWord })` → `{ score, wasCorrect }`. Presence check only: `{100, true}` when the stumble word appears in the transcript (case-insensitive, word-boundary, punctuation-tolerant), `{0, false}` otherwise. Mirrored verbatim inside `supabase/functions/analyze-drill/index.ts` — keep in sync.
- `src/components/StumbleDrillCard.jsx` — Practise card on SessionReport. Renders chips for top 3 stumble words, each linking to `/student/drill/:sessionId/:wordIndex`. Amber `×N` badge on words with `occurrences.length ≥ 2`. Returns null when no stumbles.
- `src/components/SpeakWordButton.jsx` — speaker-icon button that calls `window.speechSynthesis.speak(new SpeechSynthesisUtterance(word))` (rate 0.9, lang `en-US`). Cancels any in-flight utterance before speaking. Renders null when `speechSynthesis` is unavailable. Distinct from `AudioPlayButton` (which streams seeded MP3s from the `vocab-audio` bucket) — used for stumble words whose passage origin makes pre-seeding impractical.
- `src/pages/ResetPasswordPage.jsx` — public route at `/reset-password`. Three states: waiting (before `PASSWORD_RECOVERY` event), Set-password form (after event), expired/invalid link (when URL hash carries `error_code`). The expired state inlines an email form that re-calls `supabase.auth.resetPasswordForEmail`.

### Auth & routing
- `AuthContext` holds both the Supabase `user` and app `profile` (from `profiles` table). Always use `profile` for role/grade — never `user.user_metadata` in components.
- `ProtectedRoute` accepts optional `role` prop (`"teacher"` | `"student"`). Root `/` redirects based on `profile.role`.
- **Student self-registration:** `LoginPage` has Sign In / Sign Up tabs. Sign Up validates a class code via `validate_class_code` RPC (callable by anon), then calls `supabase.auth.signUp()` with `raw_user_meta_data: { full_name, role: 'student', grade }`. The `handle_new_user` trigger auto-creates the profile. Teachers cannot self-register.
- **Password reset (self-service):** `LoginPage` sign-in form has a "Forgot password?" trigger that switches to an inline form calling `supabase.auth.resetPasswordForEmail(email, { redirectTo: '/reset-password' })`. The recovery link lands on the public `/reset-password` route (`ResetPasswordPage`), which listens for the `PASSWORD_RECOVERY` auth event and shows a Set-password form. If the link is expired/invalid, the URL hash carries `error_code=otp_expired|...` and the page renders an inline "Send new link" form instead. The Supabase recovery email subject + HTML template was customised via Management API to match the slate/indigo design system; `uri_allow_list` includes the production `/reset-password` URL.
- The `handle_new_user` DB trigger auto-creates a `profiles` row on signup using `raw_user_meta_data`. The function pins `search_path = public` and qualifies inserts as `public.profiles` (see `OPERATIONS.md` "production quirks" for the schema-shift trap this avoids). When creating users manually via the Supabase dashboard, insert profiles via SQL instead (the dashboard doesn't set metadata at creation time).
- `onAuthStateChange` intentionally ignores `TOKEN_REFRESHED` and `INITIAL_SESSION` events — acting on them sets `loading=true` and causes a full page remount when the user switches back to the tab.

### Database schema (key points)
- `profiles` — `role` is `teacher` or `student`; `grade` is `text` (`'9'`–`'12'` or `'MBA'`, null for teachers); migration 009 changed this from `int`. `last_reminder_sent timestamptz` (added migration 013) tracks last activation/re-engagement email timestamp.
- `passages` — `word_count` computed client-side on insert/edit in `PassageManager`; `grade_level` is `text` (`'9'`–`'12'` or `'MBA'`, nullable for all-grades passages); migration 009 changed this from `int`; `difficulty` is `text` (`'easy'` | `'moderate'` | `'hard'`, default `'easy'`, CHECK constraint enforced) added in migration 011; constraint made idempotent in migration 012
- `sessions` — `word_results` JSONB `[{ word, spoken, status }]`, status ∈ `correct | substitution | omission`; also stores `score_accuracy`, `score_wpm`, `score_phrasing`, `score_fluency` (same as phrasing, kept for compat), `count_omissions`, `count_substitutions`, `feedback` (JSON string or plain text), `score_comprehension` (int nullable), `comprehension_answers` (jsonb nullable — `[{ question_id, selected_index, is_correct }]`), `whisper_duration_seconds` (numeric nullable), `llm_input_tokens` (int nullable), `llm_output_tokens` (int nullable), `spike_audio_path` (text nullable; added migration 014) — populated only when the Phase 1 audio-retention flag is on, and `vocab_retention_answers` (jsonb nullable; added migration 020 — array of `{ word_id, selected_index, was_correct }` per retention-quiz answer). Whisper/cost columns are null for sessions recorded before migration 010. **RLS (post-migration 024):** students SELECT own; teachers SELECT all; INSERT/UPDATE/DELETE revoked from clients — all writes go through `analyze-reading` (service role), `grade_comprehension` RPC, or `save_vocab_retention_answers` RPC.
- `questions` — `passage_id` FK, `question_text`, `options` (jsonb array of 4 strings), `correct_index` (0–3), `display_order`; max 5 per passage enforced by DB trigger `enforce_question_limit`. **RLS (post-migration 024):** teachers SELECT all (and manage via the `teacher manage questions` FOR ALL policy); students do NOT have direct SELECT — they reach question rows only via the `get_questions_for_session` RPC, which gates `correct_index` visibility on whether the session is graded.
- `vocabulary_words` (migration 015) — `word text unique`, `part_of_speech text`, `definition text`, `example_sentence text`, `synonyms jsonb` (array of strings), `antonyms jsonb` (array of strings), `difficulty text` CHECK in `('medium','hard','very_hard')`, `source text` default `'nda-2026'`, and `audio_path text` nullable (added migration 019) pointing into the `vocab-audio` public Storage bucket at `pronunciation/{word_id}.mp3`. 865 NDA-prep words seeded via in-conversation LLM generation (`scripts/vocab/entries.json` + `upload.py`); pronunciations seeded one-shot via `scripts/vocab/seed_audio.py` calling the `generate-vocab-audio` edge function (~$0.13 OpenAI TTS, voice `nova`). RLS: `SELECT` open to all `authenticated`; writes via service role only.
- `student_word_progress` (migration 015) — composite PK `(student_id, word_id)`. `srs_box smallint` CHECK 1–5 default 1, `next_review_at timestamptz` default now, `correct_count int` default 0, `total_encounters int` default 0, `mastered_at timestamptz` nullable, `last_encounter_source text` CHECK in `('practice','reading')` nullable (added migration 017), `created_at` + `updated_at`. Index on `(student_id, next_review_at) WHERE mastered_at IS NULL` for fast deck queries. RLS: `SELECT` own rows + teachers (via `is_teacher()`); writes only via `grade_vocab_attempt` (practice) or `record_vocab_reading_encounters` (reading) RPCs.
- `milestones` (migration 021) — durable record of celebration events. Columns: `id uuid pk`, `student_id uuid` (FK profiles, cascade), `kind text` (CHECK in `streak_5|streak_10|streak_20|personal_best_accuracy|personal_best_wpm|comprehension_aced|word_mastered`), `achieved_at timestamptz`, `payload jsonb`, and `dedupe_key text` (STORED generated as `kind || ':' || payload->>'dedupe'`). Unique index on `(student_id, dedupe_key)` enforces idempotency: once-ever kinds (streak crossings) use `dedupe = ''`; repeatable kinds key on `session_id` or `word_id`. RLS: SELECT own + teachers via `is_teacher()`; INSERT/UPDATE/DELETE revoked — all writes go through the `award_milestone` RPC (security-definer; server-validates each claim against source data). Backfilled at migration time from existing sessions + progress rows; future awards happen client-side from the celebration triggers in StudentHome / SessionReport / VocabPractice. Read into `StudentProgress` via `fetchRecentMilestones(studentId, limit)` and rendered by `<MilestoneList>`.
- `app_settings` — single-row table (`id boolean PK default true`), holds `ai_feedback_enabled boolean`, `class_code text` (random 6-char code set on migration; teacher shares with students for self-registration), `daily_session_limit int` (default 5; teacher adjusts via dashboard stepper, clamped 1–20), `cron_secret text` (auto-generated in migration 013; shared between pg_cron job and `send-reminders` edge function), and three Phase 1 spike fields added in migration 014: `spike_audio_retention boolean` (default false), `spike_audio_retention_count int` (default 0), `spike_audio_retention_limit int` (default 10). When `spike_audio_retention` is on, `analyze-reading` retains the audio for up to `limit` sessions instead of deleting it. The flag auto-disables itself when the count reaches the limit.
- RLS on all tables. `is_teacher()` security definer function (captured in migration 022; pinned `search_path = public`) used by RLS policies on `student_word_progress`, `milestones`, and the `get_questions_for_session` / `reset_comprehension` RPCs to avoid the profiles-table recursion trap.
- **Scheduled jobs:** pg_cron + pg_net schedule `send-daily-reminders` runs at 04:30 UTC (10:00 AM IST) and POSTs to the `send-reminders` edge function with `x-cron-secret` header. Defined in migration 013.

### RPCs

All SECURITY DEFINER functions pin `set search_path = public` (migrations 016+, plus migration 023 retrofitted the older ones).

- `is_teacher()` — boolean; returns `auth.uid() ∈ profiles.role = 'teacher'`. Captured as migration 022; used by RLS policies and gating RPCs.
- `grade_comprehension(p_session_id, p_answers)` — server-side comprehension grading. Validates session ownership, prevents re-grading, **rejects duplicate `question_id`s, mismatched answer counts, and unknown question_ids** (hardening in migration 023). Saves score atomically.
- `reset_comprehension(p_session_id)` — teacher-only (via `is_teacher()`); clears `score_comprehension` and `comprehension_answers` for a session.
- `validate_class_code(p_code)` — callable by anon; returns boolean; used during student signup.
- `try_claim_spike_slot()` — service-role only; atomically increments `app_settings.spike_audio_retention_count` and returns the new count, or null if the flag is off or the limit is reached. Auto-flips `spike_audio_retention` to false when the limit is hit. Called by `analyze-reading` to decide whether to retain or delete audio for the Phase 1 spike.
- `grade_vocab_attempt(p_word_id uuid, p_was_correct boolean)` — security-definer, granted to `authenticated`. Atomically upserts the caller's `student_word_progress` row applying the Leitner SRS rule (intervals `[1,3,7,14,30]` days, max box 5). Correct increments `correct_count`; wrong drops to box 1 (count preserved). `mastered_at` is set when reaching box 5 with `correct_count >= 3`. **Maintenance behaviour (migration 018):** a correct answer on a previously-mastered word refreshes `mastered_at = now()` (push next check 30 days out); a wrong answer on a previously-mastered word clears `mastered_at = null` and drops to box 1 — the climb starts over. Stamps `last_encounter_source = 'practice'`.
- `record_vocab_reading_encounters(p_student_id uuid, p_words text[])` — service-role only. Bulk-bumps `total_encounters` for any vocab words whose `lower(word)` appears in `p_words` (passed as normalised lowercase tokens). Stamps `last_encounter_source = 'reading'`. Does NOT change `srs_box`, `correct_count`, `next_review_at`, or `mastered_at` — reading is exposure-only. Idempotent across replays. Called best-effort by `analyze-reading` after the session row is saved.
- `save_vocab_retention_answers(p_session_id uuid, p_answers jsonb)` — migration 024. Replaces the direct `sessions.update(vocab_retention_answers)` that the retention quiz used to do against a now-dropped RLS policy. Owner check + once-only enforcement.
- `get_questions_for_session(p_session_id uuid)` — migration 024. Returns `{id, question_text, options, display_order, correct_index}` for the session's passage. `correct_index` is **null** when the session has not yet been graded; populated after grading (or always for teachers). Replaces the direct `questions.select()` reads from `SessionReport` and `ComprehensionQuiz` since the broad `read questions using (true)` policy was dropped.
- `award_milestone(p_kind text, p_payload jsonb)` — migration 021 (extended in 026). Server-validates each kind against source data (streak via `compute_student_streak`; personal-best / comp-aced against `sessions`; word_mastered against `student_word_progress`; `drill_session_aced` requires ≥3 distinct `was_correct=true` rows in `drill_attempts` for the session). Idempotent via the generated `dedupe_key` column on `milestones`.
- `compute_student_streak(p_student_id uuid)` — migration 021. SQL port of `src/lib/streak.js`. Used inside `award_milestone` for the streak-crossing kinds.

### Edge functions
- `analyze-reading` (v15) — main reading evaluation pipeline (Whisper + GPT-4o-mini). **Identity-hardened (migration of trust to JWT, 2026-05-12):** reads `Authorization: Bearer <jwt>` header, validates via `supabase.auth.getUser(token)`, and derives `studentId` from the validated user. `passageText` and `grade` are fetched server-side (`passages.content`, `profiles.grade`) by `passageId`. Body only carries `{ audioPath, passageId, aiFeedbackEnabled }`. Explicit grade-level access check (service role bypasses RLS, so this re-checks). Before audio deletion, calls `try_claim_spike_slot()`; when a slot is claimed, audio is kept and `spike_audio_path` is written. After session insert, best-effort calls `record_vocab_reading_encounters` with the passage's normalised words.
- `create-student` (v6) — teacher creates one or many students; accepts `{ students: [{ full_name, email, password, grade }] }`; verifies caller is teacher via their JWT; uses `auth.admin.createUser` with `email_confirm: true`; `handle_new_user` trigger auto-creates profiles. **Welcome email (post-2026-05-12):** sends a fresh `admin.generateLink({ type: 'recovery' })` link via Resend — not the teacher-set plaintext password. Teacher-set password still works as a fallback if the email is lost. Wrapped in `Promise.allSettled` so email failures don't fail user creation.
- `reset-student-password` — teacher resets a student's password; accepts `{ student_id, new_password }`; verifies caller is teacher; guards against resetting non-student accounts; uses `auth.admin.updateUserById`
- `send-reminders` — daily activation/re-engagement engine; called by pg_cron at 04:30 UTC. Validates `x-cron-secret` header against `app_settings.cron_secret`. Builds a list of students who either never logged in (account ≥ 2 days old) or have been inactive 3+ days, with a 3-day cooldown between reminders to the same student. Activation emails contain a fresh `admin.generateLink({ type: 'recovery' })` link so the student can set their own password (not a stored plaintext). Re-engagement emails link directly to the app. Pure list-building logic lives in `src/lib/reminders.js` (`buildReminderList`) and is unit-tested.
- `analyze-drill` (v1) — deliberate-practice scoring (lean variant of `analyze-reading`). Body: `{ audioPath, sessionId, stumbleWord, sentence }`. Validates JWT via `supabase.auth.getUser(token)` to derive `studentId`, verifies session ownership, enforces a per-(student, session, stumble_word) 3-attempt cap, runs Whisper transcription (plain `json` response), checks whether `stumbleWord` is in the transcript (case-insensitive, word-boundary, punctuation-tolerant — mirror of `src/lib/drillScoring.js`), inserts into `drill_attempts`, deletes the audio, returns `{ attemptId, attemptIndex, score, wasCorrect, transcript }`. Bypasses daily-session-limit and per-passage attempt cap (drills are targeted practice).
- **Retired as 410-Gone stubs** (in repo + redeployed):
  - 2026-05-12 (Phase D of security-review fix plan): `vocab-seed-batch` and `generate-vocab-audio` — both accepted unauthenticated POST and called OpenAI, a cost-attack vector. The work they served is complete (`entries.json` is the canonical word list; 865/865 `audio_path` rows populated).
  - 2026-05-12 (post-drill cleanup): `spike-audio-url`, `spike-cleanup`, `vocab-insert` — the Phase 1 spike is parked, retained audio cleaned up, and the one-shot vocab seed is complete. All three deployed with `verify_jwt: false` and authorised via service role + obscure session-ids; leaving them open after their use case ended served no purpose.
  - Restore any of these from git history (parent commit of the stub) if the underlying use case ever returns.

### Phase 1 forced-alignment spike (in progress — not yet a production feature)

Spike infrastructure that lives in the repo. *Why* the spike exists and *what's chosen* belong in the Decisions log below; *current state* (round count, threshold verdict, next steps) lives in `memory/project_fa_spike.md`.

- `services/forced-alignment/ie-v1.json` — Indian-English phoneme tolerance rules (th-stopping, /v/-/w/ merger, retroflex /t/-/d/, epenthetic vowels). Drafted; not yet wired into a service.
- `scripts/spike/spike_fa.py` — standalone CTC forced-alignment scorer (wav2vec2-base-960h + torchaudio `forced_align` + stdlib `wave`). Run via the venv at `scripts/spike/.venv/`.
- `scripts/spike/spike_compare.py` — orchestrator. Reads a manifest, downloads retained audio via `spike-audio-url`, runs FA, writes `spike-audio/results.csv` + per-session detail JSON.
- `scripts/spike/inspect_detail.py` — ad-hoc analyser of detail JSON (score distributions, low-scoring words).
- `scripts/spike/README.md` — setup + run instructions.
- `spike-audio/` — gitignored output dir; cleaned up via the `spike-cleanup` edge function after a round.

### Decisions log

Key product and architecture decisions, grouped by area, so future sessions don't re-debate them.

#### Scoring & content

| Decision | Chosen | Why |
|---|---|---|
| AI feedback flag | Passed from client, not re-fetched server-side | Not security-critical — a student enabling their own AI feedback is harmless |
| Comprehension grading | Server-side RPC; `correct_index` never sent to client | Prevents client-side cheating; once-only enforced in the RPC |
| MCQ option order randomised on save | `QuestionPanel.handleSubmit` calls `shuffleOptions` before insert/update; bulk re-shuffle migration ran on all 266 existing questions (backup in `questions_backup_preshuffle` until dropped) | LLM-generated MCQs (especially MBA-level) skewed heavily — 21 of 30 5-question passages had every answer as "B". Students could pick B and pass. Word-level shuffling preserves the correct option's text and prevents future drift. |
| OpenAI cost tracking | Store raw metrics (`whisper_duration_seconds`, `llm_input_tokens`, `llm_output_tokens`); compute cost in JS at render time | Raw metrics survive pricing changes; `costUtils.js` is the single place to update rates |

#### Phase 1 scoring spike (Whisper → forced alignment)

| Decision | Chosen | Why |
|---|---|---|
| Phase 1 scoring engine | Migrate from Whisper to CTC forced alignment on Fly.io (Mumbai region), word-level scoring only, accent-tolerance rules applied post-alignment | Whisper's LM smooths real reading errors (regressive bias — biggest lift goes to weakest readers), corrupting the mastery gate. FA scoring is structurally honest. Self-hosted is cost-flat vs Whisper's per-minute pricing. |
| Accent-bias defense | Layered: (1) word-level scoring (not phoneme) for grading, (2) IE-aware acoustic model when available, (3) JSON ruleset of tolerated phoneme substitutions (`services/forced-alignment/ie-v1.json`). Default stance: "when ambiguous, favour 'correct'" | Indian English speakers systematically substitute /θ/→/t/, /v/↔/w/, etc. — these are legitimate dialect features, not errors. Penalising them is pedagogically wrong. Word-level scoring is robust across accents; phoneme rules cover the remaining cases. |
| Phase 1 spike methodology | Toggle `spike_audio_retention`, capture N production sessions, re-score with FA, compare CSV to Whisper — instead of synthetic test audio | Real production audio is the only honest validator. Avoids synthetic-audio bias and forces us to handle the real WebM/Opus pipeline. Capture is gated by a per-session atomic counter so we never accidentally retain more than configured. |
| FA calibration (post round 2A, 2026-05-12) | `spike_fa.py` uses `CONTENT_THRESHOLD = 0.20` + `FUNCTION_THRESHOLD = 0.10` with a function-word set; empty-normalised tokens (em-dashes) filtered from the target sequence before alignment. Engine version bumped to `fa-spike-v2`. | Round 2A v1 (raw `0.30` threshold) showed +5.9 mean gap on 6 real-student sessions, driven mostly by tiny "a"/"we" scores that should never have counted as substitutions. Round 2A v2 closes 4/6 sessions to ±3 and leaves 2 Shankar (slow IE-accent) at −8 — still unresolved, but a listen-grade question, not a research one. Spike PARKED pending product trigger (deliberate-practice drill / mastery gate). |

#### Vocabulary

| Decision | Chosen | Why |
|---|---|---|
| Vocabulary practice scope (v1) | Standalone deck flow at `/student/vocab*`, grade-gated to 11+, MCQ-only (synonym + antonym alternation), Leitner 5-box SRS, no audio | NDA-prep audience needs synonym/antonym recognition more than pronunciation. Pure-MCQ ships in a week. Read-aloud + TTS audio waits for v2 after Phase 1 FA migration so vocab scoring auto-improves rather than carrying Whisper inflation. |
| Vocabulary seeding | Generated in-conversation via Claude (this assistant), saved as `scripts/vocab/entries.json` + `batch_*.json`, uploaded via the `vocab-insert` edge function | User chose Claude over OpenAI for the seed pass: zero extra vendor cost (already paying for the conversation), better contextual control over school tone. One-shot operation, repeatability provided by `entries.json` + `upload.py` rather than the LLM call itself. |
| Vocabulary mastery rule (v1) | `srs_box = 5 AND correct_count >= 3` sets `mastered_at` and it sticks — failed attempts on mastered words bump `total_encounters` but never un-master. | Avoids the inconsistent state "previously mastered but currently in box 1". Maintenance check resurfacing is a v2 concern. Pragmatic v1 simplification. |
| Maintenance check (v2) — supersedes stickiness | Migration 018 changed `grade_vocab_attempt`: correct on a mastered word refreshes `mastered_at`; wrong on a mastered word clears it. `assembleDeck` re-includes mastered words past 30 days (`MAINTENANCE_INTERVAL_DAYS`). | A student who forgets a word 6 months later needs a signal. Leitner-style maintenance — re-surface, test, refresh-or-demote — is standard practice. Pure stickiness was a known v1 simplification. |
| TTS voice + caching strategy | OpenAI `tts-1` with voice `nova`, pre-generated MP3s cached in public Supabase Storage bucket `vocab-audio` at `pronunciation/{word_id}.mp3`. One-shot seed (~$0.13). | `nova` is clearer for non-native listeners (slower, more articulated). Pre-generation eliminates per-play latency and cost. Public bucket allows CDN-style delivery with no auth dance — pronunciation is non-sensitive data. |
| Retention quiz counts as practice | Quiz answers in SessionReport call `grade_vocab_attempt` (same RPC as deck practice). Persisted to `sessions.vocab_retention_answers` for once-only enforcement. | Reading is exposure (no SRS change). A quiz is active recall, identical cognitive work to deck practice — must affect SRS state too. Treating it differently would be philosophically inconsistent. |
| Retention quiz cap by passage length | 1 question if <100 words; 2 if 100–199; 3 if 200+. Hidden if no vocab matches or all matches mastered. Skippable via "Skip" button. | Scales with attention budget. School context with minors — don't pile on. Skip respects student autonomy; the quiz comes back next session anyway via the deck. |
| Reading-as-vocab-exposure (v2.1) | Reading a passage bumps `total_encounters` for any vocab word in the passage but does NOT change SRS state (`srs_box`, `correct_count`, `next_review_at`, `mastered_at` unchanged). Both hits and misses count as exposure. Source tracked via `last_encounter_source = 'reading'`. | Reading is passive recognition, not active recall — SRS is meant for active practice. Counting reading exposures as mastery progress would let students master words without actively recalling them, defeating the gate. Tracking source still gives the UI a way to surface "X words encountered through your reading." |
| First-mastery detection (client-side) | `VocabPractice` reads the pre-answer `student_word_progress` row from a `progressMap` built at load. On a correct answer, computes whether the answer would tip the word into mastery (`srs_box ≥ MAX_BOX - 1 AND correct_count + 1 ≥ MASTERY_CORRECT_THRESHOLD AND !mastered_at`) and fires `Confetti` + `feedback('celebrate')` in place of the normal `feedback('correct')`. | Avoided a migration to enhance `grade_vocab_attempt` to return a `newly_mastered` flag. Client already has the pre-state from the deck-assembly fetch; deriving the prediction from the SRS rule is cheap and migration-free. If the rule ever diverges from the RPC, the client check will need to track. |

#### Deliberate-practice drill

| Decision | Chosen | Why |
|---|---|---|
| Drill scope (v1c) | Sentence-in-context: student records the *sentence* containing the stumble word (not the word alone, not just exposure). Reuses session audio bucket + Whisper pipeline via a lean `analyze-drill` edge function. | The CLAUDE.md "Deliberate Practice" principle is "here it is in a sentence, read it aloud" — single-word recording is acoustically thin and ships exposure-only would miss the principle. Sentence-level reuses ~all existing infra and creates the natural FA-migration trigger when Whisper noise on IE-accent shows up here. |
| Stumble source | Top 3 from `selectStumbleWords` over the last 5 sessions; keeps recurring words (≥2 sessions) above latest-only stumbles, with alphabetical tiebreak. Function-words and 1-char words filtered out. | Matches the principle's framing ("you skipped 'therefore' in 4 sessions") — recurrence is the signal that the word genuinely needs work. Latest-only fills the slots when recurrence isn't there yet, so the card never feels empty. |
| Attempt cap | 3 attempts per (student, session, stumble_word), server-enforced in `analyze-drill`; no daily limit, no per-passage attempt cap. | Mirrors the per-passage 3-attempt rule from `analyze-reading`. Drills are targeted practice, not full sessions — they shouldn't consume the daily session budget that exists to pace OpenAI cost. |
| Scoring algorithm | Pure presence check: is the stumble word in the Whisper transcript (case-insensitive, word-boundary, punctuation-tolerant)? Returns `{score: 100, wasCorrect: true}` or `{0, false}`. | Single-word focus means we don't need positional alignment for v1 — if they said it, they said it. Whisper-noise on this check is exactly the signal that triggers the FA migration. |
| TTS for stumble words | Browser `speechSynthesis` (Web Speech API) via `<SpeakWordButton>`. Lang `en-US`, rate 0.9, cancels any in-flight utterance. Falls back to no button when the API is unavailable. | Stumble words are everyday English passage words; `tts-1`/`nova` was overkill (vocab pre-seed used it because non-native learners need slow articulation for unfamiliar NDA-prep terms — stumble words don't have that need). Browser speech is free, zero infra, no edge-function attack surface, no caching layer. The retired `generate-vocab-audio` already showed why we don't want another unauthenticated OpenAI endpoint open. |
| Drill ace celebration | Fires from `SessionReport` (not the drill page) when `drill_attempts` shows ≥3 distinct stumble words with `was_correct=true` for the session. Folded into the existing `celebratedRef` gate so it stacks with personal-best / comp-aced celebrations. | Matches the comprehension-aced trigger pattern (fires when student returns to report). One celebrate-sound covers all milestones earned on the visit; multiple medals are awarded silently. Avoids needing the drill page to count cross-session state itself. |

#### Engagement & UI

| Decision | Chosen | Why |
|---|---|---|
| Leaderboards | Explicitly excluded | Demotivate the bottom half of the class in a known-peer setting |
| Confirmation modal before comprehension submit | Required | Quiz is irreversible; modal prevents accidental submission |
| UI colour system | `slate-*` for neutrals, `indigo-*` for primary actions; red/green/amber retained as semantic colours | Consistent single palette across all components; gray/blue were mixed inconsistently before |
| Colour-only UI changes | No new tests required | Presentational changes carry no behaviour to test; existing tests already verify component renders correctly |
| StudentHome layout | Segmented tabs (To Read / Practise / History) + hero card for next-up passage | Hero gives the student a clear single call to action; tabs reduce visual noise vs three stacked lists |
| TeacherDashboard header | Split identity row + controls strip | Cramped single-row header wrapped on laptop screens; separation makes each group of controls scannable |
| TeacherDashboard stat chips | 3 summary chips (Students / Sessions / Avg Accuracy) computed from already-fetched student list | Teacher needs a class pulse at a glance before drilling into rows; no extra DB query needed |
| Passage ordering on StudentHome | Sort by difficulty (easy → moderate → hard), tiebreak by `created_at` ASC; client-side via `sortByDifficulty` | PostgREST sorts text columns alphabetically (`easy, hard, moderate` — wrong order), so a pure helper is the right place. Teacher views still order by `created_at DESC` |
| Assigned passages pagination | 5 per page, client-side slice of already-fetched array | No extra DB queries; all passages already fetched on load; 5 fits comfortably on a phone screen |
| Recent sessions storage | Store all sessions in state (was capped at 10) | Needed for correct pagination; sessions array is small (students rarely exceed 100 total) |
| Weekly summary trigger | localStorage (key per student ID) not server-side column | No migration needed; acceptable risk of reset on browser clear; simpler than a DB column for low-stakes feature |
| Engagement polish layer | Audio (Web Audio synth — no assets), haptics (Vibration API), confetti (CSS-only), card-pulse/shake on selected MCQ options, springy sheets. Defaults: sound ON, haptics ON, per-device localStorage prefs. Settings reachable from a gear icon on `StudentHome`. | Retention is a learning lever — students who come back, practice; students who practice, improve. Polish that makes the app feel responsive raises return rate. Synthesised sound + CSS confetti add zero dependencies. Per-device defaults (not server-side) keep the feature classroom-friendly: a student can mute on a shared phone without altering their account. |
| Engagement-polish guardrails | Confetti and card animations are suppressed by `prefers-reduced-motion`; sound and haptics still fire (audio/vibration are not "motion" in the WCAG sense). Celebration cues only fire on *genuine* learning events: personal best, comprehension ≥80%, first-mastery of a word, streak crossing 5/10/20. No variable-reward or loss-aversion patterns. | Honours accessibility prefs without silencing legitimate confirmation feedback. Keeps the school-context guardrail in CLAUDE.md (no slot-machine patterns) while still delivering the felt experience. |

#### Auth & user management

| Decision | Chosen | Why |
|---|---|---|
| MBA as a grade level | `grade`/`grade_level` stored as `text` (not int) | Allows non-numeric grade labels; migration 009 cast existing int values to text |
| Creating student accounts manually | Insert directly into `auth.users` via SQL (not via dashboard) | Supabase dashboard doesn't set `raw_user_meta_data` at creation time; direct SQL insert lets the `handle_new_user` trigger fire correctly with grade and role |
| Teacher adds students from dashboard | `create-student` edge function (service role); teacher-set password; `email_confirm: true` | Service role key cannot be in the browser; teacher-set password is simpler than invite email for a school context where teachers distribute credentials |
| CSV bulk import | Client-side parse (native FileReader + split); validation preview before import; same edge function as single-add (array payload) | No library needed for simple CSV; previewing errors before import prevents surprises |
| Teacher resets student password | `reset-student-password` edge function; guards against resetting non-student accounts | Requires service role; guard prevents a teacher accidentally resetting another teacher's password |
| Self-service password reset | `supabase.auth.resetPasswordForEmail` called from frontend (no edge function); landing page is `/reset-password` | Built-in Supabase flow is rate-limited (2/hour) and free; an edge function would just be a wrapper |
| Activation flow uses recovery links | `admin.generateLink({ type: 'recovery' })` is the canonical activation handshake across `send-reminders` (cron, 2026-05-08) and `create-student` (per-student welcome email, 2026-05-12). Plaintext passwords never appear in email. | Single source of truth for activation. Recovery links also handle re-engagement of existing users. Plaintext-in-email is an information-disclosure risk (forwarded emails, mailbox leaks). |
| Recovery email template | Customised once via Management API to serve both first-time activation and password reset | Supabase only has one `recovery` template — copy is written generically ("set your password") to fit both contexts |

#### Infrastructure & deployment

| Decision | Chosen | Why |
|---|---|---|
| Session writes route through edge functions / SECURITY DEFINER RPCs only | Migration 024 dropped the `insert session` and `student submit comprehension` RLS policies on `sessions`. All writes happen via `analyze-reading` (service role), `grade_comprehension` (security definer), `save_vocab_retention_answers` (security definer). Direct PostgREST writes are blocked. | Students were inserting fake `score_accuracy=100` rows directly via DevTools — bypassing the entire scoring pipeline and corrupting teacher dashboards. RLS-only checks couldn't bind score values to actual audio analysis; the only place that can is server-side code. |
| `correct_index` never reaches the client until comprehension is graded | Dropped the `read questions using (true)` policy in migration 024. Students reach question rows via the `get_questions_for_session` RPC, which gates `correct_index` visibility on `sessions.comprehension_answers IS NOT NULL`. Teachers still read directly via the `teacher manage questions` policy. | Frontend code was careful not to fetch `correct_index`, but the DB shipped it to anyone running `from('questions').select('*')` in DevTools. The mastery gate is meaningless if the answer key is one query away. |
| `analyze-reading` derives identity from JWT, not request body | Validates the `Authorization` header via `supabase.auth.getUser(token)` and reads `studentId` from `user.id`. `passageText` + `grade` fetched server-side. | Previously a caller could spoof `studentId` to attribute sessions to another student, or send fake `passageText` to inflate accuracy on a real `passageId`. With `verify_jwt: false` (forced by Supabase's new key format), explicit JWT validation in the function is the only way to anchor identity. |
| One-shot cost endpoints retired as 410 stubs | `vocab-seed-batch` and `generate-vocab-audio` accepted unauthenticated POST and called OpenAI. Replaced with `410 Gone` stubs; their one-shot work is canonicalised in `scripts/vocab/entries.json` + the populated `vocabulary_words.audio_path` rows. Restore from git history if vocab is ever expanded. | Public unauth'd OpenAI endpoints are a cost-attack vector. Restoring + re-running is rare; living with the endpoint open is not justified. |
| Welcome email contains recovery link, not plaintext password | `create-student` calls `admin.generateLink({ type: 'recovery' })` per successful create and embeds the link in the welcome email. Teacher-set password remains as a fallback if the email is lost. | Plaintext passwords in email are an information-disclosure risk (forwarded emails, mailbox leaks). The pattern mirrors `send-reminders`' activation flow — single source of truth for the activation handshake. |
| `handle_new_user_search_path` captured as migration 023 | Was applied via MCP in 2026-05-08 to fix a pg_cron/pg_net schema-shift trap; never written as a numbered migration until the Phase-A security pass. Migration 023 re-defines `handle_new_user` (and the other older SECURITY DEFINER functions) with `set search_path = public`. | Drift between prod and repo means fresh checkouts can't reproduce prod schema. The cost of capturing in a numbered file is one migration; the cost of not capturing is silent divergence. |
| Daily session limit scope | Class-wide (one value in `app_settings`) | Per-student overrides add complexity with little learning benefit; teacher can adjust the global limit |
| Daily limit enforcement | Server-side in edge function (fetched from DB, not trusted from client) | Client-side only is trivially bypassed; server fetch adds one extra DB read which is acceptable |
| Day boundary timezone | IST throughout (client and edge function) | All users are in the same school; IST midnight is the natural reset point |
| Reminder scheduling | pg_cron + pg_net inside Supabase, not external cron service | Stays on the existing stack; cron secret in `app_settings` shared with edge function for auth |
| Email provider | Resend with custom domain (`tutor@lwspune.in`) | Owned-domain sender for trust; Supabase invite emails were skipped because they don't fit a teacher-distributed-credentials flow |

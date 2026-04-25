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

### Weekly summary — not yet built
Show a brief summary on the first login of a new week: passages read, accuracy trend, streak status. One screen, no navigation required. Drives return visits by making the week's work visible.

### What to avoid
- Leaderboards: demotivate the bottom half of the class in a known-peer setting.
- Hearts / lives: create anxiety, not learning.
- Variable rewards / loot boxes: exploitative, no learning benefit.
- Streak shields or freezes: adds complexity without learning value.

## Development Preferences

### UI
- All student-facing screens must be mobile-first. Use Tailwind responsive prefixes (`sm:`, `md:`) and test layouts at 375px width. Touch targets must be at least 44px. Avoid horizontal scroll.

### Backend Integrity
- Enforce data rules at the DB level (FK, CHECK constraints, NOT NULL, triggers), not just in app code. Validate and reject bad input at the edge function boundary before any external API call (fail fast). Use transactions for multi-step writes. Return a consistent shape: `{ data }` on success, `{ error }` on failure. Keep all scoring and business logic server-side — never in client JS.

### Accessibility
- Use Tailwind `focus-visible:` utilities for focus styles on all interactive elements.

### Definition of Done
- Golden path must be verified in the browser at 375px width specifically.

### Security
- Validate and sanitize all user input at system boundaries. Avoid XSS — never use `dangerouslySetInnerHTML` with user-supplied content. Keep RLS enabled on all Supabase tables.

### Dependency Management
- Existing stack is React, Tailwind, and Supabase — exhaust these before adding a new package.

### Test Scope
- For edge functions, prefer integration tests over mocks.

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

Edge function (Deno, deploy always with `--no-verify-jwt`). On Windows CMD use two lines:
```cmd
set SUPABASE_ACCESS_TOKEN=<token>
npx supabase functions deploy analyze-reading --no-verify-jwt
```

## Architecture

English reading-aloud evaluation app for high school students (grades 9–12) with a teacher dashboard. Designed to be teacher-independent — AI provides per-session feedback so the teacher acts as facilitator.

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
   - If AI feedback on AND transcript coverage ≥ 20%: calls GPT-4o-mini → structured JSON feedback
   - Falls back to rule-based feedback if AI is off or GPT fails
   - Saves `sessions` row → deletes audio → returns `{ sessionId }`
5. Student redirected to `/student/report/:sessionId` — word-by-word colour-coded report with structured feedback

### Metrics
- **Accuracy** — % of passage words read correctly (via sequence alignment)
- **Pace (WPM)** — words per minute vs grade-level target (grade 9→140, 10→150, 11→160, 12→170)
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
- `StudentHome` (`/student`) — "Assigned Passages" (new) + "Keep Practising" (amber, <80% mastery, attempts left) + streak card + daily counter chip (X of N today, red at limit) + last 10 sessions + "My Progress" banner
- `ReadingSession` (`/student/session/:passageId`) — audio recording; Start Recording disabled when per-passage attempt limit (3) OR daily session limit is reached
- `SessionReport` (`/student/report/:sessionId`) — word-by-word results + feedback + personal best banner (accuracy + WPM vs prior attempts on same passage) + comprehension CTA
- `ComprehensionQuiz` (`/student/comprehension/:sessionId`) — once-only quiz with confirmation modal
- `StudentProgress` (`/student/progress`) — sparkline trend charts for Accuracy, Pace, Phrasing, Comprehension

### Teacher dashboard
- **AI Feedback toggle** — global on/off button in the header, persisted in `app_settings` table
- **Daily limit stepper** — −/N/+ control in header (clamped 1–20); updates `app_settings.daily_session_limit` immediately
- **Class code display** — shown in header with one-tap copy; students use this code to self-register
- **Passage Completion** (`/teacher/completion`) — per-passage cards showing count completed + chips for students who haven't read yet; chips link to student detail
- **Student detail** (`/teacher/student/:id`) — summary stats, sparkline performance trends (Accuracy, Pace, Phrasing, Comprehension), recurring difficult words, session progress table with ↑/↓ trend arrows and comprehension Reset button
- **Question Manager** — inline panel per passage in `PassageManager`; add/delete MCQs (3–5 per passage, DB-enforced by trigger)

### Shared components / lib
- `src/components/PerformanceCharts.jsx` — exports `MetricCard` (sparkline card with Latest/Best/Change stats); used in both `StudentProgress` and `StudentDetail`
- `src/lib/wpmTargets.js` — exports `WPM_TARGETS` constant `{ 9: 140, 10: 150, 11: 160, 12: 170 }`
- `src/lib/studentStats.js` — exports `computeAvgComprehension(sessions)`
- `src/lib/passageClassifier.js` — exports `classifyPassages(passages, sessions)` → `{ todo, retry }`; mastery threshold `MASTERY_THRESHOLD = 80`
- `src/lib/streak.js` — exports `computeStreak(sessions, today)` → number; school days (Mon–Fri) only, IST timezone

### Auth & routing
- `AuthContext` holds both the Supabase `user` and app `profile` (from `profiles` table). Always use `profile` for role/grade — never `user.user_metadata` in components.
- `ProtectedRoute` accepts optional `role` prop (`"teacher"` | `"student"`). Root `/` redirects based on `profile.role`.
- **Student self-registration:** `LoginPage` has Sign In / Sign Up tabs. Sign Up validates a class code via `validate_class_code` RPC (callable by anon), then calls `supabase.auth.signUp()` with `raw_user_meta_data: { full_name, role: 'student', grade }`. The `handle_new_user` trigger auto-creates the profile. Teachers cannot self-register.
- The `handle_new_user` DB trigger auto-creates a `profiles` row on signup using `raw_user_meta_data`. When creating users manually via the Supabase dashboard, insert profiles via SQL instead (the dashboard doesn't set metadata at creation time).
- `onAuthStateChange` intentionally ignores `TOKEN_REFRESHED` and `INITIAL_SESSION` events — acting on them sets `loading=true` and causes a full page remount when the user switches back to the tab.

### Database schema (key points)
- `profiles` — `role` is `teacher` or `student`; `grade` 9–12 (null for teachers)
- `passages` — `word_count` computed client-side on insert in `PassageManager`
- `sessions` — `word_results` JSONB `[{ word, spoken, status }]`, status ∈ `correct | substitution | omission`; also stores `score_accuracy`, `score_wpm`, `score_phrasing`, `score_fluency` (same as phrasing, kept for compat), `count_omissions`, `count_substitutions`, `feedback` (JSON string or plain text), `score_comprehension` (int nullable), `comprehension_answers` (jsonb nullable — `[{ question_id, selected_index, is_correct }]`)
- `questions` — `passage_id` FK, `question_text`, `options` (jsonb array of 4 strings), `correct_index` (0–3), `display_order`; max 5 per passage enforced by DB trigger `enforce_question_limit`
- `app_settings` — single-row table (`id boolean PK default true`), holds `ai_feedback_enabled boolean`, `class_code text` (random 6-char code set on migration; teacher shares with students for self-registration), `daily_session_limit int` (default 5; teacher adjusts via dashboard stepper, clamped 1–20)
- RLS on all tables. `is_teacher()` security definer function used in profiles policy to avoid infinite recursion.

### RPCs
- `grade_comprehension(p_session_id, p_answers)` — server-side comprehension grading; validates session ownership, prevents re-grading, saves score atomically
- `reset_comprehension(p_session_id)` — teacher-only; clears `score_comprehension` and `comprehension_answers` for a session
- `validate_class_code(p_code)` — callable by anon; returns boolean; used during student signup

### Edge function error handling
`src/lib/edgeFunctionError.js` — `extractEdgeFunctionError(fnError)` reads the JSON body from `fnError.context.json()` and returns `body.error` if present, falling back to `fnError.message`. Use this instead of `data?.error || fnError.message` because `data` is always `null` for non-2xx responses from `supabase.functions.invoke`.

### Known production quirks
- **Edge function must be deployed with `--no-verify-jwt`** — Supabase's new `sb_publishable_...` key format is not a JWT, so the runtime rejects requests otherwise.
- **On Windows CMD, `KEY=value command` syntax doesn't work** — use `set KEY=value` then the command on a separate line. In bash (Git Bash / WSL) the inline syntax works fine.
- **Creating teacher accounts manually:** Supabase Auth dashboard doesn't set `raw_user_meta_data` at creation time, so the trigger inserts with default role `student`. Always follow up with a manual SQL insert into `profiles` for the correct role/name.
- **Email confirmation:** If Supabase Auth email confirmation is enabled, students see a "check your email" screen after signup. For school use, consider disabling it (Auth → Settings → disable email confirmations).
- **Storage RLS:** `storage.objects` has a policy `students can upload audio` allowing authenticated users to upload to their own folder (`{uid}/...`). Service role in the edge function bypasses this for downloads.
- **Class code:** Set once by migration (random 6-char hex). To change it: `update app_settings set class_code = 'NEWCODE' where id = true;`

### Environment variables
Frontend (`.env.local`):
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY` (new format: `sb_publishable_...`)

Edge function secrets (Supabase dashboard → Edge Functions → Secrets):
- `OPENAI_API_KEY` — used for both Whisper and GPT-4o-mini
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

### Adding teacher accounts (manual process)
```sql
-- After creating user in Auth dashboard (email + password only):
insert into profiles (id, full_name, role, grade)
select id, 'Full Name', 'teacher', null
from auth.users where email = 'teacher@school.com';
```

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Preferences

### UI
- All student-facing screens must be mobile-first. Use Tailwind responsive prefixes (`sm:`, `md:`) and test layouts at 375px width. Touch targets must be at least 44px. Avoid horizontal scroll.

### Backend Integrity
- Enforce data rules at the DB level (FK, CHECK constraints, NOT NULL, triggers), not just in app code. Validate and reject bad input at the edge function boundary before any external API call (fail fast). Use transactions for multi-step writes. Return a consistent shape: `{ data }` on success, `{ error }` on failure. Keep all scoring and business logic server-side — never in client JS.

### No over-engineering
- Don't over-engineer or over-complicate. Prefer the simplest solution that satisfies the requirement. Avoid premature abstractions, unnecessary layers, and speculative generality.

### Comments
- Default to no comments. Only add one when the WHY is non-obvious and cannot be expressed through naming or structure (e.g. a hidden constraint, a workaround for a specific bug, a deliberate trade-off). Never explain what the code does — well-named identifiers do that. Never leave commented-out dead code.

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

WPM targets live in `src/lib/wpmTargets.js` — import from there, never hardcode.

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
- `StudentHome` (`/student`) — lists unread passages (read ones are hidden) + last 10 sessions; "My Progress" banner navigates to `/student/progress`
- `ReadingSession` (`/student/session/:passageId`) — audio recording
- `SessionReport` (`/student/report/:sessionId`) — word-by-word results + feedback + comprehension CTA
- `ComprehensionQuiz` (`/student/comprehension/:sessionId`) — once-only quiz with confirmation modal
- `StudentProgress` (`/student/progress`) — sparkline trend charts for Accuracy, Pace, Phrasing, Comprehension

### Teacher dashboard
- **AI Feedback toggle** — global on/off button in the header, persisted in `app_settings` table
- **Class code display** — shown in header with one-tap copy; students use this code to self-register
- **Passage Completion** (`/teacher/completion`) — per-passage cards showing count completed + chips for students who haven't read yet; chips link to student detail
- **Student detail** (`/teacher/student/:id`) — summary stats, sparkline performance trends (Accuracy, Pace, Phrasing, Comprehension), recurring difficult words, session progress table with ↑/↓ trend arrows and comprehension Reset button
- **Question Manager** — inline panel per passage in `PassageManager`; add/delete MCQs (3–5 per passage, DB-enforced by trigger)

### Shared components
- `src/components/PerformanceCharts.jsx` — exports `MetricCard` (sparkline card with Latest/Best/Change stats); used in both `StudentProgress` and `StudentDetail`
- `src/lib/wpmTargets.js` — exports `WPM_TARGETS` constant `{ 9: 140, 10: 150, 11: 160, 12: 170 }`
- `src/lib/studentStats.js` — exports `computeAvgComprehension(sessions)`

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
- `app_settings` — single-row table (`id boolean PK default true`), holds `ai_feedback_enabled boolean`, `class_code text` (random 6-char code set on migration; teacher shares with students for self-registration)
- RLS on all tables. `is_teacher()` security definer function used in profiles policy to avoid infinite recursion.

### RPCs
- `grade_comprehension(p_session_id, p_answers)` — server-side comprehension grading; validates session ownership, prevents re-grading, saves score atomically
- `reset_comprehension(p_session_id)` — teacher-only; clears `score_comprehension` and `comprehension_answers` for a session
- `validate_class_code(p_code)` — callable by anon; returns boolean; used during student signup

### Edge function error handling
`src/lib/edgeFunctionError.js` — `extractEdgeFunctionError(fnError)` reads the JSON body from `fnError.context.json()` and returns `body.error` if present, falling back to `fnError.message`. Use this instead of `data?.error || fnError.message` because `data` is always `null` for non-2xx responses from `supabase.functions.invoke`.

### Known production quirks
- **Edge function must be deployed with `--no-verify-jwt`** — Supabase's new `sb_publishable_...` key format is not a JWT, so the runtime rejects requests otherwise.
- **On Windows, `KEY=value command` syntax doesn't work** — use `set KEY=value` then the command on a separate line.
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

### Adding teacher accounts (manual process)
```sql
-- After creating user in Auth dashboard (email + password only):
insert into profiles (id, full_name, role, grade)
select id, 'Full Name', 'teacher', null
from auth.users where email = 'teacher@school.com';
```

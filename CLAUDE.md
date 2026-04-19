# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev        # start dev server (localhost:5173)
npm run build      # production build → dist/
npm run lint       # ESLint
npm run preview    # preview production build locally
```

Edge function (Deno, requires Supabase CLI):
```bash
supabase functions deploy analyze-reading
supabase functions serve analyze-reading   # local dev
```

## Architecture

This is an English reading-aloud evaluation app for high school students (grades 9–12) with a teacher dashboard.

**Stack:** React 19 + Vite + Tailwind v4, Supabase (auth, PostgreSQL, storage, edge functions), OpenAI Whisper API.

### Data flow for a reading session
1. Student opens a passage → records audio via `useAudioRecorder` (MediaRecorder → WebM blob)
2. Audio is uploaded to Supabase Storage bucket `audio` under `{studentId}/{timestamp}.webm`
3. Frontend calls Supabase Edge Function `analyze-reading` with `{ audioPath, passageText, studentId, passageId }`
4. Edge function: downloads audio → sends to Whisper API (`verbose_json` + word timestamps) → diffs transcript against passage word-by-word → computes `score_accuracy`, `score_wpm`, `score_fluency` → saves a `sessions` row with `word_results` (JSONB array of `{ word, spoken, status }`) → deletes audio file → returns `{ sessionId }`
5. Student is redirected to `/student/report/:sessionId` which renders the word-by-word colour-coded result

### Auth & routing
- `AuthContext` holds both the Supabase `user` object and the app `profile` (from `profiles` table). Always use `profile` for role/grade — never `user.user_metadata` directly in components.
- `ProtectedRoute` accepts an optional `role` prop (`"teacher"` | `"student"`). The root `/` redirects based on `profile.role`.
- Users are created via Supabase Auth; the `handle_new_user` DB trigger auto-inserts a `profiles` row using `raw_user_meta_data` fields `full_name`, `role`, `grade`.

### Database schema (key points)
- `profiles` — one row per auth user; `role` is `teacher` or `student`; `grade` is 9–12 (null for teachers)
- `passages` — created by teachers; `word_count` is stored on insert (computed client-side in `PassageManager`)
- `sessions` — one row per reading attempt; `word_results` is JSONB `[{ word, spoken, status }]` where status ∈ `correct | mispronounced | skipped`
- RLS is enabled on all tables — teachers can read everything; students only see their own sessions

### Environment variables
Frontend (`.env.local`):
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Edge function secrets (set via Supabase dashboard or `supabase secrets set`):
- `OPENAI_API_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (auto-injected by Supabase runtime)

### Supabase setup checklist
- Run `supabase/migrations/001_initial_schema.sql` in the SQL editor
- Create a **private** storage bucket named exactly `audio`
- Deploy the edge function and set `OPENAI_API_KEY` as a secret

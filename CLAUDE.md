# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev        # start dev server (localhost:5173)
npm run build      # production build → dist/
npm run lint       # ESLint
npm run preview    # preview production build locally
```

Edge function (Deno, deploy always with `--no-verify-jwt`):
```bash
SUPABASE_ACCESS_TOKEN=<token> npx supabase link --project-ref ixxrwbvrkkrlzwizloai
SUPABASE_ACCESS_TOKEN=<token> npx supabase functions deploy analyze-reading --no-verify-jwt
```

## Architecture

English reading-aloud evaluation app for high school students (grades 9–12) with a teacher dashboard.

**Stack:** React 19 + Vite + Tailwind v4, Supabase (auth, PostgreSQL, storage, edge functions), OpenAI Whisper API.  
**Deployed:** Frontend on Vercel, edge function on Supabase (ap-south-1), repo: github.com/lwspune/english-ai-tutor.

### Data flow for a reading session
1. Student opens a passage → records audio via `useAudioRecorder` (MediaRecorder → WebM blob)
2. Audio uploaded to Supabase Storage bucket `audio` under `{studentId}/{timestamp}.webm`
3. Frontend calls edge function `analyze-reading` with `{ audioPath, passageText, studentId, passageId }`
4. Edge function: downloads audio → Whisper API (`verbose_json`) → word-by-word diff against passage → computes `score_accuracy`, `score_wpm`, `score_fluency` → saves `sessions` row with `word_results` JSONB → deletes audio → returns `{ sessionId }`
5. Student redirected to `/student/report/:sessionId` — word-by-word colour-coded report

### Auth & routing
- `AuthContext` holds both the Supabase `user` and app `profile` (from `profiles` table). Always use `profile` for role/grade — never `user.user_metadata` in components.
- `ProtectedRoute` accepts optional `role` prop (`"teacher"` | `"student"`). Root `/` redirects based on `profile.role`.
- The `handle_new_user` DB trigger auto-creates a `profiles` row on signup using `raw_user_meta_data`. When creating users manually via the Supabase dashboard, insert profiles via SQL instead (the dashboard doesn't set metadata at creation time).

### Database schema (key points)
- `profiles` — `role` is `teacher` or `student`; `grade` 9–12 (null for teachers)
- `passages` — `word_count` computed client-side on insert in `PassageManager`
- `sessions` — `word_results` is JSONB `[{ word, spoken, status }]`, status ∈ `correct | mispronounced | skipped`
- RLS on all tables. `is_teacher()` security definer function used in profiles policy to avoid infinite recursion.

### Known production quirks
- **Edge function must be deployed with `--no-verify-jwt`** — Supabase's new `sb_publishable_...` key format is not a JWT, so the runtime rejects requests otherwise.
- **Creating users manually:** Supabase Auth dashboard doesn't set `raw_user_meta_data` at creation time, so the trigger inserts with default role `student`. Always follow up with a manual SQL insert into `profiles` for the correct role/name.
- **Storage RLS:** `storage.objects` has a policy `students can upload audio` allowing authenticated users to upload to their own folder (`{uid}/...`). Service role in the edge function bypasses this for downloads.

### Environment variables
Frontend (`.env.local`):
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY` (new format: `sb_publishable_...`)

Edge function secrets (Supabase dashboard → Edge Functions → Secrets):
- `OPENAI_API_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (auto-injected by Supabase runtime)

### Adding new users (manual process)
```sql
-- After creating user in Auth dashboard (email + password only):
insert into profiles (id, full_name, role, grade)
select id, 'Full Name', 'student', 10   -- or 'teacher', null
from auth.users where email = 'user@example.com';
```

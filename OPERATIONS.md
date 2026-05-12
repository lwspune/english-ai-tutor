# Operations

Deployment commands, environment variables, manual procedures, and the production quirks that bite. Architectural facts live in `CLAUDE.md`; this file is purely how-to.

## Commands

```bash
npm run dev        # start dev server (localhost:5173)
npm run build      # production build → dist/
npm run lint       # ESLint
npm run preview    # preview production build locally
```

## Edge function deployment

Always deploy with `--no-verify-jwt` — the new `sb_publishable_...` key format is not a JWT and the runtime rejects requests otherwise.

**Windows CMD** (note: the `KEY=value command` inline syntax doesn't work; use `set` first):

```cmd
set SUPABASE_ACCESS_TOKEN=<token>
npx supabase functions deploy analyze-reading --no-verify-jwt
npx supabase functions deploy create-student --no-verify-jwt
npx supabase functions deploy reset-student-password --no-verify-jwt
npx supabase functions deploy send-reminders --no-verify-jwt
```

**Bash / WSL / Git Bash** — inline syntax works:

```bash
SUPABASE_ACCESS_TOKEN=<token> npx supabase functions deploy <name> --no-verify-jwt
```

## Environment variables

Frontend (`.env.local`):

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY` — new key format `sb_publishable_...`

Edge function secrets (Supabase dashboard → Edge Functions → Secrets):

- `OPENAI_API_KEY` — used for both Whisper and GPT-4o-mini
- `RESEND_API_KEY` — used by `create-student` (welcome emails) and `send-reminders` (activation/re-engagement)
- `SUPABASE_SERVICE_ROLE_KEY` — auto-injected by the Supabase runtime; do not set manually

## Adding a teacher account

The Supabase Auth dashboard doesn't set `raw_user_meta_data` at creation time, so the `handle_new_user` trigger inserts the new row with default role `student`. Always follow up with a manual SQL insert into `profiles`:

```sql
-- After creating user in Auth dashboard (email + password only):
insert into profiles (id, full_name, role, grade)
select id, 'Full Name', 'teacher', null
from auth.users where email = 'teacher@school.com';
```

## Adding student accounts

Use the **Add Student** button on the teacher dashboard (single or CSV bulk). It calls the `create-student` edge function with the service-role key and the `handle_new_user` trigger then writes the profile correctly.

For emergency SQL inserts (rare): use `auth.users` directly with `crypt(password, gen_salt('bf'))` and `raw_user_meta_data: { full_name, role: 'student', grade }`. Do NOT use the Supabase dashboard UI — it doesn't set `raw_user_meta_data`, so the trigger ends up with role `student` and no grade.

**Critical:** also set `email_change`, `email_change_token_new`, `recovery_token`, `confirmation_token`, `phone_change`, `phone_change_token`, `reauthentication_token` to `''` (empty string, NOT NULL). GoTrue's admin endpoint scans these columns as strings; a NULL on any of them makes `auth.admin.listUsers()` fail with `500 "Database error finding users: Scan error on column ... converting NULL to string is unsupported"`. That break is silent for normal user flows but fatal for `send-reminders` and any other function that lists users. Bit us on 2026-05-12; one row created via emergency SQL on 2026-05-01 left these NULL and broke the daily cron for ~11 days.

## Class code

Set once by migration as a random 6-char hex code (in `app_settings`). Teacher shares it with students for self-registration. To change it:

```sql
update app_settings set class_code = 'NEWCODE' where id = true;
```

## Resend (welcome / activation / re-engagement emails)

Sender `tutor@lwspune.in`. The domain must be verified on resend.com/domains (SPF + DKIM + return-path DNS records) or Resend returns `403 "domain not verified"`. The `create-student` edge function wraps `sendWelcomeEmail` in `Promise.allSettled`, so failures are logged but never surfaced — user creation looks successful but no email goes out. Verified on 2026-05-13 (DNS records in Hostinger; SPF + MX at `send`, DKIM at `resend._domainkey`).

API key: stored as `RESEND_API_KEY` in Supabase dashboard → Edge Functions → Secrets. Send-only restricted. Used by `create-student` and `send-reminders`. **Rate limit: 2 requests/sec on free tier** — `send-reminders` runs sequentially in a tight loop and can hit it on first daily cron firings with >5 candidates. Workaround: re-fire 2–3 times; each retry only hits the previously-failed students (function only marks `last_reminder_sent` on success). Long-term fix: add a 600ms sleep between iterations in the loop.

DNS records (live, for reference):
- `resend._domainkey` TXT — DKIM public key (`p=MIGfMA0GCSqG...IDAQAB`)
- `send` MX 10 → `feedback-smtp.ap-northeast-1.amazonses.com` (Tokyo region)
- `send` TXT → `v=spf1 include:amazonses.com ~all`

DNS edits happen in Hostinger → Websites → `lwspune.in` → Advanced → DNS Zone Editor (NOT in Hostinger Domain Portfolio — that section only shows domains registered with Hostinger, and `lwspune.in` is registered at GoDaddy but DNS-pointed at Hostinger).

## Production quirks that have bitten us

- **`handle_new_user` must qualify `public.profiles` and pin `search_path = public`** — installing `pg_cron` / `pg_net` (migration 013) shifted the function's resolved schemas, so unqualified `profiles` started failing with `relation "profiles" does not exist`. Fix captured in migration 023 (2026-05-12) along with `set search_path = public` on the other older SECURITY DEFINER functions. Fresh checkouts now reproduce prod cleanly.
- **Email confirmation:** if Supabase Auth email confirmation is enabled, students see a "check your email" screen after signup. For school use, consider disabling it (Auth → Settings → disable email confirmations).
- **Storage RLS:** `storage.objects` has a policy `students can upload audio` allowing authenticated users to upload to their own folder (`{uid}/...`). Service role in the edge function bypasses this for downloads.
- **Vercel repo visibility:** the repo is public on GitHub. Vercel Hobby plan blocks deployment of commits from non-member collaborators on private repos — making the repo public was the fix. If the repo is ever made private again, all committers must be added as Vercel team members (requires a paid plan).

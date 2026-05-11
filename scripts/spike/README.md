# Phase 1 spike — forced-alignment vs Whisper

A one-day investigation: re-score 10 production sessions with CTC forced alignment (wav2vec2-base-960h) and compare against the stored Whisper scores. Decides whether the full Phase 1 migration is worth committing to.

## What this does

1. `analyze-reading` (edge function) retains audio for the first 10 sessions after retention is enabled, instead of deleting it.
2. `spike_compare.py` (local) pulls those audio files, runs `spike_fa.py` on each, and writes a per-session comparison to `spike-audio/results.csv`.
3. You spot-check 5–10 rows manually against the actual audio and decide:
   - **Green** → FA scores honest readers within ±3 points and weaker readers materially lower → proceed with full Phase 1.
   - **Yellow** → some sessions look wrong → tune (swap to MMS model, adjust threshold, or refine accent rules) and re-run.
   - **Red** → FA fundamentally misbehaves on your audio → reconsider approach.

No accent rules are applied in this spike — raw FA scoring only. The accent ruleset (`services/forced-alignment/ie-v1.json`) is drafted for the full Phase 1 service.

## Prerequisites

Install on the machine you'll run the comparison from (your laptop is fine; CPU-only is OK).

### 1. Python 3.10+

Check: `python --version`. If missing, install from python.org.

### 2. ffmpeg

Required to decode WebM audio.

**Windows:** `winget install ffmpeg` (or download from ffmpeg.org and add to PATH).
**Verify:** `ffmpeg -version`

### 3. Python dependencies

```powershell
cd scripts\spike
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

First install pulls ~3 GB (PyTorch wheels + the model is downloaded on first run). Subsequent runs are fast.

### 4. Environment variables

The comparison script needs service-role access to Supabase to download retained audio. Set in your shell:

```powershell
$env:SUPABASE_URL = "https://ixxrwbvrkkrlzwizloai.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY = "<your service role key>"
```

(Service role key is in your Supabase dashboard → Settings → API. Never commit it.)

## Running the spike

### Step 1 — enable retention

In SQL (via Supabase SQL editor or `mcp__supabase__execute_sql`):

```sql
update app_settings
set spike_audio_retention = true,
    spike_audio_retention_count = 0,
    spike_audio_retention_limit = 10
where id = true;
```

### Step 2 — wait for 10 sessions

Students complete sessions normally. The edge function atomically claims slots; once 10 are captured the flag auto-disables. Monitor with:

```sql
select spike_audio_retention, spike_audio_retention_count, spike_audio_retention_limit
from app_settings where id = true;
```

Or count retained sessions directly:

```sql
select count(*) from sessions where spike_audio_path is not null;
```

### Step 3 — run the comparison

```powershell
cd scripts\spike
.venv\Scripts\Activate.ps1
python spike_compare.py
```

Output:
- `spike-audio\results.csv` — one row per session with side-by-side scores
- `spike-audio\details\<session_id>.json` — full FA breakdown for that session
- `spike-audio\files\<session_id>.webm` — the downloaded audio (delete after review)

### Step 4 — review

Open `results.csv` in a spreadsheet. For each row, listen to the audio and fill in:
- `manual_verdict`: `correct` / `fa_too_strict` / `fa_too_lenient` / `accent_issue`
- `notes`: anything specific (e.g., "skipped 3 words FA caught, Whisper missed")

A good outcome is roughly:
- Strong readers: FA within ±3 points of Whisper
- Weak readers: FA noticeably lower (this is the inflation we wanted to remove)
- Accent-heavy readers: low FA scores in the verdict column → confirms the rule layer is needed in Phase 1

### Step 5 — clean up

```sql
-- Delete retained audio files from storage
delete from storage.objects
where bucket_id = 'audio'
  and name in (select spike_audio_path from sessions where spike_audio_path is not null);

-- Clear the spike_audio_path column (audio is gone)
update sessions set spike_audio_path = null where spike_audio_path is not null;

-- Make sure the flag is off (auto-disable should have already done this)
update app_settings set spike_audio_retention = false where id = true;
```

Then delete `spike-audio/files/` locally.

## Files

| Path | Purpose |
|---|---|
| `spike_fa.py` | Standalone FA scorer. Takes audio + text, returns JSON. |
| `spike_compare.py` | Orchestrator. Pulls retained sessions, runs FA, writes CSV. |
| `requirements.txt` | Python deps pinned for reproducibility. |
| `services/forced-alignment/ie-v1.json` | Drafted accent ruleset (not applied here — Phase 1 service applies it). |

## Notes

- The spike script is intentionally rough. It's a one-off investigation, not production code. The Phase 1 Cloud Run service will be a clean rewrite.
- wav2vec2-base-960h is US English. If the spike shows accent bias even on strong readers, the production model will swap to `facebook/mms-1b-all` (multilingual).
- CPU inference for ≤90s audio takes ~3–8 seconds. GPU not required.
- Audio is downloaded locally only for the comparison run. Delete after review.

# Findings

Append-only log of empirical findings — patterns, observations, methods — surfaced through analysis. Distinct from `DECISIONS.md` (which captures *choices* with watch + revisit triggers) and `CLAUDE.md` (which captures *architecture*). A finding might support multiple decisions over time, or none.

## How to write an entry

```
## YYYY-MM-DD — Short finding title

**Finding:** the observation or pattern itself.

**Method:** how we got there. Cite enough that the finding is replicable — which SQL query, which spike round, which session_ids, which transcripts.

**Implication:** what this means for product, OR "no immediate decision — baseline knowledge."

**Status:** confirmed / preliminary / disputed, with n + date.
```

## Discipline

Add an entry only when the finding is:
1. **Sourced from data, not opinion.** Pull a query, run a script, read a transcript — cite the source.
2. **Took real analytical work to surface.** "Whisper costs $0.006/min" is documentation; "Whisper over-substitutes IE-accent reads by ~10pts" is a finding.
3. **Durable across product pivots.** Live numbers (today's session count) go in `memory/project_state.md`. Findings about *how the system behaves* go here.

Most session work won't qualify — that's the point. The bar keeps this file useful.

## Updating

Findings invalidated by later data should NOT be deleted. Append a follow-up entry that cites and supersedes the original. The record of "we thought X, then learned Y" is itself valuable.

When a finding gets a new data point that confirms or extends it, edit the **Status** line (bump `n`, update the date) and add a one-line note rather than rewriting the entry.

---

## 2026-05-16 — Whisper-1 systematically over-substitutes IE-accented English readers

**Finding:** OpenAI Whisper-1 transcription scores IE-accent English readers 6–11 accuracy points lower than CTC forced-alignment (FA) acoustic scoring on the same audio, even when the student really read the passage correctly. The pattern is voice-consistent (same student shows the gap across multiple sessions) and direction-consistent (Whisper never scores materially *higher* than FA on real reads — bias is one-directional).

**Method:** FA spike Round 2B (2026-05-16) re-scored 21 retained production sessions with calibrated wav2vec2-base-960h forced alignment (`spike_fa.py`, engine `fa-spike-v2`, `CONTENT_THRESHOLD=0.20`). Per-voice mean gaps (Whisper − FA):
- Pratibha −10.8 (n=4)
- Harshad −8.8 (n=4)
- Shankar −6 (n=4 in 2B; Round 2A v2 measured −8 on n=2)
- Gurusai +47 outlier on Inclusive Growth (real-read attribution failed; see TTS-cheat finding below)
- Pranjal MBA −1 (n=2), Shreya +1 (n=2), Sakshi 0 (n=1) — clean readers, no gap

Free-form wav2vec2 transcripts (`transcribe_wav2vec.py`) of all 12 IE-accent reads confirmed students actually read the passage; non-native acoustic artifacts like `ENGRONMENT`, `BEFOR ESITION`, `CLAMATE`, `STRUDENTS` are what Whisper was over-flagging as substitutions. Full data: `spike-audio/results_round2b.csv` + `memory/project_fa_spike.md`.

**Implication:** Mastery scoring is currently mildly inflated for fast clean readers and significantly *deflated* for IE-accented readers. Same-day mitigation: pass the passage as Whisper's `prompt` parameter (commit `2bfd0ad`, `analyze-reading` v19) — expected to close ~60–70% of the gap at zero cost. Structural answer (FA migration) remains the long-term right thing when grade 9/10/11/hard-difficulty data thresholds allow.

**Status:** Confirmed, n=12 confirmed-real reads across 3 voices, 2026-05-16. Awaiting 2026-05-19/20 pulse to verify Whisper-prompt mitigation moved the per-voice averages.

---

## 2026-05-16 — Pure TTS reads slip past both Whisper and FA

**Finding:** When a student plays a TTS rendering of the passage (instead of reading it themselves), both Whisper-1 and forced-alignment score the session as ~100% accuracy. Neither engine has a structural way to detect that the audio came from a synthesised voice. Whisper *partially* catches the cheat only when the TTS pipeline includes conversational interjections ("would you like me to continue") that don't appear in the passage — these get transcribed as substitutions, dragging the score down. Pure TTS without interjections is invisible to both engines.

**Method:** Gurusai Macharla, 3 retained sessions on 2026-05-13. Detail in `memory/project_cheating_first_confirmed.md`.

| Session | Whisper acc | FA acc | Free-form wav2vec2 transcript signal |
|---|---:|---:|---|
| Inclusive Growth | 46 | 93 | Chatbot interjections in transcript ("WOULD YOU LIKE ME TO CONTINUE", "GREAT THE TEXT GOES ON"). ChatGPT voice mode or equivalent. Whisper caught it because the interjections didn't match passage; FA only matches passage words so flagged ~clean. |
| Environmental Protection | 100 | 100 | Suspiciously clean transcript with zero acoustic artifacts versus Pratibha's same-passage read (which showed many). Probable pure TTS, no interjections — neither engine flagged. |
| Value of Honesty | 81 | 84 | Heavily mumbled transcript with dropouts. Real attempt. Engines agreed. |

User confirmed cheating independently 2026-05-16.

**Implication:** Engine choice (Whisper vs FA) is orthogonal to cheating detection. The current dashboard has been silently rewarding TTS-read sessions. Outlier-trend chip on `StudentDetail` (commit `81e9051`, `src/lib/anomalyFlag.js`) catches the accuracy-shape signature regardless of engine — calibrated against the Env Prot case (100% vs ~64% mean across the student's other reads). Harder layers (voice fingerprint, liveness via per-attempt random word insertion) deferred until cheating frequency justifies cost.

**Status:** Confirmed, n=1 student (3 sessions), 2026-05-16.

---

## 2026-05-16 — Free-form wav2vec2 is a viable independent cheat-detection signal

**Finding:** Free-form greedy-decode wav2vec2-base-960h transcription is a viable independent investigation tool for cheating cases. Because wav2vec2 is acoustic-only and has no language model, it **cannot hallucinate coherent conversational text**. Any chatbot-style phrase that appears in the transcript was provably in the audio. This bypasses the trust problem of "we can't be sure what we heard because Whisper might have made it up to fit its language model's expectations."

**Method:** Used 2026-05-16 to investigate Gurusai without listen-grading (user couldn't listen to audio at the time). `scripts/spike/transcribe_wav2vec.py` runs the model on a `.webm`, outputs raw greedy-decode text. Compared the Inclusive Growth transcript against the passage *and* against Pratibha's same-passage transcript on identical equipment — the chatbot interjections were unique to Gurusai's audio. Cost: ~30 seconds of CPU per ~5 min audio file on a venv that's already set up.

**Implication:** Reusable methodology for future cheat investigations. No external service, no API key, no listening required. Limitation: wav2vec2 *will* mistranscribe individual words on accented English (the same reason Whisper over-substitutes), so this method is for verifying *presence of unexpected coherent phrases*, not for spot-checking individual word accuracy.

**Status:** Confirmed as method, n=1 investigation, 2026-05-16.

---

## 2026-05-16 — Comprehension quiz is the only reliably-firing engagement mechanic

**Finding:** Of the 6 milestone kinds in the engagement engine (`streak_5/10/20`, `personal_best_accuracy`, `personal_best_wpm`, `comprehension_aced`, `word_mastered`, `drill_session_aced`), only `comprehension_aced` fires at meaningful volume.

| Kind | All-time | Last 14d | Last 7d |
|---|---:|---:|---:|
| comprehension_aced | 67 | 33 | 15 |
| personal_best_accuracy | 3 | 1 | 0 |
| personal_best_wpm | 3 | 1 | 0 |
| streak_5 / streak_10 / streak_20 | **0** | 0 | 0 |
| word_mastered | **0** | 0 | 0 |
| drill_session_aced | **0** | 0 | 0 |

14 of 76 students have earned any milestone ever. 11 had a celebration in last 7d.

**Method:** SQL pull against `milestones` table on 2026-05-16, grouped by `kind` with 7d / 14d / all-time counts. Cross-referenced per-student streak via `compute_student_streak(student_id)` — only Pratibha at 2; all 18 other ever-active students at 0. Word mastery zero is expected (~25-day SRS minimum still ahead; first masteries arrive ~2026-06-05 if usage continues).

**Implication:** Comprehension quiz is the high-leverage engagement mechanic — protect and amplify. Personal-best decay is expected (students near ceilings) but means the "celebrate improvement" loop has gone quiet. Streak mechanic and drill milestone are both showing 0 — different root causes (streak misalignment with burst usage; drill UX under-discovered).

**Status:** Confirmed, n=19 ever-active students, 2026-05-16.

---

## 2026-05-16 — Active students use the app in bursts, not daily

**Finding:** Active students do multiple sessions in one day, then nothing for several days — not 1 read per day. Pratibha did 4 reads on 2026-05-14, then nothing on 2026-05-15 or 2026-05-16. Of 19 ever-active students, only 1 currently has any active streak (Pratibha, 2).

**Method:** Per-day session count over last 14 days plus per-student streak via `compute_student_streak(student_id)`. Both queried 2026-05-16.

**Implication:** Streak mechanics designed for daily-habit consumer apps (Duolingo-style) misfire on this cohort. Showing "streak 0" to 18 of 19 active students every visit is silent demotivation — the only thing worse than no streak is a broken-looking streak. Likely fixes: (a) loosen to "any app activity" instead of "daily session"; (b) change cadence from daily to weekly ("3 sessions/week = streak"). The 3-day cooldown in `send-reminders` lines up with bursts naturally, but the v8 messaging assumed daily ("Your reading practice is waiting" reads as guilt-trip after a 4-session day). v9 templates (commit `40f68c2`) lead with score hook instead — partial mitigation.

**Status:** Confirmed, n=19 ever-active students, 2026-05-16.

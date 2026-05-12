# Roadmap

Captured 2026-05-12 after a critical review of a 15-item product wishlist. This file holds the picks worth building, in build order, plus the rationale for what was deliberately skipped. Treat as a planning artifact, not a contract — revisit when a foundation assumption changes.

## Build order

Each item below has: *why it's worth doing*, *when to do it*, and the *concrete first step*. Sequencing matters — the dependencies are real.

### 1. Self-reflection prompts — ship next

Adds a metacognition signal the app currently lacks. Cheap (~half a day), independent of every other initiative, and unlocks a downstream metric ("self-perception calibration") that no other feature produces.

**First step:** migration adds `sessions.self_perception text` (values `easier | same | harder | null`). After every `SessionReport`, a 3-button question: *"Did this feel easier / same / harder than last time?"* Store. Skippable. Later: compare against actual accuracy delta to surface students who consistently mis-rate themselves — real teacher insight.

Maps loosely to suggestion #12 from the original list.

### 2. Vocab–reading deeper integration — ship in ~2 weeks

Roughly 70% of the infrastructure already exists (v2.1 highlights, retention quiz, TTS audio). The extensions tighten a real pedagogical loop instead of inventing a new one, and indirectly mitigate the "0 reading-encounters" data-coverage problem.

**First step (two parts, in order):**
- **Pre-reading vocab preview card** on `ReadingSession`: a 5-second tap-through showing the 2-3 vocab words that appear in the passage, with definition + audio. Adds zero friction (skippable). Solves "students hit vocab words cold."
- **Post-reading wrong-word SRS push:** vocab words appearing in `word_results` with `status ≠ 'correct'` get pushed down a Leitner box in `student_word_progress` via the existing `grade_vocab_attempt` (or a new sibling RPC). Reading mistakes feed practice automatically.

Maps to suggestion #11.

### 3. Persistent student signals — BLOCKED on Phase 1 FA migration

Foundation for adaptive difficulty, weakness drills, smart next-best-action, dynamic goals. **Do not build before FA is validated** — every signal here is Whisper-tainted today, and a sophisticated adaptive engine built on inflated accuracy regressively hurts the weakest readers (the people the engine is supposed to help most).

**First step (post-FA):** add a `student_signals` table aggregated from `sessions` + `student_word_progress` + `milestones`, refreshed by trigger or cron. Suggested columns:

```
student_id uuid pk references profiles(id)
rolling_accuracy_30d numeric
rolling_wpm_30d numeric
wpm_trajectory text  -- 'rising' | 'flat' | 'falling'
recurring_omission_words text[]  -- top 5 words skipped across last 10 sessions
recurring_substitution_words text[]
vocab_velocity numeric  -- words mastered per week
consistency_index numeric  -- 0-1, std dev of accuracy across last 10 sessions
last_active_at timestamptz
updated_at timestamptz
```

Once this exists, items 4 below — plus a smarter hero "Next Up", dynamic per-student goal text, and adaptive difficulty gating — are each 1–2 day extensions rather than multi-week features.

Maps to suggestion #1; absorbs the actionable parts of #2, #6, #14.

### 4. Weakness-specific deliberate-practice drills — BLOCKED on #3

The highest *learning* leverage on the original list. Operationalises the "Deliberate Practice" principle from CLAUDE.md that's currently aspirational. Replaces generic "keep practising" advice with specific, evidence-driven micro-interventions.

**First step (post-#3):** a 60-second drill component injected after a session whose accuracy is below the student's rolling average. Drill content pulled from `student_signals.recurring_omission_words` (or `recurring_substitution_words` if those dominate). UI: 2–3 of the troublesome words shown in single-sentence contexts, read aloud, scored on the spot.

Maps to suggestion #3.

## Absorbed (not separate features)

These were in the original list but are better as small extensions of existing surfaces, not standalone work:

- **Practice mode (#5)** → a `?practice=1` query param on `ReadingSession`. Skip the DB write, skip the scoring screen, still runs Whisper for word-level feedback. ~2 hours, no new flow.
- **Smart Next-Best-Action (#6)** → the existing hero card on `StudentHome` already *is* the NBA engine. Upgrade it to read from `student_signals` once #3 lands. Do not build a parallel system.
- **Longitudinal motivation narrative (#8)** → already partially shipped as the milestone log. Optional extension: one prose line at the top of `StudentProgress`, generated weekly by GPT from the recent milestone payload (~$0.001/student/week).
- **Disengagement detection (#13)** → extend the existing `send-reminders` pipeline. Add: students whose accuracy trends downward 3 sessions in a row get flagged on the teacher dashboard, not auto-soothed in the student UI.
- **Frictionless recovery (#9)** → minimal version only: if last 3 sessions average below a threshold, the hero card picks the next-easier passage. One conditional, not a "corrective drill" surface.

## Quality-of-life items (added 2026-05-12)

Smaller wins that don't fit the big learning-loop initiative model but earn their build cost. Most are independent of the Phase 1 FA migration. Not strictly ordered — pick by current opportunity. Reframes of three broader product asks (collecting feedback, engagement/nudging engine, premium app feel) — see the "Deliberately skipped" section for why the broader framings were narrowed.

### A. Content reports (v3) — ~4 days

Student-side "Report this question" / "Report this pronunciation" buttons on `SessionReport` and `ComprehensionQuiz`, plus a teacher review queue. Full plan + open decisions captured in `memory/project_planned_content_reports.md`.

**Why it pulls weight:** the most actionable feedback channel for a 73-student deployment. Generic app feedback from teens is noisy; targeted "this question is wrong" / "the AI said I mispronounced 'fraudulent' but I said it correctly" routes specific content fixes straight to the teacher.

**First step:** read `memory/project_planned_content_reports.md`. The open decisions there (storage shape, teacher-review surface, notification cadence) determine the scope.

### B. Per-session 👍/👎 rating — ~1 day

A thumbs-up/down control on `SessionReport`, optional one-line text comment. Stored as `sessions.student_rating smallint` (-1 / 0 / 1) + `sessions.student_comment text` (nullable, ~140 char cap). No 5-star, no long-form input.

**Why it's worth the day — conditional:** *only if* someone will read the reports weekly. Silent feedback rots faster than no feedback. Useful for "is this passage too hard?" / "is the AI feedback useful?" Decide the consumer (probably a "Recent feedback" row on the teacher dashboard) before building.

**First step:** decide and document the consumer. Without that, do not ship.

### C. Streak-at-risk Monday email — ~2 hours

Extend `send-reminders` cron. Once on Monday morning IST, email any student whose streak is still technically alive (no break Mon since weekends don't count) but who didn't read Fri/Sat/Sun. One concrete sentence: *"Your N-day streak resets today if you don't read."*

**Why two hours of work is worth it:** the only nudge in the engagement repertoire that's grounded in a real learning signal (streak = consistency habit) without crossing into manipulative loss-aversion. Honest reminder, not a guilt trip.

**First step:** add a `streak_at_risk` category to `buildReminderList` in `src/lib/reminders.js`. Existing 3-day cooldown still applies. Test path: student with streak ≥1, no session Fri–Sun, Monday-AM cron run → email generated.

### D. Adaptive reminder timing — ~half day, gated on data

Track each student's modal reading hour (IST-localised from `sessions.created_at`). Shift their `send-reminders` send time to ~10 minutes before that hour, replacing the current global 04:30 UTC slot.

**Why:** opening a reminder 10 minutes before you'd naturally read is dramatically more effective than one that arrives at random. Real cohort data should show clear per-student modes; if it doesn't yet, this feature is premature — students don't have entrenched habits yet.

**First step:** SQL — for each student with ≥10 sessions, compute `mode(extract(hour from created_at AT TIME ZONE 'Asia/Kolkata'))`. If at least 10 students show a clear mode (frequency >40% of their sessions in one hour-bucket), build it. Otherwise, park for 3 months and re-check.

### E. Polish sprints — A then B then C

"Premium app feel" ships in three independent ~2-day blocks, each individually shippable. Don't roadmap "premium feel" as a single line item — it's a sensibility, not a feature, and framing it as one bucket guarantees it never feels done.

- **E.A. Empty states + skeleton loading** — replace generic spinners with shaped skeleton blocks across `StudentHome`, `SessionReport`, `StudentProgress`, `VocabHome`, `TeacherDashboard`. Replace "no sessions yet" plain text with illustrated empty cards that suggest the next action.
- **E.B. First-time student onboarding** — 3 cards on first `StudentHome` visit: how to read aloud, how the AI scores, how the vocab + drill loops work. Skippable, auto-dismissed after view; localStorage flag (same pattern as `weekly_summary_seen_{studentId}`).
- **E.C. Landing/marketing page** — `/` for unauthenticated visitors becomes a real page (currently just redirects to login). Parents browsing the URL should see the value prop. Copy + 2-3 illustrations + sign-in CTA.

**Why this framing:** the engagement polish layer (sound, haptics, confetti, animations) shipped 2026-05-11 lifted the *moment-to-moment* feel. These three lift the *first-impression* and *unfamiliar-state* feel — where students drop off most.

## Deliberately skipped

These were rejected after analysis. Documented so we don't re-litigate them.

- **#4 Confidence management (auto-soften after failure)** — risks producing the "comfortable but not learning" failure mode. Without an honest signal, the system can't tell whether a student needs more challenge or less. The safer move is to *surface* the failure to the teacher, not paper over it. Revisit only after #3 lands and the signal can distinguish productive struggle from collapse.
- **#7 Reading warmups** — adds friction to a flow students already abandon. A 30-second warmup before a 60-second read doubles perceived effort. Pre-FA, the "predicted difficult words" would be guesses anyway. Revisit after #3.
- **#10 Effort recognition / persistence rewards** — bumps directly against the CLAUDE.md guardrail forbidding variable-reward patterns. The milestone log already recognises real learning achievements; adding "points for trying" is one design iteration away from the slot-machine antipattern explicitly off-limits in a school context with minors.
- **#15 Recovery intelligence (track behaviour after mistakes)** — requires per-word timing and per-word classification at a resolution the current Whisper signal can't deliver. Premature even after #3 ships; needs precise mid-utterance timing that only FA can provide.
- **Generic app rating + free-text feedback (2026-05-12 reframe)** — narrowed to (a) content reports = targeted artefact-specific feedback, and (b) per-session 👍/👎 = narrow signal — both in "Quality-of-life items" above. A general "rate the app" prompt collects mostly noise from teen users; the teacher remains the qualified judge of pedagogical value. **Verbal/audio feedback specifically** rejected: requires meaningful infra (storage, transcription, review UI) for a signal that targeted text would have surfaced just as well, and adds another non-consent voice-data risk.
- **Full engagement / nudging "engine" (2026-05-12 reframe)** — the existing `send-reminders` cron is the engine. Building a new engine invites scope creep into territory the CLAUDE.md engagement-guardrails forbid (variable rewards, streak shields, loss-aversion patterns). Specific high-value nudges (items C + D in "Quality-of-life items" above) extend the existing pipeline instead. Reputation risk worth naming: schools and parents are increasingly suspicious of apps that push nudges to kids' phones; the current restrained pattern (3-day cooldown, no streak shields, teacher-distributed credentials) is the moat, not a weakness.
- **"Premium app feel" as a single line item (2026-05-12 reframe)** — not a feature, a sensibility. Replaced by item E in "Quality-of-life items" above (polish sprints A/B/C). Roadmapping "premium feel" as one line traps the work in a never-finished bucket.

## Cross-cutting framing

Two principles to apply when judging future additions to this roadmap:

1. **"Teacher-augmented at scale", not "teacher-independent."** The teacher (currently the project owner) remains the override authority. The app does what a 1:30 teacher can't afford to do per student. Adaptive engines that *replace* teacher judgement are out of scope — schools didn't buy that and minors shouldn't be staked on it.
2. **Honest scoring is a prerequisite, not a parallel workstream.** Anything that consumes per-session accuracy / WPM / omission counts as input to a derived feature must wait for Phase 1 FA. Building adaptive logic on inflated Whisper scores hurts the students the logic is meant to help most.

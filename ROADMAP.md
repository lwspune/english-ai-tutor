# Roadmap

Captured 2026-05-12 after a critical review of a 15-item product wishlist. This file holds the picks worth building, in build order, plus the rationale for what was deliberately skipped. Treat as a planning artifact, not a contract — revisit when a foundation assumption changes.

**Hypothesis convention (added 2026-05-12).** Each active item carries a `**What we'll learn:**` line — the testable claim the build is meant to validate, plus the signal we'd watch to know it's true or false. When an item ships, the hypothesis becomes a `DECISIONS.md` entry with a watch + revisit trigger. If you find yourself unable to write a hypothesis for an item, that item isn't ready for build order yet.

## Build order

Each item below has: *why it's worth doing*, *when to do it*, the *concrete first step*, and *what we'll learn*. Sequencing matters — the dependencies are real.

### 1. Self-reflection prompts — ship next

Adds a metacognition signal the app currently lacks. Cheap (~half a day), independent of every other initiative, and unlocks a downstream metric ("self-perception calibration") that no other feature produces.

**First step:** migration adds `sessions.self_perception text` (values `easier | same | harder | null`). After every `SessionReport`, a 3-button question: *"Did this feel easier / same / harder than last time?"* Store. Skippable. Later: compare against actual accuracy delta to surface students who consistently mis-rate themselves — real teacher insight.

**What we'll learn:** whether self-perception spreads predictably against measured accuracy delta, or whether students systematically mis-calibrate. If most rate accurately within their own band, the metric is redundant with accuracy itself and we kill the feature. If 20%+ of ratings are clearly mis-calibrated (rated "easier" but accuracy dropped, or vice versa), that's an actionable teacher signal we can't get any other way.

Maps loosely to suggestion #12 from the original list.

### 2. Vocab–reading deeper integration — ship in ~2 weeks

Roughly 70% of the infrastructure already exists (v2.1 highlights, retention quiz, TTS audio). The extensions tighten a real pedagogical loop instead of inventing a new one, and indirectly mitigate the "0 reading-encounters" data-coverage problem.

**First step (two parts, in order):**
- **Pre-reading vocab preview card** on `ReadingSession`: a 5-second tap-through showing the 2-3 vocab words that appear in the passage, with definition + audio. Adds zero friction (skippable). Solves "students hit vocab words cold."
- **Post-reading wrong-word SRS push:** vocab words appearing in `word_results` with `status ≠ 'correct'` get pushed down a Leitner box in `student_word_progress` via the existing `grade_vocab_attempt` (or a new sibling RPC). Reading mistakes feed practice automatically.

**What we'll learn:** whether `last_encounter_source = 'reading'` rows start populating once content actually contains vocab words (currently 0; root cause is content-overlap, not the trigger). If still 0 after the preview ships, the content problem dominates and we re-content the recent passages. If reading-source rows climb and SRS box drops correlate with subsequent in-session improvement, the loop closes.

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

**What we'll learn:** whether students cluster into 2–4 distinct profiles (high-consistent, climbing, flat, struggling) when aggregated against these signals. If clusters emerge, adaptive logic has traction and items 4+ have a foundation. If signals don't cluster (most students look noisy and similar), the personalisation thesis is wrong and the foundation we'd build on adaptive logic is unstable — revert to teacher-driven judgement.

Maps to suggestion #1; absorbs the actionable parts of #2, #6, #14.

### 4. Weakness-specific deliberate-practice drills — BLOCKED on #3

The highest *learning* leverage on the original list. Operationalises the "Deliberate Practice" principle from CLAUDE.md that's currently aspirational. Replaces generic "keep practising" advice with specific, evidence-driven micro-interventions.

**First step (post-#3):** a 60-second drill component injected after a session whose accuracy is below the student's rolling average. Drill content pulled from `student_signals.recurring_omission_words` (or `recurring_substitution_words` if those dominate). UI: 2–3 of the troublesome words shown in single-sentence contexts, read aloud, scored on the spot. (Note: the v1c drill shipped 2026-05-12 is the surface; this item is the *signals-driven* version that replaces the simple top-3 picker.)

**What we'll learn:** whether drilling on a word measurably shifts that word out of `recurring_substitution_words` / `recurring_omission_words` within 14 days. If yes, deliberate practice produces durable change and the loop is real. If no, drilling is exposure without retention — kill the mechanic or fundamentally rethink it. (v1c on a simple top-3 picker is the cheap baseline against which the signals-driven version proves its worth.)

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

**What we'll learn:** the distribution of report types and the long-tail vs. short-tail shape. Hypothesis: a handful of items get multiple reports (real fixes) plus a long tail of one-offs. If reports are zero after 30 days, students either don't trust the channel or have nothing to report — both useful signals about content quality vs. UX trust.

### B. Per-session 👍/👎 rating — ~1 day

A thumbs-up/down control on `SessionReport`, optional one-line text comment. Stored as `sessions.student_rating smallint` (-1 / 0 / 1) + `sessions.student_comment text` (nullable, ~140 char cap). No 5-star, no long-form input.

**Why it's worth the day — conditional:** *only if* someone will read the reports weekly. Silent feedback rots faster than no feedback. Useful for "is this passage too hard?" / "is the AI feedback useful?" Decide the consumer (probably a "Recent feedback" row on the teacher dashboard) before building.

**First step:** decide and document the consumer. Without that, do not ship.

**What we'll learn:** whether session ratings correlate with measurable signals (accuracy, return-rate, comprehension score) or pick up something objective metrics miss. If ratings are highly correlated with accuracy, the channel is redundant — the data already shows what students would say. If they diverge (e.g., students rate 👎 on sessions where they scored well), there's a subjective layer the metrics miss and the feedback is earning its keep.

### C. Streak-at-risk Monday email — ~2 hours

Extend `send-reminders` cron. Once on Monday morning IST, email any student whose streak is still technically alive (no break Mon since weekends don't count) but who didn't read Fri/Sat/Sun. One concrete sentence: *"Your N-day streak resets today if you don't read."*

**Why two hours of work is worth it:** the only nudge in the engagement repertoire that's grounded in a real learning signal (streak = consistency habit) without crossing into manipulative loss-aversion. Honest reminder, not a guilt trip.

**First step:** add a `streak_at_risk` category to `buildReminderList` in `src/lib/reminders.js`. Existing 3-day cooldown still applies. Test path: student with streak ≥1, no session Fri–Sun, Monday-AM cron run → email generated.

**What we'll learn:** whether Monday read-rate among streak-at-risk students lifts vs. the prior 4-week baseline. >10% absolute lift is a clear win. If lift is flat or negative, the reminder either isn't being opened or feels like nagging — pull it.

### D. Adaptive reminder timing — ~half day, gated on data

Track each student's modal reading hour (IST-localised from `sessions.created_at`). Shift their `send-reminders` send time to ~10 minutes before that hour, replacing the current global 04:30 UTC slot.

**Why:** opening a reminder 10 minutes before you'd naturally read is dramatically more effective than one that arrives at random. Real cohort data should show clear per-student modes; if it doesn't yet, this feature is premature — students don't have entrenched habits yet.

**First step:** SQL — for each student with ≥10 sessions, compute `mode(extract(hour from created_at AT TIME ZONE 'Asia/Kolkata'))`. If at least 10 students show a clear mode (frequency >40% of their sessions in one hour-bucket), build it. Otherwise, park for 3 months and re-check.

**What we'll learn:** whether reading-hour habits are even stable at this scale. If most students don't show modes, students don't yet have habits the timing can hook into and this feature is premature. The SQL itself is the experiment — no build needed to invalidate.

### E. Polish sprints — A then B then C

"Premium app feel" ships in three independent ~2-day blocks, each individually shippable. Don't roadmap "premium feel" as a single line item — it's a sensibility, not a feature, and framing it as one bucket guarantees it never feels done.

- **E.A. Empty states + skeleton loading** — *partial (2026-05-16).* "Needs Your Attention" empty states ("Everyone active ✓" / "Everyone onboarded ✓" / "No suspicious sessions ✓") shipped in Phase 2 of the teacher overhaul (commit `f56588f`). Still TODO: skeleton blocks (not just spinners) across `StudentHome`, `SessionReport`, `StudentProgress`, `VocabHome`, and the load states on the rest of `TeacherDashboard`. Illustrated empty cards on student-side surfaces still pending.
- **E.B. First-time student onboarding** — 3 cards on first `StudentHome` visit: how to read aloud, how the AI scores, how the vocab + drill loops work. Skippable, auto-dismissed after view; localStorage flag (same pattern as `weekly_summary_seen_{studentId}`).
- **E.C. Landing/marketing page** — **✅ done 2026-05-13 (commit `f4cc4f2`); polish pass shipped 2026-05-16 (commit `66ee4fb`).** `/` for unauthenticated visitors now renders `LandingPage` — hero + trust strip + 4 feature cards + waitlist form + B2C Phase 0 trigger at 50 signups. The polish pass added: indigo book-glyph mark + sticky backdrop-blur header, soft radial-gradient hero bg, pulsing green-dot trust strip, icon-tiled feature cards with hover lift, indigo-50→white gradient CTA, fade-up motion. Active learning loop: see `memory/project_b2c_trial_validation.md` for the 6-week watch trigger to 2026-06-24.

**Why this framing:** the engagement polish layer (sound, haptics, confetti, animations) shipped 2026-05-11 lifted the *moment-to-moment* feel. These three lift the *first-impression* and *unfamiliar-state* feel — where students drop off most.

**What we'll learn (per sprint):**
- E.A — whether students bounce less from empty / loading states. Compare bounce-from-empty rate (sessions where the student lands on a blank page and leaves within 10s) before/after.
- E.B — first-time-student → second-session conversion. Currently unknown; baseline once the onboarding ships.
- E.C — *active*. Waitlist signup rate (`?src=<channel>` attribution captured per signup). Current state: 3 / 50 by 2026-06-24 with all 3 from launch day; channel test underway.

### F. Anti-cheat hardening v2 — gated on confirmed-cheat frequency

Deferred at v1 ship time (2026-05-16). The v1 outlier-flag chip (`src/lib/anomalyFlag.js` + `StudentDetail` amber chip) is the only anti-cheat surface today and is intentionally a *heuristic UI hint*, not server-side enforcement. Confirmed cheat count at v1 ship: n=1 (Gurusai, see `memory/project_cheating_first_confirmed.md`).

**Why now-on-the-roadmap-but-not-yet-built:** the v1 chip catches the accuracy-shape pattern (sudden 100% in a student's history). It does NOT catch the harder cases: in-trend TTS reads (student plays a TTS that scores similar to their own average → no spike to flag), voice changes between sessions, or single-session first-attempts where no baseline exists.

**Tiered escalation, in cost order:**
1. **Trend-anomaly flag on the dashboard** — surface every outlier across the class on `/teacher`, not just per-student. *Partially shipped 2026-05-16 as the "Outlier sessions" sub-section in the Needs Your Attention card.* Done.
2. **Liveness via random-word insertion** — passage rendering prepends a 1-word challenge ("read the colour BLUE then begin") that rotates per attempt. TTS pipelines won't include the perturbation; humans will. ~1 day. The right next step *if cheating frequency justifies it*.
3. **Voice-fingerprint comparison** — store a low-dim embedding per student from their first 3 sessions; flag sessions whose embedding diverges. ~1 week (model integration + storage). Higher cost; only if liveness leaks.

**Trigger:** ≥5 confirmed cheats in 30 days OR a teacher report that liveness would have caught something. Until then, the v1 chip is the right floor.

**What we'll learn:** whether cheating scales linearly with student count or stays concentrated to a few individuals. Concentrated = teacher conversation suffices; scaling = build liveness.

### G. Teacher pages premium polish — remaining surfaces (deferred 2026-05-16)

Phase 3b of the teacher overhaul (commit `3a70bdc`) applied the polish pass to `/teacher` and `/teacher/student/:id` only. The same treatment (`text-3xl tracking-tight` numbers, `shadow-sm hover:shadow hover:-translate-y-0.5` on cards, `text-lg font-semibold tracking-tight` section headings, uppercase tracking-wide chip labels) is NOT yet applied to:

- `/teacher/passages` (`PassageManager`) — the most-used teacher CRUD surface
- `/teacher/audio-review` — recently shipped; visual treatment is functional but not polished
- `/teacher/waitlist` — same
- `/teacher/completion` — same

**Why deferred:** the user explicitly stopped Phase 3 at the polish-of-most-used-pages mark and wanted real-use feedback before continuing. Polish without usage is guessing.

**First step:** pick one teacher page that's actively bothering you (probably PassageManager since it's used daily). Apply the same 3-move recipe used in Phase 3b: heading hierarchy, shadow-sm + hover-lift on cards, tracking-tight on numbers.

**What we'll learn:** whether the polish ratio holds (each ~30 min CSS pass produces a visible lift) or whether the dashboard already absorbed the polish that mattered. If you don't miss the polish on the deferred pages after a week, the work isn't earning its cost.

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

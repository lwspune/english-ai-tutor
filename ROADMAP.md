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

## Deliberately skipped

These were rejected after analysis. Documented so we don't re-litigate them.

- **#4 Confidence management (auto-soften after failure)** — risks producing the "comfortable but not learning" failure mode. Without an honest signal, the system can't tell whether a student needs more challenge or less. The safer move is to *surface* the failure to the teacher, not paper over it. Revisit only after #3 lands and the signal can distinguish productive struggle from collapse.
- **#7 Reading warmups** — adds friction to a flow students already abandon. A 30-second warmup before a 60-second read doubles perceived effort. Pre-FA, the "predicted difficult words" would be guesses anyway. Revisit after #3.
- **#10 Effort recognition / persistence rewards** — bumps directly against the CLAUDE.md guardrail forbidding variable-reward patterns. The milestone log already recognises real learning achievements; adding "points for trying" is one design iteration away from the slot-machine antipattern explicitly off-limits in a school context with minors.
- **#15 Recovery intelligence (track behaviour after mistakes)** — requires per-word timing and per-word classification at a resolution the current Whisper signal can't deliver. Premature even after #3 ships; needs precise mid-utterance timing that only FA can provide.

## Cross-cutting framing

Two principles to apply when judging future additions to this roadmap:

1. **"Teacher-augmented at scale", not "teacher-independent."** The teacher (currently the project owner) remains the override authority. The app does what a 1:30 teacher can't afford to do per student. Adaptive engines that *replace* teacher judgement are out of scope — schools didn't buy that and minors shouldn't be staked on it.
2. **Honest scoring is a prerequisite, not a parallel workstream.** Anything that consumes per-session accuracy / WPM / omission counts as input to a derived feature must wait for Phase 1 FA. Building adaptive logic on inflated Whisper scores hurts the students the logic is meant to help most.

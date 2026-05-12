# Decisions

Append-only log of product decisions worth a paragraph. Distinct from the CLAUDE.md "Decisions log" tables (which capture *historical* architectural choices for context) — this file is the *running* log: every entry names what we'd watch for to know the decision was wrong, and the trigger that would revisit it.

The discipline this enforces: every decision is provisional. Writing down the watch-trigger forces us to specify in advance what would change our mind. If a decision has no plausible watch-trigger, we either don't understand it yet or it's not really a decision.

## How to write an entry

```
## YYYY-MM-DD — Short decision title

**Decision:** one sentence on what we chose.

**Context:** why this came up, what alternatives we considered.

**Watch:** the specific signal that would tell us this was wrong — a metric, a user behaviour, a piece of feedback, a system event. Be concrete; "watch usage" is not enough.

**Revisit trigger:** the condition under which we'd re-open the decision. Time-based ("after 30 days"), event-based ("when student count crosses 500"), or signal-based ("when 5 students report X").
```

Keep entries to ~5–10 lines. If a decision needs more rationale, link to a memory file or a roadmap section.

---

## 2026-05-12 — Park Phase 1 forced-alignment migration

**Decision:** Don't migrate `analyze-reading` (and now `analyze-drill`) from Whisper to CTC forced alignment yet, despite the spike calibrating green on 4/6 sessions. Revive when a feature that *needs* honest scoring is ready to ship.

**Context:** Phase 1 FA spike rounds 1 + 2A (n=6 real student sessions) demonstrated FA works on real audio with calibration. Cost win is real ($135/mo → $10/mo flat) but not bleeding at current scale. Product trigger (deliberate-practice drill on Whisper-noisy IE-accent) didn't exist when the spike started; now it does.

**Watch:** drill_attempts data once it accumulates — specifically whether IE-accent students show implausibly low `was_correct` rates that match Shankar's −8 disagreement pattern. Also any student message of "I read the word correctly but the drill said wrong."

**Revisit trigger:** ≥3 students complain about drill scoring AND a listen-grade of their audio confirms Whisper mis-transcribed correctly-read words. Or student count crosses 500 (cost lever becomes more pressing). Full revival steps in `memory/project_fa_spike.md`.

## 2026-05-12 — Ship deliberate-practice drill on Whisper, not on FA

**Decision:** Build `analyze-drill` (and frontend stumble-drill flow) against Whisper now rather than waiting for the FA migration.

**Context:** Plan originally sequenced drill behind FA (CLAUDE.md "Deliberate Practice" principle waited on honest scoring). Reframed during this session — Whisper-noise *surfacing on drill* is exactly the signal that triggers FA migration. Wait-for-FA was the safer ordering; ship-now is the *productive* ordering.

**Watch:** drill_attempts row count over the first 30 days. Was-correct rate per (student, stumble_word). Whether any student abandons mid-drill (multiple uploads with no submit).

**Revisit trigger:** if <10 unique students have drilled in 30 days, the surface isn't pulling weight — either UX issue or no-stumbles-to-drill content issue. If <60% was-correct rate across students with clean accuracy on the original session, Whisper noise is the culprit and FA migration accelerates.

## 2026-05-12 — Reframe "self-evolving app" as iteration *culture*, not A/B engine

**Decision:** Don't build experimentation infrastructure (feature flags, cohort assignment, event pipelines). Establish a weekly observation cadence + decision log + "what we'll learn" tagging on roadmap items instead.

**Context:** 73 students + 90 lifetime sessions + 0 sessions today is not the right scale for A/B testing. Sample size makes lifts statistically indistinguishable from noise. Engineering cost outweighs payoff. Optimisation drift risks degrading the CLAUDE.md engagement guardrails (no variable rewards, no loss aversion). Experimentation on minors without parent/teacher consent is an ethical line.

**Watch:** whether the cadence is actually run. Whether DECISIONS.md grows. Whether roadmap items get "what we'll learn" tags written in earnest.

**Revisit trigger:** student count crosses 500 AND Phase 1 FA migration has shipped (so the underlying metric is honest) AND the team has bandwidth for the infra cost. Until all three are true, manual observation + deliberate iteration beats automation.

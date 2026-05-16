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

## 2026-05-13 — B2C public trial: validate demand via waitlist before any Phase 1 build

**Decision:** Open `/` to a public landing page targeted at NDA aspirants (individuals without a teacher) with a free email-only waitlist. Capture `?src=<channel>` for attribution. Defer the actual paid product (payments, FA migration, content scaling, guest/demo class architecture) to Phase 1 — gated on the waitlist hitting 50 signups organically. Don't show pricing on the landing page; "early-access pricing at launch" is the only commitment. Org-only byline (LWS Pune), no personal name. Migration 030 created `waitlist_signups`. New `/teacher/waitlist` page surfaces the count + source breakdown.

**Context:** User's product fits NDA aspirants well (865 NDA-list vocab, retrofitted passages, deliberate-practice drill, comprehension scoring). NDA aspirants pay ₹15K-50K for full coaching, so ₹2000-5000/year for English-specific tooling has real pricing power. But the existing app is teacher-augmented — the school deployment assumes one teacher distributing class codes, mixing public trial users into Shreya's real classroom would contaminate stats and burn OpenAI cost on freeloaders. Two-week landing-page test costs ~2 hours of work; building payments + FA + content pipeline before validating demand is 6-8 weeks of speculative work. Phase 0 is the cheap experiment; Phase 1 is the real build.

**Watch:** (1) Waitlist signup count over the next 6 weeks. <10 = messaging is wrong (rewrite copy, retry). 10-30 = single-channel weak (try another platform). 50+ = demand validated, commit to Phase 1. (2) Source distribution — if `direct` dominates (no attribution), channels aren't the differentiator. If `reddit` outperforms `teachers`, peer-distribution thesis fails; if `teachers` wins, teacher-as-channel becomes the strategy. (3) Conversion-to-action: any waitlist signup who replies to a follow-up email is a higher-quality signal than the count itself.

**Revisit trigger:** 2026-06-24 (6 weeks). If <50 signups, the trial assumption is wrong — either the audience isn't reachable through the channels we have, or the value prop doesn't translate without a teacher in the loop. If >50, the next decision is pricing model (subscription vs lifetime, ₹2K vs ₹5K) and which Phase 1 component blocks first launch (probably FA migration since paying customers will refund-request on Whisper-inflated scores).

---

## 2026-05-12 — Stop gating on grade; keep the field as a label

**Decision:** Remove grade as an access gate everywhere. Migration 029 drops the `students read grade passages` RLS policy and replaces it with `read passages using (true)`. analyze-reading drops its 403 grade-mismatch check. StudentHome drops the `.or(grade_level.eq.X)` filter. BottomNav / VocabHome / VocabPractice / SessionReport drop the `VOCAB_GRADES = {'11','12','MBA'}` set so vocab is available to every student. TeacherDashboard's vocab-mastery stat drops the `['11','12','MBA']` student filter and becomes class-wide. Signup grade becomes optional ("Prefer not to say" → null). `profiles.grade` and `passages.grade_level` stay on the schema as labels; `WPM_TARGETS` still consults grade per-student (falls back to 150 when null).

**Context:** Grade was doing two jobs poorly conflated — content gating (vocab unlocks at 11 for NDA prep) and difficulty matching (passages tagged by grade). The second job is already done better by `passages.difficulty`. The 80% mastery gate is the real floor against false progress, so a grade-9 attempting an MBA passage gets ~50%, doesn't mark complete, and creates no data integrity problem. User considered an opt-in NDA flag as a vocab gate replacement and rejected (a) fully-open over (b) opt-in-flag; the strictest read of "stop gating" with the trade-off accepted that grade-9/10 vocab engagement may suffer.

**Watch:** (1) Vocab-mastery rate for sub-11 students over the next 30 days. If grade-9/10 students show seen-but-not-mastered stalls or abandon mid-deck after a card or two, the NDA-prep deck is wrong for them. (2) Class-avg accuracy on TeacherDashboard — if it drops noticeably, students are attempting passages way over their level (acceptable but worth knowing). (3) Teacher feedback — "why is X reading the MBA passage" moments. (4) Whether any sub-11 student returns to vocab on a second day vs bouncing.

**Revisit trigger:** if vocab-mastery delta on grade 9/10 (after 30 days, ≥5 such students with ≥3 deck sessions) is materially worse than grade 11+, revisit by introducing an opt-in `profiles.is_competitive_prep boolean` flag at signup that gates vocab content. Or earlier: ≥3 sub-11 students report the vocab feels "too hard" / "all weird words" in any channel.

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

## 2026-05-12 — Rolling-100 audio retention for research, with offline parent consent + in-app disclosure

**Decision:** Generalise the FA-spike audio retention mechanism (was time-bounded, opt-in via flag) into always-on rolling-100 retention for reading sessions. Teacher takes offline parent consent; intent is research, analysis, and app improvement only. Hard cap at 100 enforced in `claim_retention_slot()` RPC (FIFO eviction). Teacher-only access via new `/teacher/audio-review` page + `retained-audio-url` edge function. Persistent "🎙 Recordings may be kept for teacher review" indicator in the ReadingSession recording bar provides ongoing in-app transparency.

**Context:** User asked whether retaining latest 100 recordings had merit. Initial push-back was about consent + biometric-data-of-minors. User confirmed teacher will take offline consent (overall, not per-student). With consent path defined, the technical case becomes sound — debug scoring disputes, prepare FA-migration validation data, content QA from real audio, drill-noise diagnosis. Migration 028 reuses ~80% of the existing spike retention infrastructure (column, RPC pattern, edge function); cleaner than building parallel. Drill recordings excluded for v1 (very short, very frequent — different shape).

**Watch:** (1) Was the audio actually used for research / analysis / app improvement during the 90-day window? Use proxies: count of `retention_reviewed_status` non-null rows, references in DECISIONS.md or session logs to specific retained recordings. (2) Storage growth — should hover at ≤100 × ~50KB = ~5MB. Anything bigger means eviction isn't working. (3) Any complaints / questions from parents about retention. (4) `retention_reviewed_status` distribution — if all 'no_action' or all null, the surface isn't earning its keep.

**Revisit trigger:** 2026-08-10 (90 days). If usage signal is weak, either narrow the consent purpose ("for scoring dispute review only"), narrow the cap (50), or retire entirely. If usage is meaningful and FA spike revives, evaluate raising the cap to support broader migration validation. Per-student withdrawal-of-consent purge button is deferred but worth adding before scaling beyond one school.

## 2026-05-12 — Pin ReadingSession recording controls to a sticky bottom bar

**Decision:** Move the Start/Stop/Submit/Re-record controls out of the post-passage card and into a `fixed inset-x-0 bottom-0` bar that's always visible. Add a one-line subdued hint above the passage ("Read aloud — tap Start Recording below when you're ready") shown only when idle.

**Context:** User-observed UX bug — students miss the Start Recording button because it sits below the fold (passage card takes most of the viewport on mobile, especially for 200+ word passages). They orient to the passage, start reading silently, and don't realise they need to tap Start until the recording window has shifted out from under them. Considered: (1) move controls above passage — breaks top-down reading flow; (2) onboarding overlay — solves first session only, students forget across weeks; (3) dim passage until recording — fights legitimate silent-preview behaviour (which is good reading prep). Sticky bar is the standard mobile pattern (Uber confirm, Stripe checkout) and preserves silent preview.

**Watch:** First-15-seconds-of-passage accuracy across new sessions vs. the pre-fix baseline. If the bug was real, the `word_results[0..N]` should show fewer omissions in the first chunk. Also watch raw student feedback (drill misclassifications often surface from "I started reading before recording started" type complaints).

**Revisit trigger:** 4 weeks (2026-06-09). If sessions still show the pattern of "first paragraph systematically more wrong than later paragraphs," the fix didn't take and we revisit (maybe option 3 — dim passage until recording — becomes the right call). If accuracy normalises, decision sticks.

## 2026-05-12 — Retrofit 5 grade-12 passages with NDA-list overlap to validate the reading→vocab loop

**Decision:** Hand-retrofit 5 grade-12 passages (Trees, Discipline, Honesty, Mental Health Awareness, The Power of Empathy) with 6–9 NDA-list words each. Don't drop+regenerate the remaining 25 passages yet, despite a real argument for doing so eventually.

**Context:** Shreya (grade 12, 10 sessions, 38 vocab progress rows, 0 mastered) revealed two issues. (1) VocabHome UX hides legitimate progress — fixed in 5ac09a5. (2) The 30 grade-12 passages contain zero NDA-list words, so `record_vocab_reading_encounters` has been silent across the entire library, leaving the "reading reinforces vocab" loop in CLAUDE.md non-functional. User proposed dropping all 30 and regenerating; I pushed back because (a) it would cascade-delete the 90 existing sessions' passage refs and the 120 attached MCQs, (b) the underlying join hasn't been validated — we don't yet know the loop actually fires when content does overlap. Phased plan: ship 5 retrofits now, watch, then decide between bulk-retrofit-remaining-25 vs Path-B regenerate (deprecate-old + add-new).

**Watch:** After Shreya (or any other student) re-reads one of the 5 updated passages, check that `student_word_progress.last_encounter_source = 'reading'` row count for that student becomes > 0, the inline retention quiz fires on their SessionReport, and `VocabHome` shows the "X words encountered through your reading" line. If any of those three don't happen, the bug is upstream of the content fix and regeneration won't help.

**Revisit trigger:** 7 days from now (2026-05-19) regardless. If by then ≥1 student has triggered the loop on a retrofitted passage, decide bulk-retrofit-25 vs Path-B regenerate based on quality goals + time available. If no student has re-read any of the 5, surface this as a usage problem (the drill / vocab loop isn't being engaged with), not a content problem — different fix.

## 2026-05-12 — Reframe "self-evolving app" as iteration *culture*, not A/B engine

**Decision:** Don't build experimentation infrastructure (feature flags, cohort assignment, event pipelines). Establish a weekly observation cadence + decision log + "what we'll learn" tagging on roadmap items instead.

**Context:** 73 students + 90 lifetime sessions + 0 sessions today is not the right scale for A/B testing. Sample size makes lifts statistically indistinguishable from noise. Engineering cost outweighs payoff. Optimisation drift risks degrading the CLAUDE.md engagement guardrails (no variable rewards, no loss aversion). Experimentation on minors without parent/teacher consent is an ethical line.

**Watch:** whether the cadence is actually run. Whether DECISIONS.md grows. Whether roadmap items get "what we'll learn" tags written in earnest.

**Revisit trigger:** student count crosses 500 AND Phase 1 FA migration has shipped (so the underlying metric is honest) AND the team has bandwidth for the infra cost. Until all three are true, manual observation + deliberate iteration beats automation.

## 2026-05-16 — Trend-anomaly outlier chip as v1 anti-cheat tripwire

**Decision:** Add a UI-only heuristic chip ("Outlier — review") to `StudentDetail` session rows where the score is dramatically out of trend versus the student's other sessions. Rule lives in `src/lib/anomalyFlag.js` (`accuracy >= 95 AND >= 2 other sessions AND accuracy >= mean(others) + 20`). No server-side enforcement; teacher reviews and decides. Defer harder anti-cheat layers (voice-fingerprint comparison, liveness via per-attempt random word insertion) until cheating frequency justifies the build cost.

**Context:** First confirmed AI-assistant cheating case (Gurusai, 2026-05-16) — free-form wav2vec2 transcription caught ChatGPT-voice-mode interjections in his Inclusive Growth audio. Investigation also surfaced a second suspected pure-TTS read on Env Prot (suspiciously clean transcript, both engines fooled). Both Whisper and FA are structurally blind to clean TTS reads — they only see the passage words present in the audio. The accuracy-out-of-trend signal is the cheapest universally-available trip, calibrated against Gurusai (Env Prot 100% vs ~64% mean across his other reads → gap 36 → flagged). User confirmed Gurusai independently; he accepted.

**Watch:** (1) False-positive rate. If the teacher dismisses the chip on 30%+ of flagged sessions as "genuine improvement," the threshold is too sensitive — tighten to gap ≥ 25 or require ≥ 3 other sessions. (2) Confirmed cheat count over the next 30 days. If multiple chips correspond to verified cheats, v1 surface is earning its keep. (3) Cheating frequency — if ≥5 confirmed cases in 30 days, anti-cheat moves from defer-list to active build (liveness or voice fingerprint).

**Revisit trigger:** 30 days (2026-06-15) for the calibration check, OR ≥5 confirmed cheats whichever first.

## 2026-05-16 — Pass passage as Whisper `prompt` to bias decoder toward expected vocabulary

**Decision:** `analyze-reading` v19 passes the first 800 chars (~200 tokens) of `passageText` as Whisper's `prompt` parameter. Biases the decoder toward expected vocabulary; expected to close ~60–70% of the Whisper-vs-FA gap on IE-accented real readers at zero cost (Whisper is billed on audio duration, not prompt size). Trade-off: weakens substitution-count as a cheating signal (TTS-read passages transcribe cleaner), but the outlier chip above catches the accuracy-shape signature regardless.

**Context:** Round 2B FA spike (n=21, 2026-05-16) revealed Whisper genuinely over-substitutes IE-accent real readers — Pratibha −10.8, Harshad −8.8, Shankar −6 mean gap to FA. Free-form wav2vec2 transcripts confirmed these students really read the passages; Whisper was just picking phonetically similar wrong words. Prompt biasing is a single-line change that addresses the bulk of the gap. The structural FA migration remains the correct long-term end-state but no longer urgent — Whisper now scores honestly enough that the mastery gate isn't dishonest in practice. Supersedes the urgency framing of the 2026-05-12 "Park Phase 1 FA migration" entry (the parked decision still holds; the urgency to revive it is reduced).

**Watch:** (1) Per-voice avg accuracy on Pratibha/Harshad/Shankar over the next 5–7 days. Expected to shift up 5–10 points if the prompt is working. If no movement, the prompt isn't biasing as expected and FA case re-strengthens. (2) New substitution distribution — if subs drop sharply across the board AND the outlier chip starts firing on clean readers (false positives), the bias is too strong. (3) Class avg accuracy delta — should rise modestly; if it jumps >5pts class-wide, the inflation is real, not just per-voice fairness.

**Revisit trigger:** 7 days (2026-05-23) for the per-voice check. If no per-voice movement, document the surprise and re-prioritise FA migration. If movement is large enough that genuine-improvement chips fire too often, narrow the prompt (first 400 chars instead of 800, or content-only filtering).

## 2026-05-16 — send-reminders v9 templates: personalised subjects + plain-text alternative

**Decision:** Rewrite the activation/re-engagement email templates with personalised subject lines leading on the hook (`Try your first passage, {name} — 2 minutes` / `{lastAccuracy}% last time, {name} — push it higher?`), plain-text alternative alongside HTML (single biggest deliverability win per Resend), reply-to-help footer for legitimacy signal. Adds a `test_mode` body path so future template changes can be verified without waiting for the next 04:30 UTC cron.

**Context:** 72 of 76 students have received at least one reminder; **57 (79%) have never done a session post-reminder**. Cron + function were firing correctly (200 in ~62s for 64 emails); the conversion was poor. Three suspected root causes ranked: spam-folder placement (Resend domain young, no DMARC alignment), generic copy (every SaaS-tool email looks the same), broken activation links. The template rewrite addresses the second cause directly and the first cause indirectly (plain-text alt is the biggest deliverability signal).

**Watch:** (1) Conversion rate — `reminded AND session within 7d of last reminder` over the next 2 weeks. Baseline 7/72 = 10%. Expect at least 15–20% if templates were the bottleneck. (2) Resend dashboard — open + click rates on the new batch. If opens jump but clicks don't, the copy is hooking but the CTA is wrong. If neither moves, deliverability is the real blocker. (3) Any student replies — the reply-to-help footer should produce occasional replies; zero replies in 30 days = emails aren't landing.

**Revisit trigger:** 14 days (2026-05-30). If conversion is still <12%, the copy isn't the bottleneck — investigate deliverability (Resend dashboard, spam-test tools, DMARC). If conversion ≥18%, lock in the template and look for the next bottleneck.

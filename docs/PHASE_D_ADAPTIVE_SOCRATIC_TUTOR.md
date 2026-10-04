# TUKLAS AI — PHASE D: ADAPTIVE SOCRATIC TUTOR

**CURRENT PHASE:** D — Adaptive Socratic Tutor
**MASTER PLAN:** A–N
**COMPLETED:** A (Phase 14), B (Real Baseline), C (Real AI Provider Verification: live AI NOT VERIFIED)
**CURRENT:** D
**NEXT:** E — Lesson-grounded AI
**REMAINING:** E through N
**Started on the owner's instruction "proceed", which was the explicit decision to build Phase D on the fallback while live AI remains NOT VERIFIED.**

> ## RESULT IN ONE LINE
> The tutor now keeps a structured, safe educational state per conversation and chooses a teaching action and strategy from it,
> so the same wrong answer twice, "I still don't understand" and "I get it now" each change what it does. This is proven for the
> **app logic and the rule-based fallback**, and for **what a model is told**. Whether a **real model** teaches better because of it
> is **NOT VERIFIED** (no key).

## 1. What was built

| Piece | File |
|---|---|
| Teaching policy: a pure, deterministic `decideTeaching(state, signals) -> { plan, nextState }` | `src/server/tutor/policy.ts` |
| Stored tutor state (zod-validated, never trusted): turn, last 5 proposed answers (normalized numbers only), same-answer count, confusion count, understanding, last 6 strategies, last action | `ChatConversation.state` (migration `20261005090000_tutor_policy_state`) |
| Per-reply audit: the action and strategy chosen | `ChatMessage.action`, `ChatMessage.strategy`, and `AIInteraction.metadata` |
| New student intent `UNDERSTOOD` (English and Taglish; checked after the "don't understand" patterns) | `intent.ts` |
| A student who says they understand spends no hint | `ladder.ts` |
| The plan reaches the model: action, strategy to use, strategies already used, "same answer N times in a row", "confused N times", "student understands: ask them to apply it" | `prompt.ts` |
| The fallback follows the plan: a different strategy is a different reply (nudge, guiding question, rule, number line, different example with a fresh example each time, worked example, step-by-step, prerequisite review, check/forward, practice) | `fallback.ts` |
| A model reply almost identical to the previous reply (word overlap ≥ 0.85) is not shown; the planned strategy replaces it (`GUARD_REPEATED`) | `tutor.service.ts` |
| A "Next step" line under a reply when the policy recommends something to DO | `tutor-panel.tsx`, `nextStepFor` |

### The transitions (all asserted on stored state and stored action/strategy, not only on text)

| Student does | Policy | Reply |
|---|---|---|
| T1 proposes a wrong answer | `GIVE_HINT` / nudge | gentle hint, no verdict |
| T2 the **same** wrong answer again | `REVIEW_MISTAKE` / step by step | "You have suggested X 2 times, so let's try another way…" and asks for the first step of their working |
| T2 again (3rd time) | `CHANGE_EXPLANATION` / a strategy not yet used | number line, different example or worked example |
| 4th time | `REVIEW_PREREQUISITE` | goes back to the earlier idea (number-free, so it cannot state a result) |
| "I still don't understand" | `CHANGE_EXPLANATION`, ladder up | a strategy not used before in this conversation |
| 2nd confusion | `REVIEW_PREREQUISITE` | "Let's go back one step…" + next step "review the idea behind this first" |
| 3rd confusion | `RECOMMEND_PRACTICE` | recommends targeted practice on the skill + next step |
| "I get it now" | `ASK_STUDENT_TO_TRY` (open question) / `CHECK_UNDERSTANDING` / `INCREASE_DIFFICULTY` (proficient) | no more scaffolding, ladder does not climb, "choose your answer and submit it" |
| asks for hints over and over | rotates strategies | never the same strategy twice in a row (30-turn test), no two identical replies in 10 requests |

Unchanged on purpose: the hint ladder, answer withholding, the output guard, no verdict on a proposed answer.

## 2. Verification

| Check | Result |
|---|---|
| Unit | **863 / 863 PASS** (45 files; was 820) |
| New policy tests (pure) | 38 tests (including intent examples): escalation order, resets, stale-repeat bug, bounded memory, determinism, immutability, garbage state rejected |
| Four-turn conversations through the real route and DB | PASS: with no AI (fallback) and with a stubbed provider (what the model is told) |
| Browser | **90 / 90 PASS** in one clean run (desktop + Pixel 5 emulation; 6 new tutor tests: same answer twice, "I get it", escalation) |
| TypeScript, lint, production build | PASS |
| Schema | one additive migration; `prisma migrate diff` against a fresh shadow DB: no difference |

The Phase B / C tests that **pinned the defects** (identical reply to the same answer, "understood" not recognised, model never told
about a repeat) were rewritten into the required behaviour. They failed first, which is how the change was confirmed to matter.

## 3. Classification after Phase D

| Capability | Status | Evidence / notes |
|---|---|---|
| Structured tutor state (safe, validated, per conversation) | **REAL** | `policy.ts`, `tutor-adaptation.test.ts` "stores only safe educational state" |
| Detects the same answer repeated | **REAL** (numeric proposals only) | policy + route tests. A repeated non-numeric wrong idea is not detected |
| Detects understanding | **REAL, regex-based** | English/Taglish phrases only; a student who shows understanding in other words is missed (`OTHER`) |
| Detects confusion and escalates | **REAL** | 3 levels, counts reset on understanding |
| Chooses a different strategy | **REAL in the fallback; REAL in the instruction to the model** | rotation and "already used" list tested |
| Real model acts on the plan and teaches well | **NOT VERIFIED** | no key; `npm run test:live` ready (step 7 now records "model was told about the repeat") |
| Avoids repeating itself | **REAL** | fallback never repeats consecutively; a repeating model reply is replaced |
| Prerequisite review | **PARTIAL** | a generic, number-free review per operation (integers) and a generic prompt for other lessons; there is no prerequisite map between skills |
| Targeted practice | **PARTIAL** | the tutor RECOMMENDS practice and names the skill; it does not generate questions (that is the later mastery-loop phase) |
| Mastery-aware | **PARTIAL** | a proficient student who understands is pushed to harder practice; the repeated-mistake flag shapes the recommendation. Mastery does not change strategy otherwise |
| Strategy text outside integers | **PARTIAL** | the five Term 1 lessons get generic strategy text without AI; with AI the model gets the same plan |
| Student-facing next step | **REAL** | "Next step: …" line, browser-tested |
| Hidden reasoning exposed | **No** | only counts and strategy names are stored or shown |

## 4. Known limitations
1. Detection is rule-based: numeric repeats and listed phrases. A student who repeats the same *method* with different numbers is not seen as repeating.
2. State lives per conversation (per question or per lesson chat); a new question starts clean. Cross-question learning of this student comes only from the existing mastery flags.
3. The strategy vocabulary was written for integer operations; generic fallbacks elsewhere are plainer.
4. "Prerequisite" is generic. No skill prerequisite graph exists.
5. A model that is told the plan can still ignore it; only an exact-ish repeat is caught (similarity ≥ 0.85).
6. Everything about real model behaviour remains NOT VERIFIED.

## 5. Still open from Phase C (not done here)
Token usage and model id per call are still not stored; no retry on a transient provider failure; history is still flattened into one user message.

## 6. REAL-WORLD VALIDATION

| | |
|---|---|
| Live AI | **NOT VERIFIED** |
| Real device | NOT VERIFIED |
| Real teacher | NOT VERIFIED |
| Real student | NOT VERIFIED |

## 7. NEXT PHASE
**E — Lesson-grounded AI** (retrieval of the right lesson parts, examples, objectives, practice questions and teacher material per
request, with a size budget), unless you prefer to run `RUN_LIVE_AI=true npm run test:live` first so the plan can be checked against a
real model before building more on it.

## FINAL DECISION
**PHASE D COMPLETE for the app logic and fallback; model-side effect NOT VERIFIED.**

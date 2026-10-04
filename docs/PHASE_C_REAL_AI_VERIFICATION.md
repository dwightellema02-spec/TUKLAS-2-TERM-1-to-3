# TUKLAS AI — PHASE C: REAL AI PROVIDER VERIFICATION

**CURRENT PHASE:** C — Real AI Provider Verification
**MASTER PLAN:** A–N
**COMPLETED:** A — Phase 14; B — Real Baseline (`404469c`)
**CURRENT:** C
**NEXT:** D — Adaptive Socratic Tutor
**REMAINING:** D through N

> ## RESULT IN ONE LINE
> **LIVE AI = NOT VERIFIED.** No provider key exists in this environment, so no real model has been contacted. Nothing below
> claims otherwise. What WAS verified is exactly what the application would send a model, how it fails safely, and that a
> ready-to-run live harness exists.

## 1. Safe environment check (values never printed)

| Variable | State |
|---|---|
| `ANTHROPIC_API_KEY` | **ABSENT** (missing or blank) |
| `GEMINI_API_KEY` | **ABSENT** |
| `GEMINI_MODEL` | ABSENT |
| `ANTHROPIC_MODEL` | PRESENT |
| `ANTHROPIC_BASE_URL` | ABSENT (the default `https://api.anthropic.com` is used) |
| `AI_PROVIDER` | PRESENT (`anthropic`) |

Per the phase rules, live model testing (steps 3-7 against a real model) **stopped here**. No live call was simulated.

## 2. Architecture map (read from source; no code changed to produce it)

```
POST /api/ai/tutor  (src/app/api/ai/tutor/route.ts)
  auth: STUDENT only · zod: message<=1000 chars · rate limit 30/min per user, in memory (route.ts:34, ai.ts:11)
   └─ TutorService.help (src/services/tutor.service.ts)
       1. scope: conversation, practice question, lesson (published only), all checked against the student id
       2. classifyIntent (regex, English/Taglish)            src/server/tutor/intent.ts
       3. decideRung (server-side hint ladder, stored int)   src/server/tutor/ladder.ts
       4. evidence: mistake diagnosis (INTEGER ONLY, only after submit), skill levels + 2 flags, last 8 messages,
          up to 3 teacher-material chunks (answer-stating chunks dropped while the question is open)
       5. buildTutorPrompt -> { system, user }               src/server/tutor/prompt.ts
       6. requestAiText (src/server/ai.ts): provider from AI_PROVIDER, 20 s abort, max_tokens 450, NO retry
            ├─ anthropic.ts: POST {ANTHROPIC_BASE_URL|api.anthropic.com}/v1/messages, header x-api-key,
            │    model = ANTHROPIC_MODEL || claude-haiku-4-5-20251001 (code default)
            └─ gemini.ts: POST generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent
                 (no default model on purpose; configured only with key AND model)
       7. checkTutorReply (guard.ts): answer leak, verdict on a proposed answer, "I watched/read", instruction echo
       8. on any failure or guard rejection -> automaticHint (fallback.ts), labelled "Automatic hint (not AI)"
       9. save ChatMessage (source AI|AUTOMATIC, rung, intent), ChatConversation.hintLevel, AIInteraction (success, latency, metadata)
```

What the model actually receives (full sample in `docs/evidence/phase-c/request-audit.md`):
- **system**: role and rules, the hint-level instruction, then `BEGIN LESSON` (title, objectives, up to N sections, vocabulary),
  optional `BEGIN TEACHER MATERIAL`, optional `BEGIN QUESTION` (question, options, the student's attempt, a system diagnosis; the
  answer only after submit), skill levels.
- **user**: `Conversation so far:` (last 8 messages as text lines) + `<student_message>…</student_message>`.
- **Architecture fact:** history is flattened into **one** user message. There is no multi-turn `messages` array; tutor replies
  travel as text (`Tuklas: …`) inside the user turn.

## 3. What was run in this phase

| Run | Result |
|---|---|
| `tests/ai/tutor-request-audit.test.ts` (13 tests) | PASS. Recording stub; real request construction from the real DB |
| Existing provider, tutor API, guard, fallback, adaptation tests | PASS |
| `tests/ai/live/tutor.live.test.ts` + `npm run test:live` | **Written, NOT run live.** Skips itself without `RUN_LIVE_AI=true` and a key (6 skipped) |
| Harness self-check against the local fake server | PASS (6/6) and stamped `verifiedLive: false`, written to `docs/evidence/phase-c/selfcheck-NOT-LIVE.json`. **This is not live evidence** |
| Normal suite cannot reach a real model | `vitest.config.ts` now blanks `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `ANTHROPIC_BASE_URL` for `npm test`, and excludes `tests/ai/live` |

## 4. Classification

| # | Capability | Status | Evidence | File / Test | Notes |
|---|---|---|---|---|---|
| 1 | Real provider connection | **NOT VERIFIED** | No key. Request shape matches the documented API in unit tests only | `anthropic.ts:23-37`, `gemini.ts:24-39`, `tests/ai-providers.test.ts` | The first real call has never happened. Model id `claude-haiku-4-5-20251001` is a code default nobody has exercised |
| 2 | Real model response | **NOT VERIFIED** | none | `tests/ai/live/tutor.live.test.ts` (ready) | Run `RUN_LIVE_AI=true npm run test:live` with a key |
| 3 | Lesson grounding | **REAL (request) / NOT VERIFIED (reply)** | Every request contains lesson title, content block, vocabulary, constraints; objectives + the lesson's own rule for a Term 1 lesson | `tutor-request-audit.test.ts` "sends the lesson…", "includes the learning objectives" | Whether a real reply stays faithful to the lesson is unknown. Teacher notes and captions reach the prompt too (`full-loop.spec.ts` step 5) |
| 4 | Conversation history | **REAL (request) / PARTIAL (design)** | Turn n carries all earlier student messages and tutor replies, in order; not reset | same test; live harness step 5 asserts the counts 0,2,4,6 | Capped at 8 messages; flattened into one user message (see section 2). Effect on a real model: NOT VERIFIED |
| 5 | Student context | **PARTIAL** | Skill levels (+2 flags) and, on a practice question, the student's attempt | `prompt.ts:174-200` | No recent-answers list, no per-skill history, nothing in a general lesson chat except skill levels |
| 6 | Mistake context | **PARTIAL** | Diagnosis exists only for integer questions and only after the answer is submitted | `tutor.service.ts:157-160`, `mistake-classifier.ts` | For the five Term 1 lessons there is no diagnosis |
| 7 | Socratic behaviour | **App-side REAL; model-side NOT VERIFIED** | The app forces a hint level, withholds the key, and replaces any reply that states the answer or gives a verdict (`tutor-api`, `tutor-guard` tests; the live harness asserts no leak and records the reply) | `ladder.ts`, `guard.ts` | Whether a real model asks good guiding questions: unknown. Heuristic verdict plus the recorded text is for a person to read |
| 8 | Repeated-response adaptation | **NOT ADAPTIVE (confirmed) = PARTIAL / NOT YET IMPLEMENTED** | Fallback: identical reply to the same wrong answer (`tutor-adaptation.test.ts`). Request side: the model is never told "same answer as before" or which strategy was used (`tutor-request-audit.test.ts` "known gap") | `tutor.service.ts`, `ladder.ts:94-97` | Caused by insufficient state: one integer per conversation. **Recorded for Phase D; no prompt trick was added** |
| 9 | Fallback | **REAL** | No key, 429, 503, empty reply, non-JSON reply, aborted call: the student gets an "Automatic hint (not AI)", HTTP 200, saved as `AUTOMATIC` with a reason | `tutor-request-audit.test.ts` error-path tests; `tutor-api.test.ts` | Deterministic and rule-based; integer-only quality |
| 10 | Error handling | **REAL, with one gap** | Provider failures map to 429/502/503/504 reasons; the browser never receives the key, headers, DB strings, stack text or the upstream body (asserted) | `ai.ts:53-105`, same tests | **No retry**: one transient failure becomes a fallback (test pins it). The 20 s timer is unit-tested at provider level |
| 11 | Security | **PARTIAL** | Key only goes to the operator-set host and is never echoed (`ai-providers.test.ts`); injection-sanitised material and student text; guard blocks "I watched…" and instruction echo | `anthropic.ts:6`, `prompt.ts`, `guard.ts` | `ANTHROPIC_BASE_URL` redirects the key if the environment is compromised (operator-controlled by design). Student messages from minors go to a third-party model: **no privacy/data-processing review exists (NOT VERIFIED)**. `analyze-mistake` (unwired) remains a client-trusting proxy (baseline H) |
| 12 | Rate limiting | **PARTIAL** | 30 requests/min/user on the tutor, in process memory; provider 429 falls back | `route.ts:34`, `ai.ts:9-28` | Not shared across serverless instances and reset on restart; no per-day or per-class budget |
| 13 | Persistence | **REAL, with gaps** | Conversations, messages (source, rung, intent) and an AI audit row per call | `tutor.service.ts:255-291`, schema | **Token usage is never stored** (`promptTokens`/`outputTokens` stay null) so cost cannot be measured; the audit `model` column stores the provider name (`anthropic`), not the model id, so you cannot tell which model wrote a reply |
| 14 | Production configuration | **NOT VERIFIED** | Local env facts only (section 1) | `.env.example`, `vercel.json` | Production env vars unknown; the 20 s call plus database time against the hosting function limit is unmeasured; Gemini has no model configured |

## 5. Owner's steps 3-9, one by one

| Step | Done? | Outcome |
|---|---|---|
| 3 Live smoke test | **NO: no key** | NOT VERIFIED. Harness ready: `docs/LIVE_AI_RUNBOOK.md` |
| 4 Grounding | Request side yes; reply no | GROUNDING = **PASS (request) / NOT VERIFIED (reply)** |
| 5 Continuity (the 4-turn script) | Request side yes; model no | Context grows every turn (REAL); behaviour of a model on it NOT VERIFIED |
| 6 Socratic | App enforcement yes; model no | **SOCRATIC BEHAVIOUR = NOT VERIFIED** (app guards REAL) |
| 7 Repeated response | Fallback and request side yes; model no | **NOT ADAPTIVE** on the app side (nothing tells the model the answer repeated); live comparison NOT VERIFIED |
| 8 Fallback | Yes | REAL, clearly labelled, safe guidance |
| 9 Error handling | Yes (429, 503, invalid, non-JSON, abort) | REAL; no secrets or stack traces to the browser; no retry |

## 6. Findings for Phase D (recorded, not fixed here, per owner rule)
1. Tutor state is one integer; add attempt tracking, last attempt, strategy used, misconception, understanding detection.
2. History as a real multi-turn `messages` array (or at least labelled turns) is an open design choice.
3. Tell the model what was already tried (strategy history), not just "the student is confused".
4. Store the model id and token usage per call; consider one bounded retry for transient 5xx.
5. Fallback and mistake classifier are integer-only.

## 7. TEST RESULTS

| | |
|---|---|
| **Unit** | 820 / 820 PASS (44 files; was 807) |
| **Browser** | tutor + documents + full-loop specs: PASS (full-loop 14/14 on desktop and phone after a cold-compile timeout in my own test was fixed; tutor and documents 28/28). The complete 84-test suite was last run at `404469c`; app code is unchanged since |
| **TypeScript** | PASS |
| **Lint** | PASS |
| **Build** | PASS |
| **Live AI** | **NOT VERIFIED (no key)** |

## 8. REAL-WORLD VALIDATION

| | |
|---|---|
| **Live AI** | NOT VERIFIED |
| **Real device** | NOT VERIFIED |
| **Real teacher** | NOT VERIFIED |
| **Real student** | NOT VERIFIED |

## 9. KNOWN LIMITATIONS
The audit proves the request, the guards and the failure paths, not model behaviour. Cost, latency, rate limits and safety of a real
model on Grade 7 content are all unmeasured. The self-check evidence file is not live evidence.

## FINAL DECISION

**BLOCKED_FOR_PHASE_D**

Reason: the real provider has not been verified (no key), and you have not yet told me to proceed with Phase D using the fallback
while live AI stays NOT VERIFIED. Two ways to unblock:

1. **Preferred:** put an Anthropic key (or Gemini key + model) in `.env.local`, run `RUN_LIVE_AI=true npm run test:live`, and send me
   `docs/evidence/phase-c/live-run-*.json`; I will classify it. About 12 calls.
2. **Or:** tell me explicitly to proceed with Phase D while live AI remains NOT VERIFIED. Phase D's state machine can be built and
   tested without a model; it just cannot be called proven to teach well until step 1 is done.

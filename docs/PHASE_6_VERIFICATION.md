# TUKLAS AI — PHASE 6 VERIFICATION REPORT

**PHASE:** V2 Phase 6 — Integrity & Security Fixes
**OBJECTIVE:** Fix the defects found by the tuklas-v2 readiness audit that make grading, access control
and deployment untrustworthy (master plan §11, §14, §23, §24, §46, Gap C).
**BASE:** tuklas-v2 phase5 snapshot (Sep 30), imported as commit `9bd05ba` with all `.env` files removed.

## IMPLEMENTED

1. Migration `20261003000000_sync_schema_drift`: adds the 11 columns the schema had but no migration created.
2. Tests run on a dedicated `_test` database: migrate → truncate → seed on every run; refuses non-`_test` DBs.
   Prisma/seed honour an explicit `DB_TARGET=test` switch.
3. Teacher registration: no default invite code, no test-environment bypass; blank code disables it.
4. `POST /api/ai/generate-question` no longer returns `correctIndex` / `explanation` before the student answers.
5. `src/server/question-validator.ts`: AI questions are verified deterministically (distinct options, valid
   index, no duplicates, no answer giveaway, arithmetic recomputed with a safe parser — no `eval`) before storage.
6. Lesson completion is decided by the server: new `LessonCheckAttempt` model, `check-grader.ts`, student
   endpoint `POST /api/lessons/[id]/checks/[checkId]/answer`, completion requires a correct attempt on every check.
7. Login protection: client IP from the trusted-proxy position of `X-Forwarded-For` (`TRUSTED_PROXY_HOPS`),
   per-address and per-account limits, DB-backed account lockout (5 failures → 15 min).
8. AI provider interface (`src/server/ai-providers/`): Anthropic and Gemini selectable by `AI_PROVIDER`.

## VERIFICATION

| Feature | Status | Evidence |
|---|---|---|
| Migrations build a fresh DB | PASS | `migrate deploy` on an empty DB applies all 8 migrations; schema-vs-migrations diff = 0 |
| Test isolation | PASS (partial) | Dedicated DB, reset every run. Tests still share one deterministic seed; not yet per-test fixtures |
| Teacher invite code | PASS | 6 tests incl. old default code rejected, unset = disabled |
| Answer key hidden before answering | PASS | Route tests + real HTTP check (`leaksKey:false`) |
| AI question validation | PASS | 40 tests (33 unit incl. wrong key, duplicates, leaks, arithmetic traps; 7 route-level) |
| Server-decided completion | PASS | 23 tests; real HTTP: forged COMPLETED → 409, wrong answer ignored `isCorrect:true`, completion after both correct |
| Login throttling / lockout | PASS | 12 tests; mutation-checked: 5 fail against the old header logic |
| AI providers (mocked HTTP) | PASS | 24 tests: request shape, parsing, 429/5xx/timeout/empty/blocked mapping, selection, no key leakage |
| Live Anthropic call | NOT VERIFIED | no API key available |
| Live Gemini call | NOT VERIFIED | no API key / verified model name available |

**AUTOMATED TESTS:** 201 / 201 PASS (21 files; baseline was 96)
**TYPECHECK:** PASS  **LINT:** PASS  **BUILD:** PASS (`next build`, 32 pages)
**DATABASE:** PASS (fresh migrate, no drift)
**SECURITY:** PASS for the items fixed in this phase (see remaining risks)
**REAL BROWSER:** NOT COMPLETED (HTTP smoke against `next dev` only; no browser session)
**REAL DEVICE:** NOT COMPLETED
**REAL USER:** NOT COMPLETED

## KNOWN LIMITATIONS

1. One intermittent failure (`lessons-api` "creates a lesson") was seen once in ~12 full runs and not reproduced;
   the test helper's shared unit position was hardened but the root cause is unproven.
2. Tests depend on a shared deterministic seed (not per-test fixtures).
3. Lessons with no knowledge checks can be completed by the student (nothing to verify). Check retries are unlimited,
   so a determined student can guess multiple-choice checks; checks are formative, not mastery evidence.
4. The in-memory limiter is per server instance (serverless instances do not share it); the account lockout is DB-backed.
5. Account lockout can be abused to lock a known email for 15 minutes.
6. Only the Phase 6 UI change is the lesson page "Check answer" button; practice/tutor/mistake screens still do not exist.

## DEFECTS FOUND (during the phase)

1. `prisma.config.ts` overrode `DATABASE_URL` from `.env.local`, so a first attempt to migrate the test DB silently
   hit the dev DB (caught and fixed with `DB_TARGET=test`).
2. The invite-code check was skipped when `NODE_ENV==='test'`, so it had never been tested (fixed).
3. A trailing period in an arithmetic question silently disabled verification (fixed, test added).
4. Letter `x` was briefly treated as multiplication in the validator, mis-evaluating algebra (fixed, test added).

## REMAINING RISKS

1. `POST /api/ai/analyze-mistake` still trusts a client-sent `correctIndex`.
2. Login timing still differs for unknown emails (user enumeration by timing).
3. The Neon DB credentials and Vercel token that were inside the original zip must be rotated by the owner.
4. Gemini model name and live behaviour of both providers are unverified.

## FINAL DECISION

**READY_FOR_NEXT_PHASE** (Phase 7: student journey UI), with the limitations above carried forward.

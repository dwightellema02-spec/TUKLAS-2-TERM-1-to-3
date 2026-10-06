# Tuklas AI Pre-Deployment Risk Report

Date: 2026-10-06. Commit inspected: `38743ba` on `main` (working tree clean before and after; test-run side effects were reverted).
Nothing was deployed. No production infrastructure was touched. No secret values appear in this report.
Method: the code in this workspace is the source of truth; earlier reports were not trusted.

## 1. Overall Status

🔴 **DO NOT DEPLOY YET**

**Update (same day): code blocker B1 is FIXED** (see section 7). What keeps this red is the owner-side gates that cannot be checked from this workspace: production environment variables, credential rotation, and a real AI run. Once G1 and G2 are confirmed, this becomes 🟡 (controlled preview deployment).

Original reason: one small, real code blocker (an AI endpoint any signed-in student could use as a general AI proxy) plus those owner-side gates.

## 2. Project Configuration

| | |
|---|---|
| Framework | Next.js 16.3.6 (App Router, Turbopack), React, TypeScript |
| Frontend / API | Same Next.js app. 68 route files under `src/app/api`. `src/proxy.ts` (the Next.js 16 replacement for middleware) refuses cross-site writes. |
| Database / ORM | PostgreSQL via Prisma 6.12.0, 16 migrations, schema validates. Local dev and test databases are on localhost. |
| Authentication | Own implementation: PBKDF2 passwords, signed cookie, DB-backed revocable session row, `isActive` checked on every request, DB-backed lockout (5 failures, 15 min). Roles STUDENT / TEACHER / ADMIN. |
| AI provider | Anthropic (default) or Gemini via `AI_PROVIDER`. Server-side only. No key is configured here. |
| Deployment target | Vercel (`vercel.json`: `npx prisma generate && npm run build`). Database intended: Neon. |
| Git | `main` = `master` = `d0aef06`, plus the docs commit `38743ba`. `.vercel` is not present, so this folder is not linked to a Vercel project. |

## 3. Test Results

| Check | Result |
|---|---|
| TypeScript (`npm run typecheck`) | **PASS** |
| Lint (`npm run lint`) | **PASS** (0 warnings) |
| Unit and integration tests (`npm test`, 53 files, real PostgreSQL test DB) | **PASS: 937 / 937** after the B1 fix (936 before, plus 1 new test). One unrelated test (`curriculum-api`) failed once in a full run, then passed alone and on the next full run: treated as a flake, cause not investigated. |
| Prisma schema (`npm run db:validate`) | **PASS** |
| Production build (`npm run build`) | **PASS** (no warnings in the log; run twice) |
| Browser tests against the **production build** (`next start`), desktop + Pixel 5 | **PASS: 112 / 112** |
| Browser tests against `next dev` (the project's default config), run twice | **FAIL / unstable.** Run 1: 18 pass, 16 fail, 78 not run. Run 2: 52 pass, 13 fail, 47 not run. Different tests failed each time. See minor risk M1. |
| Dependency audit (`npm audit --omit=dev`) | **4 vulnerabilities (1 high, 3 moderate).** See M2. |
| Security tests | **PASS** (inside the unit suite: hardening, login protection, cross-site writes, teacher isolation, document and tutor access, privacy controls) |
| Real AI | **NOT VERIFIED** |

Notes on honesty: the browser tests use a local fake AI server, so every AI reply in them is SIMULATED. The production-mode run is local `next start`, not Vercel.

## 4. Minor Risk Warning

**WARNING SOURCE NOT FOUND IN LOCAL CODEBASE.**

I searched the repository, `vercel.json`, `next.config.mjs`, `package.json`, and the output of typecheck, lint, tests, the production build (twice) and Prisma validate. None contains a "minor risk" message, and there are no build warnings. The text must come from the Vercel (or another external) interface. I will not guess what it says. Please paste the exact wording and I will map it to a finding.

Local findings that could plausibly be related (not claimed to be the warning): M2 (npm audit), M3 (in-memory rate limits), M11 (CSP).

## 5. 🟢 Safe Findings

- **No secrets in git.** `.env*` is ignored except `.env.example` (placeholders only). I scanned all history for Neon hosts, `npg_`, `sk-ant-`, `AIza` and Vercel token patterns: the only hits are documentation text and a fake test string (`sk-ant-SECRET-VALUE-123`). No `.env` file was ever committed.
- **No in-memory database fallback.** `src/server/db.ts` is a plain PrismaClient on `DATABASE_URL`. A missing or unreachable database produces errors, never a silent switch. The in-memory `Map`s in the code are rate-limit counters and an unknown-email lock only.
- **Demo seed cannot run in production.** `prisma/seed.ts:17-21` requires `ALLOW_DEMO_SEED=true` and throws when `NODE_ENV=production`. The content loader is dry-run by default. `prisma.config.ts` only allows `migrate deploy` against a production URL and refuses localhost.
- **Every API route is authenticated except the intended public ones** (login, logout, register, health). Verified by a scan of all 68 route files.
- **Sessions are DB-backed and revocable**, check `isActive` and expiry on every request (`src/server/auth.ts:178-219`). Cookie is HttpOnly, SameSite=Lax, Secure in production.
- **Role and ownership checks held up** in the routes I read (mistakes, progress, practice sessions, class insights, documents, tutor conversations). The existing tests also cover other-teacher and other-student access with 403/404 results. I did not run a separate live ID-tampering probe beyond that suite.
- **Answer protection.** Students never receive answer keys before answering (lesson checks, practice, assessments). `analyze-mistake` is server-authoritative: it takes only a question ID the student owns and has answered wrongly.
- **Tutor prompt handling.** Student text, teacher notes and teacher documents are all marked as data, not instructions (`src/server/tutor/prompt.ts:138-212`). Rule-based guards block early answer leaks. This is by code reading and unit tests, not by a real model.
- **Health endpoint** returns only `{service, status}`. It leaks nothing.
- **Login does not reveal whether an email exists** (decoy hash, unknown emails also lock).
- **Cross-site write protection** at the front door; security headers set (nosniff, frame options, referrer policy, permissions policy).
- **Serverless fit:** no filesystem writes, no cron or background jobs, no WebSockets. Uploads are processed in memory (5 MB limit) and stored in the database.

## 6. 🟡 Minor Risks

**M1. `next dev` returns an HTML 404 for valid API routes, and the browser suite is unstable on it.**
- Evidence: in the failing runs the browser received `<!DOCTYPE ...` instead of JSON for POSTs to `/api/auth/register`, `/api/auth/login` and the lesson-check answer route; the register calls returned 404. The same specs pass when re-run alone, and all 112 pass against the production build. I also saw the same 404 on `/api/auth/*` when I first started a dev server by hand.
- Impact: the development server and the project's default e2e config are unreliable on this PC. Production-mode behaviour looks sound, but this is not proven on Vercel. The earlier "112/112" claim is true only for production mode. The final report's note that heavy processes cause timeouts may be part of the cause, but I did not isolate it.
- Fix: point the e2e config at `next build && next start` (what I did with a temporary config, since removed), and tell the owner to restart `next dev` if sign-in returns a 404 page.
- Deployment impact: none expected for production; the first Vercel preview must be smoke-tested.

**M2. Dependency vulnerabilities (production dependencies).**
- Evidence: `source-map-js` (high, event-loop DoS via crafted source maps, reached through the build toolchain); `mammoth` → `argparse` → `sprintf-js` (moderate, DoS through unbounded precision). Also `package.json` has 15 dependencies set to `"latest"` (including `next`, `react`, `react-dom`, `typescript`, `vitest`; Prisma is pinned); `package-lock.json` pins them, but a fresh `npm install` can drift.
- Impact: `source-map-js` is not reachable from user input at runtime. `mammoth` parses teacher-uploaded .docx files (teacher role only, 5 MB), so the realistic risk is low.
- Fix: `npm audit fix` for `source-map-js` (non-breaking); track the `mammoth` advisory; pin `latest` ranges to the versions in the lockfile.
- Deployment impact: none that blocks; fix when convenient.

**M3. Rate limits are in server memory, per instance.**
- Evidence: `src/server/rate-limit.ts:7-34` and `src/server/ai.ts:10-14` (`new Map`). The account lockout is the exception: it is in the database.
- Impact: on Vercel each warm instance keeps its own counters, so the limits are weaker than they look (an attacker can be spread across instances). Login brute force is still bounded by the database lockout.
- Fix: back the counters with the database or a shared store, or add Vercel firewall rate limits on `/api/auth/*` and `/api/ai/*`.
- Deployment impact: acceptable for a small controlled pilot; fix before open registration.

**M4. No daily AI budget, and student sign-up is open.**
- Evidence: the register route (`src/app/api/auth/register/route.ts`) accepts any email as STUDENT with no class code. The only AI limits are per-minute and in memory (M3). No per-user, per-class or global daily cap exists.
- Impact: once a real key is set, anyone can register and spend your AI credit. Today the key is blank, so AI answers 503 / falls back to rule-based hints.
- Fix: set a hard spend limit at the AI provider, add a per-user daily cap, and consider requiring a class join code before the tutor works.
- Deployment impact: must be done at the same time as adding the production AI key.

**M5. Assessment endpoint has no ownership or status checks.**
- Evidence: `src/services/assessment.service.ts:28-61` and `src/app/api/assessments/[id]/route.ts`. Any signed-in TEACHER or ADMIN gets any assessment including answer keys; any student gets any assessment (answer keys removed) regardless of the lesson's status. IDs are random, so they are hard to guess. Found by code reading; not exercised.
- Impact: one teacher could read another teacher's assessment if they learn the ID. Low likelihood, moderate sensitivity.
- Fix: scope teachers to their own lessons and students to published ones.
- Deployment impact: fix before a multi-teacher pilot.

**M6. Teacher student-detail view is not limited to the teacher's class lessons.**
- Evidence: `src/services/class-insights.service.ts:226-240` loads all of the student's practice answers, mastery and mistakes, not only those for lessons assigned in this class.
- Impact: a teacher sees a student's activity from outside their class. This is a privacy-scope question for the school's consent form, not a bug that crosses accounts.
- Fix: limit to the class's assigned lessons, or document it in the privacy notice.
- Deployment impact: decide before real student data is used.

**M7. Registration confirms whether an email already exists.**
- Evidence: `src/app/api/auth/register/route.ts:88-95` returns 409 "already exists". Login was hardened; register was not. Rate limit applies (M3).
- Impact: account enumeration. Low.
- Fix: accept the trade-off or return a generic message plus email confirmation later.

**M8. Health check does not test the database.**
- Evidence: `src/app/api/health/route.ts` always returns ok.
- Impact: a monitor will say healthy while the database is down. No data exposure.
- Fix: add a separate readiness check that runs `SELECT 1` and returns only ok/fail.

**M9. PDF text extraction on Vercel is untested.**
- Evidence: `pdf-parse`/`pdfjs-dist` are kept external (`next.config.mjs`) and load a worker file at runtime. Works locally and in `next start`; serverless packaging, memory and time limits are not verified.
- Fix: deploy a Vercel Preview and upload a PDF before relying on it. DOCX/TXT/captions do not use the worker.

**M10. Content-Security-Policy allows inline and eval scripts.**
- Evidence: `next.config.mjs:32` (`'unsafe-inline' 'unsafe-eval'`). No HSTS header is set by the app.
- Impact: weaker XSS defence. Vercel normally adds HSTS on its domains; I did not verify that.
- Fix: move to nonce-based scripts when time allows; set HSTS explicitly on the custom domain.

**M11. Other items already known:** no backups or restore test, no monitoring/alerting, no load test, no per-form CSRF token (the cookie setting plus origin check is in place), consent capture and retention schedule not built, lessons not teacher-reviewed. All are in `FINAL_REPORT.md` and `PRIVACY_AND_DATA.md`.

## 7. 🔴 Blockers

**B1 (FIXED). `POST /api/ai/analyze-transcript` was open to every signed-in user, including students, with up to 100,000 characters of input.**
- Evidence: `src/app/api/ai/analyze-transcript/route.ts:21-31` checks only that the session user exists (`select: { id: true }`), with no role check. Input limit is 100,000 characters (`:16`). The limit is 10 requests a minute per user, in memory (`:38`, M3). No page in the app calls it. The route is covered by a test that exercises the happy path only (`tests/ai-api.test.ts:83`).
- Impact: with open student sign-up and a real AI key, anyone can register and use your AI account as a general AI service, billed to you. The output is shaped to a fixed JSON schema, which limits misuse but not cost. This is exactly the "AI proxy abuse" case in the checklist.
- **Fix applied:** the route now answers 403 to anyone who is not a TEACHER or ADMIN (`src/app/api/ai/analyze-transcript/route.ts`). New test "refuses transcript analysis to visitors and students without calling the AI" in `tests/ai-api.test.ts`: visitor 401, student 403, AI never called. Verified: that test FAILS against the old route code and passes with the fix. Three older tests that used a student account now use a teacher account. Typecheck, lint and 937/937 unit tests pass. Browser tests were not re-run (no page uses this route).
- Original required fix (smallest safe): restrict the route to TEACHER/ADMIN as `generate-lesson` already does, or delete it since nothing uses it. Add a test that a student gets 403. Verify with `npm test`.
- Related, lower severity: `generate-question` and `generate-lesson` are also unused by any page. `generate-question` accepts free-text topic/subject from the student (up to 200 chars each) that goes into the model prompt; it is student-only, tied to the student's own session and rate limited. Removing unused AI routes would shrink the surface further. I understated this in an earlier summary when I described these routes as "authenticated and rate-limited".

**Owner-side gates (cannot be checked from here; required before real users):**
- **G1. Credential rotation is unverified.** The original zip contained a database password and a Vercel token. They are not in git history, but I cannot see whether the old ones are still valid. If the old Neon database is still the one you deploy against, this is a blocker. Steps: `docs/OWNER_GUIDE.md` section 1.
- **G2. Production environment variables are unverifiable.** The project is not linked to Vercel (`.vercel` absent) and I did not use the Vercel CLI, to avoid linking or changing anything. See section 8.
- **G3. Real AI behaviour is unverified** (section 10).

## 8. Production Environment

Local `.env.local` (development, not production):

| Variable | Status |
|---|---|
| `DATABASE_URL` | PRESENT, points at **localhost** (correct for dev, wrong for production) |
| `TEST_DATABASE_URL` | PRESENT, localhost, name ends `_test` |
| `AUTH_SECRET` | PRESENT, 48 characters (OK, minimum is 32) |
| `AI_PROVIDER` | PRESENT (`anthropic`) |
| `ANTHROPIC_API_KEY` | **BLANK** |
| `ANTHROPIC_MODEL` | PRESENT |
| `GEMINI_API_KEY` / `GEMINI_MODEL` | BLANK / MISSING (NOT REQUIRED while using Anthropic) |
| `TEACHER_INVITE_CODE` | **BLANK** (teacher self-registration is disabled; teachers must be created by an admin) |
| `TRUSTED_PROXY_HOPS` | MISSING (code defaults to 1, which is correct for Vercel) |
| `NEXT_PUBLIC_APP_URL` | PRESENT, points at localhost |
| `ALLOW_DEMO_SEED` | PRESENT, set to `true` locally (must NEVER be set in Vercel; the seed also refuses `NODE_ENV=production`) |
| `ANTHROPIC_BASE_URL` | MISSING (NOT REQUIRED; blank means the real API) |

**Production (Vercel) variables: NOT VERIFIABLE FROM THIS WORKSPACE.** Required there: `DATABASE_URL` (Neon pooled string, new password), `AUTH_SECRET` (new, 32+ chars), `AI_PROVIDER` and its key, `TRUSTED_PROXY_HOPS=1`, `NEXT_PUBLIC_APP_URL` (the real URL). Optional: `TEACHER_INVITE_CODE`. Forbidden: `ALLOW_DEMO_SEED`. Migrations are applied separately with `prisma migrate deploy` (guarded in `prisma.config.ts`); `vercel.json` only runs `prisma generate` and the build.

## 9. Critical User Flows

All results are from the browser suite against the **production build**, on desktop and Pixel 5 emulation, with a **fake AI**.

| Flow | Result |
|---|---|
| Student: login → dashboard → curriculum → lesson → checks → practice → wrong answer → mistake analysis → tutor → progress | **PASS** (student-journey, term1-lessons, tutor, voice specs) |
| Teacher: login → dashboard → create lesson → content → practice questions → publish → class → assignment → student completes → analytics | **PASS** (full-loop, classroom, documents specs) |
| Admin: create teacher account (audited), deactivate teacher (signed out immediately), user management | **PASS** (classroom spec) |

Caveat: the same flows were **unstable on `next dev`** (M1), and none was run on Vercel or on real phones.

## 10. AI Verification

| | |
|---|---|
| **REAL AI VERIFICATION: NOT PERFORMED.** No AI key is configured (`ANTHROPIC_API_KEY` blank). I did not simulate a real result. | |
| **SIMULATED / FAKE AI** | Every AI reply in the 112 browser tests comes from a local fake model server. The unit tests use mocked providers. They prove the plumbing, the guards and the fallback, not how a real model behaves. |

The nine real-AI scenarios you listed (normal question, wrong answer, repeated wrong answer, "I understand", asks for the answer, off-topic, prompt injection, current lesson, unavailable information) remain unverified. The harness is ready: `RUN_LIVE_AI=true npm run test:live` (see `docs/LIVE_AI_RUNBOOK.md`).

## 11. Final Recommendation

🔴 **DO NOT DEPLOY** yet. This is not a rebuild; it is a short list.

In simple English: the app itself is in good shape. It compiles, the 936 unit tests pass, and all 112 browser tests pass against the real production build. I found no leaked secrets and no way to read another person's data in the routes I checked. But one AI route lets any logged-in student use your AI account, which will cost real money the moment you add a key. I also cannot see your Vercel settings or confirm the old database password was changed, and nobody has seen a real AI model use the tutor.

**Fix first (in order):**
1. ~~B1: restrict or delete `analyze-transcript`~~ DONE (see section 7).
2. G1: rotate the Neon password and Vercel token and confirm the old ones fail.
3. G2: set the production variables listed in section 8 (never `ALLOW_DEMO_SEED`); paste me the exact Vercel "minor risk" text.
4. M4: set a spend limit at the AI provider before putting the key into Vercel.
5. M5: scope the assessment endpoint.
6. Then deploy a **Preview**, smoke-test login, a lesson, a PDF upload (M9) and a tutor round, and run `npm run test:live` (G3).

After steps 2 and 3, the status is 🟡 and a controlled preview deployment is reasonable. Real students should wait for steps 4 to 6, the teacher review of the lessons, and the consent form.

**Can we safely proceed to the deployment step?** No, not yet. I have not deployed anything and will wait for your approval before touching production.

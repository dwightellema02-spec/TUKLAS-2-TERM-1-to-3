# TUKLAS AI V2: ALL PHASE REPORTS (Phase 6 to Phase 13)

Compiled 2026-10-04 from the individual reports in this folder. Phases 1-5 are the code that arrived in the original
tuklas-v2-phase5 snapshot; they have no verification reports of their own, because the first thing done on that code was
the Phase 22 Readiness Audit (delivered in the conversation), which found most Phase 21 claims in the old tuklas-ai repo
simulated or broken. The V2 reports below are the evidence trail from Phase 6 onward. Phase 14 (teacher analytics) is in
progress and has no report yet.



---

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


---

# TUKLAS AI — PHASE 7 VERIFICATION REPORT

**PHASE:** V2 Phase 7 — Student Journey
**OBJECTIVE:** Make the student side of the learning loop usable end to end — learn, check, practice,
get feedback, review mistakes, see progress (master plan §2, §11, §12, §26, §30 student flow) — and prove it
in a real browser.

## IMPLEMENTED

1. **Practice that works without AI.** `POST /api/practice/sessions` with `source: "LESSON_BANK"` copies up to N
   questions from the lesson's own practice bank (teacher-authored questions not attached to an assessment).
   Selection: questions the student missed most recently first, then unseen ones, then ones already known.
2. **Key-safe session view.** `GET /api/practice/sessions/[id]` returns the question and options; the answer key and
   explanation of a question appear only after that question is answered.
3. **Mistakes are recorded** automatically for every wrong practice answer (with the student's answer, the correct
   answer and the explanation). Category is generic `CONCEPTUAL` until Phase 8.
4. **Verified content:** 18 Grade 7 integer practice questions (add/subtract/multiply/divide) whose answers are
   computed, with distractors that model real mistakes. Checked by an independent calculation in tests.
5. **Screens:** real dashboard (progress, continue, learning path with status, recent practice, mistakes to review),
   practice player (one question at a time, feedback with focus management, results review, practice again),
   mistakes review page, and a "Practice this lesson" entry on the lesson page. The old dashboard was hard-coded.
6. Migration: `PracticeQuestion.position` and `quizQuestionId` (link back to the bank question; evidence for Phase 8).
7. Accessibility fix found by the browser tests: logo/eyebrow orange text failed contrast (2.98:1) → `#8a4600`.

## VERIFICATION

| Feature | Status | Evidence |
|---|---|---|
| Lesson-bank practice, no AI key | PASS | 13 API tests + browser journey |
| Answer key hidden until answered | PASS | API tests; browser asserts the page's own network data has no `correctIndex`/`explanation` |
| Mistake recorded and reviewable | PASS | API test + browser (mistake appears, can be marked understood) |
| Missed questions return first | PASS | API test + browser (the exact missed question is first next time) |
| Practice content correct | PASS | 24 tests incl. independent oracle for all 18 answers |
| Dashboard from real data | PASS | 8 service tests + browser (before/after states) |
| Students isolated from each other | PASS | API tests + browser (second student gets "not found") |
| Sign-in required for student pages | PASS | browser: all 3 student URLs redirect to /login |
| Accessibility (axe, WCAG A/AA, critical+serious) | PASS | 8 screens × desktop and phone, after one real contrast defect was fixed |
| Layout on phone (Pixel 5 emulation) | PASS | no sideways scroll; answer targets ≥ 44px; screenshots reviewed |
| Teacher flows, classes, admin | NOT IMPLEMENTED | Phase 9 |
| Mastery/adaptive difficulty | NOT IMPLEMENTED | Phase 8 (selection of missed items is a simple first step only) |
| AI tutor UI | NOT IMPLEMENTED | Phase 10 |

**AUTOMATED TESTS:** 246 / 246 PASS (Vitest, 24 files; was 201)
**REAL BROWSER:** 14 / 14 PASS — Playwright + Chromium, desktop and Pixel 5 emulation (screenshots in `docs/evidence/phase7/`)
**TYPECHECK:** PASS  **LINT:** PASS  **BUILD:** PASS
**DATABASE:** PASS (new migration applies; no drift)
**SECURITY:** PASS for this phase's surface (ownership, role, key-hiding tested)
**REAL DEVICE:** NOT COMPLETED (emulation only; no physical phone/tablet)
**REAL USER:** NOT COMPLETED

## KNOWN LIMITATIONS

1. The browser tests run Chromium only; Firefox/Safari and real phones are untested.
2. Practice currently covers one lesson's worth of content (integers). Grade 7 Term 1–3 curriculum content is still missing.
3. Only multiple-choice/true-false questions are served; numeric and short-answer practice need UI work.
4. Mistakes are all category `CONCEPTUAL`; no classification or targeted remediation yet (Phase 8).
5. The lesson payload still lists assessment question text to students (without answers).
6. Tests share one deterministic seed; the browser suite resets the test database on each run.
7. The dev-only Next.js indicator shows in screenshots.

## DEFECTS FOUND

1. Brand/eyebrow text color failed WCAG contrast (fixed, site-wide).
2. Dashboard was hard-coded to one lesson with a static "Tracking Active" claim (replaced).
3. Practice was impossible without an AI key (fixed with the lesson bank).

## REMAINING RISKS

1. `analyze-mistake` still trusts a client-sent `correctIndex` (carried from Phase 6).
2. Real-device voice/touch behaviour unknown until tested on hardware.
3. Neon/Vercel credentials from the original zip still need rotating by the owner.

## FINAL DECISION

**READY_FOR_NEXT_PHASE** (Phase 8: mistake engine, mastery and adaptive practice).


---

# TUKLAS AI — PHASE 8 VERIFICATION REPORT

**PHASE:** V2 Phase 8 — Mistake Engine, Mastery and Adaptive Practice
**OBJECTIVE:** Close the learning loop (master plan §12 mistake engine, §13 adaptive engine, §14 mastery):
a wrong answer is understood, evidence is accumulated, mastery is judged from evidence, and the next practice
adapts — all computed on the server and visible to the student.

## IMPLEMENTED

1. **Mistake classifier** (`src/server/mistake-classifier.ts`). Classifies integer mistakes by recomputation, not
   keywords: sign error, used a different operation (and which), ignored signs, calculation slip, conceptual.
   Each result has the rule that fired, an observation and a targeted tip. Saved with every wrong practice answer.
2. **Mastery engine** (`src/server/mastery.ts`, ported from tuklas-ai and adapted): NOT_STARTED → LEARNING →
   DEVELOPING → PROFICIENT → MASTERED from accuracy, recent window, consistency, difficulty diversity, hard-question
   performance and repeated sign/conceptual mistakes. Config-driven (`MASTERY_V1`). Evidence = the student's LATEST answer to
   each distinct question (retries cannot inflate it; fixing a mistake raises it).
3. **Persistence + audit:** `SkillMastery` (current level, evidence, explanation) and `SkillMasteryHistory` (every level change
   with the rule). Recomputed inside the answer transaction. `GET /api/mastery` is read-only (no write route exists).
4. **Adaptive engine** (`src/server/adaptive.ts`): target difficulty per level, and a next-step recommendation
   (start / practice easier / remediate / same / harder / advance) for the weakest skill.
5. **Adaptive practice selection:** missed questions first, then a rotation across skills (weakest first), each offering the
   question closest to its target difficulty. Verified: the same lesson serves a beginner and a proficient student differently.
6. **Content:** four real `Skill` records linked to every practice question; bank rebalanced to 48 questions
   (per skill 4 easy / 4 medium / 4 hard), answers still computed and independently checked.
7. **UI:** `SkillProgress` panel (lesson page and practice results): level, progress bar, plain-language "why" and "next step".

## VERIFICATION

| Feature | Status | Evidence |
|---|---|---|
| Mistake classification | PASS | 14 tests incl. a sweep of every wrong option in the bank |
| Mastery rules | PASS | 20 tests incl. "never mastered from few/lucky answers", decline, sign-error block, determinism |
| Mastery from real answers via HTTP routes | PASS | 13 tests incl. history rows, retry de-duplication, recompute-equals-stored, isolation, read-only |
| Adaptive recommendation | PASS | 13 unit tests |
| Adaptive practice selection | PASS | 7 tests: beginner vs proficient, per-skill targeting, weakest skill first, missed first |
| Bank difficulty spread | PASS | test enforces ≥3 easy/medium/hard per skill (found and fixed a real gap: division had no easy items) |
| Student sees skills, why, next step | PASS | real browser, desktop + phone, axe WCAG A/AA clean |
| Mastery-gated lesson unlock | NOT IMPLEMENTED | only one real lesson exists; needs prerequisites (Phase 9 curriculum work) |
| Question types beyond multiple choice | NOT IMPLEMENTED | mastery uses difficulty diversity instead |
| Mistake classification beyond integer arithmetic | NOT IMPLEMENTED | other topics return UNCLASSIFIED (no claim made) |
| Teacher view of mastery/mistakes | NOT IMPLEMENTED | Phase 9/11 |

**AUTOMATED TESTS:** 348 / 348 PASS (Vitest, 29 files; was 246)
**REAL BROWSER:** 14 / 14 PASS (Playwright/Chromium, desktop and Pixel 5 emulation), now asserting the skills panel
**TYPECHECK:** PASS  **LINT:** PASS  **BUILD:** PASS  **DATABASE:** PASS (11 migrations, no drift)
**SECURITY:** PASS for this surface (mastery cannot be written by a client; students see only their own)
**REAL DEVICE:** NOT COMPLETED  **REAL USER:** NOT COMPLETED

## KNOWN LIMITATIONS

1. Thresholds (e.g. 10 questions for MASTERED) are reasoned defaults, not calibrated on real students.
2. Mastery covers the four integer skills only; other lessons need skill-tagged question banks.
3. The classifier understands plain integer arithmetic only.
4. Evidence ignores hint usage (there are no hints yet) and prerequisite skills (none defined).
5. Practice selection is deterministic rules; there is no AI involvement, by design (§46 Rule 9).

## DEFECTS FOUND

1. First adaptive version made a new student's session cover only 2 of 4 skills → replaced with skill rotation.
2. Bank had no EASY division questions → rebalanced; test now enforces the spread.
3. Two unexpectedly long test runs (10 min) were observed; no leftover process or DB lock was found and re-runs
   finish in ~20 s. Cause not proven.

## REMAINING RISKS

1. `analyze-mistake` (AI) still trusts a client-sent `correctIndex`.
2. Mastery thresholds uncalibrated; teachers cannot yet see or adjust anything.
3. Neon/Vercel credentials from the original zip still need rotating by the owner.

## FINAL DECISION

**READY_FOR_NEXT_PHASE** (Phase 9: classes, teacher onboarding, enrollment, assignments, admin).


---

# TUKLAS AI — PHASE 9 VERIFICATION REPORT

**PHASE:** V2 Phase 9 — Classes, Teacher Onboarding, Enrollment, Assignments and Admin
**OBJECTIVE:** Make the teacher platform (master plan §20–§22, §4 admin, §30 teacher flow) real:
a teacher gets an account, creates a class, students join, the teacher assigns work and monitors real
evidence, and an administrator manages accounts — with server-side authorization throughout (§23).

## IMPLEMENTED

1. **Classes.** `POST/GET /api/classes`; each class has a rotatable, closable 8-character join code (no look-alike characters).
2. **Enrollment.** Students join with the code (`/api/classes/join`, throttled per student and per address; invalid, rotated
   and closed codes are indistinguishable). Teachers can also add an existing student by email and remove students
   (their learning data is kept).
3. **Roster monitoring.** `GET /api/classes/[id]`: per student lessons completed, questions answered, accuracy, unreviewed mistakes,
   skill levels, last activity — all computed from the student's own rows. No activity shows zeros and "No answers yet", never
   placeholders. Students still at "learning" after ≥4 questions are flagged with the reason.
4. **Assignments.** Any teacher can assign a *published* lesson to a class with an optional due date; students see it with their own status
   (not started / in progress / completed) and an overdue flag; teachers see how many completed it. Archiving keeps progress.
5. **Authorization in one place.** `ClassService.requireClassAccess` is the only way a class is loaded; a teacher asking for someone else's
   class gets 404 (not 403), so IDs cannot be probed.
6. **Admin console** (real, replaces the static page): create teacher/student accounts with a temporary password, deactivate/reactivate,
   change role, reset password, search/filter, and an **audit log**. Rules enforced server-side: admins cannot create/manage other admins
   or act on themselves; deactivation, role change and password reset end all of the user's sessions immediately.
7. **Teacher onboarding:** two paths — administrator creates the account, or self-registration with the invite code (the sign-up form
   previously offered "Teacher" with no way to enter the code; fixed).
8. **Screens:** teacher home (real counts), classes list, class detail (code, roster, assignments), student "Your classes and assignments"
   with a join form, admin console.
9. **Defects fixed on the way:** rate-limit 429 was surfacing as 500 (affected the Phase 6 answer endpoint too); a visually-hidden table label
   escaped its scroll box and made the admin page scroll sideways on phones; broken word-wrapping in tables.

## VERIFICATION

| Feature | Status | Evidence |
|---|---|---|
| Create class, join code, rotate/close | PASS | 33 API tests + browser |
| Student joins; bad codes indistinguishable; throttled | PASS | API tests (incl. 429) + browser |
| Teacher isolation (read, rotate, add/remove, assign, archive) | PASS | API tests: every route returns 404 for a non-owner; browser: rival teacher sees "Class not found" |
| Role gating (students/teachers/admin/visitors) | PASS | API tests + browser redirects (/login, /unauthorized) |
| Roster shows only real evidence | PASS | API tests with exact numbers (e.g. 3/4 correct = 75%); browser (100% after 3 correct, "Learning") |
| Assignments, due dates, overdue, completion counts | PASS | API tests + browser |
| Admin: create/deactivate/role/reset, protections, audit | PASS | 17 API tests + browser; deactivated teacher is signed out and cannot sign in |
| Admin cannot touch admins or self, cannot create admins | PASS | API tests |
| Accessibility (axe WCAG A/AA) | PASS | admin, class (empty/roster/with activity), student dashboards, desktop + phone |
| Phone layout | PASS | no sideways scroll on any new page (after the fix above) |
| Email-based invitations / password-reset by email | NOT IMPLEMENTED | no email service; admin hands over a temporary password |
| Teacher analytics beyond the roster (class-level skill/misconception views) | NOT IMPLEMENTED | Phase 11 |
| Per-student assignments, class archive/delete | NOT IMPLEMENTED | class-wide assignments only |
| Teacher AI controls | NOT IMPLEMENTED | Phase 10 |

**AUTOMATED TESTS:** 399 / 399 PASS (Vitest, 31 files; was 348)
**REAL BROWSER:** 32 / 32 PASS (Playwright/Chromium, desktop and Pixel 5 emulation): 14 student journey + 18 classroom
(admin → teacher → class → student joins → assignment → practice → teacher sees activity → isolation → deactivation)
**TYPECHECK:** PASS  **LINT:** PASS  **BUILD:** PASS  **DATABASE:** PASS (11 migrations, no drift)
**SECURITY:** PASS for this surface (see isolation/role tests; mutation-free, every non-owner path asserted)
**REAL DEVICE:** NOT COMPLETED  **REAL USER:** NOT COMPLETED

Evidence screenshots: `docs/evidence/phase7/` (the browser suite writes all screenshots there; `c1`–`c7` are this phase).

## KNOWN LIMITATIONS

1. Temporary passwords are shown to the admin and handed over in person; there is no forced password change on first login.
2. Join codes do not expire (a teacher can rotate or close them).
3. The "needs attention" rule is simple (≥4 questions and still LEARNING, or ≥5 unreviewed mistakes), not calibrated.
4. Roster queries are not paginated; fine for class sizes, untested at scale.
5. Account lockout (Phase 6) can lock a known email for 15 minutes; admin password reset clears it.

## DEFECTS FOUND

1. Rate limiter returned 500 instead of 429 (two different `RateLimitError` classes) — fixed, regression-tested.
2. Admin page overflowed on phones because a `.sr-only` label escaped its scroll container — fixed (found by the browser test).
3. My first word-wrap fix split short words in tables ("Questio ns") — caught by viewing the screenshot; fixed.
4. Sign-up form offered "Teacher" without an invitation-code field — fixed.
5. A teacher's lesson list contained only their own lessons, so a new teacher could not assign the published curriculum — new `/api/lessons/published`.

## REMAINING RISKS

1. `analyze-mistake` (AI) still trusts a client-sent `correctIndex`.
2. No email, so account recovery depends on an administrator.
3. Neon/Vercel credentials from the original zip still need rotating by the owner.

## FINAL DECISION

**READY_FOR_NEXT_PHASE** (Phase 10: AI tutor v2 — Socratic hint ladder, tutoring state, lesson grounding, honest unavailable state).


---

# TUKLAS AI — PHASE 10 VERIFICATION REPORT

**PHASE:** V2 Phase 10 — AI Tutor v2 (Socratic hint ladder, tutoring state, lesson grounding, honest unavailable state)
**OBJECTIVE:** Make the AI learning companion real (master plan §3–§6, §16–§17, §46 rules 6–9): it helps a student think
rather than handing over answers, knows the lesson, the question and the student's skills, remembers the conversation,
and is honest about when the AI is not available.

## IMPLEMENTED

1. **Intent classifier** (English/Taglish): hint, don't understand, still confused, another example, give-me-the-answer, check-my-answer, general.
2. **Server-side hint ladder** (`src/server/tutor/ladder.ts`): rungs 1–6 while a question is unanswered, one rung at a time; rung 7
   (full explanation) only after the student has submitted. "Just give me the answer" adds scaffolding instead of the answer;
   "I still don't get it" forces a different strategy. The level is stored on the conversation, so it cannot be skipped from the client.
3. **Grounded prompt** (`prompt.ts`): published lesson (objectives, sections, vocabulary), the question and options, the student's skill levels
   and recent turns. For an open question the answer key and official explanation are **never** sent to the model.
4. **Output guard** (`guard.ts`), run on every reply before the student sees it: empty / too long, states the answer (contextual, so "Hint 1"
   is not mistaken for the answer 1), gives a right/wrong verdict on a proposed answer (anti-oracle), claims to have watched/read content it
   never received, echoes its instructions.
5. **Honest fallback** (`fallback.ts`): if the AI is unavailable or its reply is rejected, the student gets a rule-based hint labelled
   "Automatic hint (not AI)". Nothing is presented as AI that is not.
6. **Persistence and audit:** `ChatConversation.hintLevel/practiceQuestionId`, `ChatMessage.source/rung/intent`, one `AIInteraction` row per request
   (provider, latency, success, rung, intent, fallback reason).
7. **Two providers:** Anthropic and Gemini behind one interface (`AI_PROVIDER`); `ANTHROPIC_BASE_URL` override (used by the browser tests).
8. **UI** (`tutor-panel.tsx`): "Need help? Ask Tuklas" on every practice question and lesson page; quick actions; hint-level indicator;
   conversation restored on refresh; every reply labelled AI or automatic; plain notice when AI is off.
9. **Defects fixed on the way:** the answer-leak check blocked innocent replies ("Hint 1" when the answer was 1) — now contextual; the
   conversation log was not keyboard-focusable (axe) — fixed.

## VERIFICATION

| Feature | Status | Evidence |
|---|---|---|
| Intent classification | PASS | unit tests |
| Ladder (one rung at a time, rung 7 only after answering, strategy change) | PASS | unit tests + API tests + browser |
| Prompt never contains the answer key for an open question | PASS | unit tests + browser (inspects what the fake model received) |
| Guard blocks answer statements, verdicts, unseen-content claims, instruction echo | PASS | 67 guard tests + browser (misbehaving fake model) |
| Automatic fallback when AI fails or reply rejected | PASS | unit + API + browser, clearly labelled |
| Conversation memory and refresh restore | PASS | API tests + browser |
| Student isolation (other students' questions/conversations) | PASS | API tests |
| Rate limit (30/min) | PASS | API test |
| Accessibility (axe WCAG A/AA) of tutor panel and lesson page | PASS | desktop + phone |
| Phone layout | PASS | no sideways scroll |
| **Real Anthropic call** | **NOT VERIFIED** | no API key available |
| **Real Gemini call** | **NOT VERIFIED** | no API key and no `GEMINI_MODEL` |
| Tutor reply quality / pedagogy with a real model | NOT VERIFIED | needs a real model and real students |
| Voice, documents, video transcripts in the tutor | NOT IMPLEMENTED | Phases 11–12 |

**AUTOMATED TESTS:** 582 / 582 PASS (Vitest, 37 files; was 399)
**REAL BROWSER:** 48 / 48 PASS (Playwright/Chromium, desktop and Pixel 5 emulation; 16 new tutor tests) — the "AI" in these tests is a local fake
model server, so they prove the plumbing, guard and UI, not model quality
**TYPECHECK:** PASS  **LINT:** PASS  **BUILD:** PASS  **DATABASE:** PASS (12 migrations, no drift)
**SECURITY:** PASS for this surface (ownership scoping, answer-key isolation, guard, rate limit)
**REAL DEVICE:** NOT COMPLETED  **REAL USER:** NOT COMPLETED

Evidence screenshots: `docs/evidence/phase7/` (`t1`, `t2` are this phase).

## KNOWN LIMITATIONS

1. The guard is rule-based; a paraphrased answer leak (e.g. in words for a numeric answer) could still pass. It is a strong net, not a proof.
2. The intent classifier is keyword-based and will misread unusual phrasing; it errs toward treating a message as general help.
3. Tutor grounding uses lesson text only; teacher documents and video transcripts are not yet available to it.
4. Only the last 8 turns are sent to the model.
5. Automatic hints cover integer arithmetic best; other topics get generic guidance.

## DEFECTS FOUND

1. Guard false positive on single-digit answers ("Hint 1") — fixed with contextual detection and regression tests.
2. Tutor log not keyboard-focusable — fixed.
3. Test-design mistakes (fresh browser context per test; wrong expectation after reload) — fixed in the spec.

## REMAINING RISKS

1. No real model has ever run against this prompt and guard; the guard may reject too many real replies (students would see more automatic hints).
2. `analyze-mistake` still trusts a client-sent `correctIndex`.
3. Login timing still allows account enumeration.
4. Neon/Vercel credentials from the original zip still need rotating by the owner.

## FINAL DECISION

**READY_FOR_NEXT_PHASE** (Phase 11: curriculum content and document intelligence), with live-AI verification still outstanding until the owner
supplies a key (and `GEMINI_MODEL` if Gemini is used).


---

# TUKLAS AI — PHASE 11 VERIFICATION REPORT

**PHASE:** V2 Phase 11 — Document Intelligence (teacher reference documents grounding the AI tutor)
**OBJECTIVE:** Master plan §8 (resource intelligence), §6 (context hierarchy), §23 (security): a teacher attaches PDF / Word / text
material to a lesson, Tuklas extracts real text from it, and the tutor uses the relevant parts when a student asks, without trusting the
document as instructions and without leaking answers hidden in a worksheet.

**SCOPE NOTE:** This phase covers documents only. Curriculum content (more Grade 7 lessons), voice, video transcripts and teacher
analytics are NOT part of it and remain open (see FINAL DECISION).

## IMPLEMENTED

1. **Extractor** (`src/server/documents/extract.ts`): digital PDF (pdf-parse), DOCX (mammoth), plain text / Markdown. **No OCR**: a scanned or
   image-only PDF is refused with an honest message instead of producing empty or invented text.
2. **File type from bytes, not names.** `%PDF-` signature for PDFs; a zip is accepted only if it is a Word package named `.docx`; text only
   with a text extension and text-like bytes. An executable renamed `.pdf` is refused.
3. **Limits:** 5 MB upload (checked from `Content-Length` before the body is read; a missing length is refused), 200 PDF pages, 300,000
   extracted characters, 10 documents per lesson, and a **zip-bomb check** that reads the DOCX central directory and refuses archives that
   declare more than 50 MB expanded or 2,000 entries, before anything is decompressed.
4. **Storage:** only extracted text is kept (`LessonDocument` + `DocumentChunk`, migration `20261004100000_lesson_documents`); the file itself is
   never stored. File names are reduced to a plain base name.
5. **Ownership:** only the lesson's author or an administrator can list, upload or remove (`DocumentService.requireLessonControl`); students and
   other teachers get 403, visitors 401, an unknown lesson 404.
6. **Retrieval** (`retrieve.ts`): deterministic lexical scoring (rarer words and heading matches count more). When nothing matches, **nothing**
   is returned, so unrelated material never reaches the model.
7. **Tutor grounding:** relevant chunks enter the prompt in a `BEGIN/END TEACHER MATERIAL` block explicitly labelled as data, not instructions.
   Delimiter look-alikes and role tags inside a document are stripped (`sanitizeMaterial`); the output guard also rejects replies echoing the
   material markers.
8. **Answer-key protection:** while a practice question is open, any retrieved chunk that states that question's answer is dropped before the
   prompt is built, so an uploaded worksheet with an answer key cannot reach the model. After the student answers, nothing is withheld.
9. **Teacher UI:** a fourth studio tab, "Reference documents" (upload, per-file words/sections/pages, two-step remove, plain error messages).
10. **Defects fixed on the way (all found by running the real thing):**
    - pdfjs failed under the Next bundler ("Setting up fake worker failed") although unit tests passed → `serverExternalPackages` for
      `pdf-parse`, `pdfjs-dist`, `mammoth`.
    - The lesson studio page overflowed sideways on phones (tab row could not wrap) → wrapping header/tabs, `min-width: 0`.
    - The lesson studio page failed WCAG contrast (grey `#64748b`) → `#475569`. It had never been checked with axe before.
    - Vitest picked up a test file Next copies into `.next` → `.next/**` excluded.
    - "Page N of M" footers stayed in extracted text → removed (found on the real MATATAG PDF).
    - Extraction failures are now logged server-side (error name and message only, never document content).

## VERIFICATION

| Feature | Status | Evidence |
|---|---|---|
| Real PDF / DOCX / text extraction | PASS | 20 extractor tests with generated real PDF and DOCX files |
| Type spoofing (exe as .pdf, arbitrary zip as .docx, binary as .txt) | PASS | unit + API tests |
| Zip bomb refused before decompression | PASS | unit + API test (60 MB of zeros, a few KB compressed) |
| Oversize / unsized upload refused before reading | PASS | API test |
| Scanned PDF refused honestly | PASS | unit + API + browser |
| Ownership and role gating on every route | PASS | API tests + browser (student gets 403) |
| 10-document limit, delete cascades to chunks | PASS | API tests |
| Retrieval returns the right chunk, nothing when unrelated | PASS | unit + API + browser |
| Prompt-injection text inside a document neutralised | PASS | API test (exactly one real closing marker; look-alikes removed) |
| Answer-key chunk withheld while a question is open | PASS | API test, with a positive control (the same chunk reaches the prompt after answering) |
| Removing a document stops the tutor using it | PASS | browser |
| Production build extracts PDF and DOCX | PASS | `next start` on the test DB: both uploads returned 201, then were removed |
| Accessibility (axe WCAG A/AA) of the documents tab | PASS | desktop + phone |
| Phone layout | PASS | no sideways scroll |
| Real documents | PASS (extraction) | `G7-BOW-Mathematics-7-Three-Term-1.pdf`: 10 pages, 1,390 words, 13 chunks; `MATATAG-Mathematics-CG-Grades1-4-and-7.pdf`: 36 pages, 11,645 words, 110 chunks (retrieval found its "add and subtract integers" competency); `Math-Reviewer.pdf`: 3 pages, 515 words |
| OCR, PPTX, XLSX, images | NOT IMPLEMENTED | deliberately out of scope (OCR would send student/teacher material to an external service and is unverified) |
| Real-model use of the material (does it paraphrase well?) | NOT VERIFIED | no API key; the browser "AI" is the local fake server |
| Mutation checks of the two new security tests | NOT DONE | a request to temporarily weaken the guard code was declined; the positive control above is the substitute evidence |

**AUTOMATED TESTS:** 618 / 618 PASS (Vitest, 39 files; was 582)
**REAL BROWSER:** 58 / 58 PASS (Playwright/Chromium, desktop and Pixel 5 emulation; 10 new document tests)
**TYPECHECK:** PASS  **LINT:** PASS  **DATABASE:** PASS (13 migrations, no drift)
**BUILD:** PASS (run before the last one-line footer-regex change; typecheck, lint and all tests were rerun after it)
**SECURITY:** PASS for this surface (ownership, type spoofing, zip bomb, size, injection, answer-key withholding)
**REAL DEVICE:** NOT COMPLETED  **REAL USER:** NOT COMPLETED

Evidence screenshots: `docs/evidence/phase7/` (`d1`, `d2` are this phase).

## KNOWN LIMITATIONS

1. Heading detection is weak on PDFs: most real chunks are labelled "Overview". Retrieval still works on content; headings only add a small bonus.
2. Retrieval is lexical, so a student's paraphrase with no shared words (or a Filipino word the notes spell in English) will not match.
3. Tables and equations in PDFs are flattened to text; mathematical layout is not preserved.
4. The zip-bomb check trusts sizes declared in the archive; it is a first line of defence, backed by the 5 MB limit, not a proof.
5. Answer-key withholding checks the exact answer text; an answer key written in a different form (for example "negative seven") is not caught by the filter, only by the reply guard.
6. Documents are visible to the tutor for everyone studying that lesson; there is no per-class or per-student document scope yet.
7. Re-uploading a changed file means removing and uploading again; there is no versioning.

## DEFECTS FOUND

See item 10 above. Five were real product defects (bundler break, phone overflow, contrast, footer noise, test discovery); none were present in
code written earlier in this phase's own tests.

## REMAINING RISKS

1. No real model has used this material; paraphrasing quality and over-reliance on notes are unmeasured.
2. `analyze-mistake` still trusts a client-sent `correctIndex`.
3. Login timing still allows account enumeration.
4. Neon/Vercel credentials from the original zip still need rotating by the owner.
5. Only one real lesson exists, so the documents feature has little curriculum to ground yet.

## FINAL DECISION

**READY_FOR_NEXT_PHASE.** Recommended next, in order: (a) Grade 7 Term 1 lesson content authored from the MATATAG guide and budget of work,
which now exist as extractable text; (b) video transcript ingestion; (c) teacher analytics; (d) voice (the `microphone=()` policy must change
first); (e) the real-browser/real-device/real-user gate. Live AI verification still needs an owner-supplied key.


---

# TUKLAS AI — PHASE 12 VERIFICATION REPORT

**PHASE:** V2 Phase 12 — Grade 7 Term 1 curriculum content
**OBJECTIVE:** Master plan §8 and §10 (curriculum): replace the single real lesson with lessons aligned to the DepEd MATATAG Grade 7
Mathematics Budget of Work (First Term, updated April 17, 2026), each with sections, vocabulary, knowledge checks, learning objectives
linked to a competency and skills, and a practice bank whose answers are computed, not typed by hand.

**SCOPE NOTE:** Content only. No schema change, no new API, no new UI. Video transcripts, teacher analytics, voice and the
real-device/real-user gate remain open.

## IMPLEMENTED

1. **Five published lessons** (`prisma/content/term1-lessons.ts`), under three non-demo Term 1 units (positions 1, 3, 4):
   Polygons and Their Angles; Percentage Change and Money Problems; Rates and Speed; Rational Numbers: Fractions, Decimals and
   Percents; Square Roots, Cube Roots and Irrational Numbers. Each has 3 sections, 3–5 vocabulary terms, 2 knowledge checks,
   2 learning objectives.
2. **Competency traceability:** each lesson links to a competency whose title is the Budget of Work wording and whose source names the
   document. Codes (`G7-T1-W3-MG` …) are Tuklas identifiers, labelled as not official DepEd codes. Objectives link to skills and every
   practice question links to its skill and objective.
3. **Practice banks** (`prisma/content/term1-banks.ts`): 12 skills × 12 questions = 144. Each wrong option models a real mistake
   (wrong formula, sign error, forgotten step, flat vs percent). Difficulty spread of at least 3 easy, 3 medium, 3 hard per skill;
   the correct answer rotates through all four slots; skills are interleaved so a short session is mixed.
4. **Seed** (`prisma/seed.ts`): idempotent upserts; practice questions are not attached to any assessment.
5. **Honest alignment:** items the Budget of Work lists but this phase does not cover are written in the file header (see limitations).

## VERIFICATION

| Feature | Status | Evidence |
|---|---|---|
| Every practice answer correct | PASS | `tests/term1-content.test.ts`: an independent oracle per skill re-derives the answer from the numbers in the question text (not from the generator); exactly one option equals it. 144 items |
| Structure (4 distinct options, unique ids/positions/texts, explanations contain the answer) | PASS | unit |
| Knowledge checks correct and not duplicated from the bank | PASS | unit, 10 hand-stated expected answers |
| Deterministic validator accepts the whole bank | PASS | unit; the 12 decimal-operation items are also math-verified by it |
| Seeded database matches the content (units, competency source, objective→skill links) | PASS | unit against the test DB |
| Existing features unaffected by more published lessons | PASS | full suite 771/771 (was 618) |
| Learning path shows all five lessons, no demo content | PASS | browser, desktop + phone |
| Each lesson page: sections load, no answer key in the response | PASS | browser |
| Full practice session on a Term 1 lesson, graded server-side | PASS | browser (10/10, mastery not claimed from 10 answers) |
| Accessibility (axe WCAG A/AA) of the five lesson pages, dashboard, results | PASS | browser |
| Phone layout | PASS | no sideways scroll |
| Mathematical and pedagogical review by a teacher | NOT DONE | content is Claude-drafted |
| Real-model tutoring on these lessons | NOT VERIFIED | no API key |

**AUTOMATED TESTS:** 771 / 771 PASS (Vitest, 40 files; was 618)
**REAL BROWSER:** 64 / 64 PASS (Playwright/Chromium, desktop and Pixel 5 emulation; 6 new)
**TYPECHECK:** PASS  **LINT:** PASS  **BUILD:** PASS
**DATABASE:** no schema change, so no new migration (13 migrations unchanged)
**SECURITY:** no new surface; answer keys still absent from student responses (checked per lesson)
**REAL DEVICE:** NOT COMPLETED  **REAL USER:** NOT COMPLETED

## KNOWN LIMITATIONS

1. **Not teacher-reviewed.** Wording, examples and difficulty labels are a draft. Difficulty is a pattern (or, for decimal operations,
   a count of hurdles), not measured from student data.
2. **Competencies not covered:** W1 (drawing polygons with ruler and protractor), W2's convex/non-convex is taught but not practised,
   W5 (financial plan: a short guide, no graded practice), W7 ordering on a number line (taught, not practised), and operations on
   fractions in W8–9 (practice covers decimals only).
3. The existing integers lesson sits in Term 1 although the Budget of Work places integer operations in Term 3. It was left as it was.
4. All questions are multiple choice; no free-response or step-checking.
5. Lesson text was written without the tutor's reference documents; teachers can still attach the MATATAG PDFs per lesson.
6. Seeding is gated by `ALLOW_DEMO_SEED` and disabled in production, as for the earlier lesson, so a production database needs a
   separate, reviewed content-loading path.

## DEFECTS FOUND

One: root-question explanations were too short to teach (caught by the new structure test); fixed. No product defects surfaced in the
existing 58 browser tests after adding five published lessons.

## REMAINING RISKS

1. Curriculum accuracy rests on my drafting plus computed answers; a teacher must review before students rely on it.
2. `analyze-mistake` still trusts a client-sent `correctIndex`.
3. Login timing still allows account enumeration.
4. Neon/Vercel credentials from the original zip still need rotating by the owner.
5. Live AI calls remain unverified.

## FINAL DECISION

**READY_FOR_NEXT_PHASE.** Recommended next: (b) video transcript ingestion, (c) teacher analytics, (d) voice (the `microphone=()`
policy must change first), then (e) the real-browser/real-device/real-user gate. A teacher review of the Term 1 content should
happen before any classroom use.


---

# TUKLAS AI — PHASE 13 VERIFICATION REPORT

**PHASE:** V2 Phase 13 — Video caption ingestion (lesson video transcripts grounding the AI tutor)
**OBJECTIVE:** Master plan §8 (resource intelligence), §6 (context hierarchy), §23 (security): a teacher attaches the caption file of a
lesson video; Tuklas stores the text with its timings, and the tutor can point a student to the part of the video that matches their
question, without trusting the captions as instructions and without leaking answers.

**SCOPE NOTE:** Captions are supplied by the teacher (.srt or .vtt). Tuklas does NOT download videos or fetch captions from YouTube or
any site, and does NOT transcribe audio (no speech-to-text). Teacher analytics, voice and the real-device/real-user gate remain open.

## IMPLEMENTED

1. **Caption parser** (`src/server/documents/transcript.ts`): WebVTT and SubRip. Skips NOTE/STYLE blocks, cue numbers and timing
   settings; strips markup, styling codes and control characters; accepts hour timestamps and a byte-order mark; skips cues with
   backwards timings; collapses lines repeated by rolling auto-captions; caps at 20,000 cues.
2. **Timed chunks:** cues are grouped into ~45-second windows (never over the chunk size), each labelled `Video m:ss–m:ss`.
3. **Type detection from bytes:** a `.srt`/`.vtt` is accepted only if the bytes are text and look like captions; an executable or a plain
   document renamed `.vtt` is refused. Reuses the existing 5 MB, ownership, 10-documents-per-lesson and storage rules (no schema change:
   `kind` is `TRANSCRIPT`).
4. **Tutor:** a caption chunk appears as `Video transcript "Video 1:10–1:20"` inside the existing data-only `TEACHER MATERIAL` block, with a
   rule that the tutor has not watched the video and may only use the time range and words shown. Delimiter look-alikes are stripped as
   for documents, and chunks stating an open question's answer are still withheld.
5. **Teacher UI:** the documents tab accepts `.srt`/`.vtt`, labels them "Video captions", and says plainly that Tuklas does not fetch
   captions itself.

## VERIFICATION

| Feature | Status | Evidence |
|---|---|---|
| VTT/SRT parsing (tags, NOTE, CRLF, BOM, hours, rolling duplicates, bad timing, cue cap) | PASS | 9 unit tests |
| Time-window chunks, size limit, headings, retrieval to the right moment, nothing when unrelated | PASS | unit |
| Byte/name type detection; renamed executable or non-captions refused | PASS | unit + API (400) + browser |
| Upload stores timed chunks for the owner; tutor prompt carries the video label and "not watched" rule | PASS | API test |
| Prompt-injection text inside captions neutralised | PASS | API test (one real closing marker) |
| Answer-stating caption chunk withheld while a question is open | PASS | API test (the unrelated chunk still reaches the prompt) |
| Teacher uploads captions, tutor receives the right moment, removal stops use | PASS | browser, desktop + phone |
| Accessibility (axe WCAG A/AA) and phone layout of the tab with captions | PASS | browser |
| Existing document behaviour unchanged | PASS | prior 618 + Phase 12 tests still pass |
| Real captions from a real lesson video | NOT VERIFIED | no real caption file available; tests use authored captions |
| Real-model use of the timings | NOT VERIFIED | no API key; the browser "AI" is the local fake server |
| Automatic transcript fetch / speech-to-text | NOT IMPLEMENTED | deliberately out of scope |

**AUTOMATED TESTS:** 790 / 790 PASS (Vitest, 41 files; was 771)
**REAL BROWSER:** 66 / 66 PASS (Playwright/Chromium, desktop and Pixel 5 emulation; 2 new)
**TYPECHECK:** PASS  **LINT:** PASS  **BUILD:** PASS  **DATABASE:** no schema change (13 migrations unchanged)
**SECURITY:** PASS for this surface (type spoofing, markup stripping, injection, answer-key withholding, ownership inherited)
**REAL DEVICE:** NOT COMPLETED  **REAL USER:** NOT COMPLETED

## KNOWN LIMITATIONS

1. Teachers must export captions themselves (for example from their video host); nothing is fetched automatically.
2. A chunk is labelled with a time range but students cannot click it to jump in the video; the tutor only says the time.
3. Captions are not tied to a specific `LessonSource` video; they attach to the lesson. A lesson with several videos shows only time
   ranges.
4. Retrieval is lexical, so a paraphrase sharing no words with the captions will not match.
5. Auto-generated captions can contain recognition errors in maths terms; Tuklas cannot detect them.

## DEFECTS FOUND

None in this phase's own code after the first run. (A vitest run hung once at `prisma migrate deploy` while checking; killing it and
rerunning to a log file succeeded. Cause not identified.)

## REMAINING RISKS

1. Live AI calls remain unverified.
2. `analyze-mistake` still trusts a client-sent `correctIndex`.
3. Login timing still allows account enumeration.
4. Neon/Vercel credentials from the original zip still need rotating by the owner.
5. Phase 12 lesson content is not teacher-reviewed.

## FINAL DECISION

**READY_FOR_NEXT_PHASE.** Recommended next: (c) teacher analytics, (d) voice (the `microphone=()` policy must change first), then (e) the
real-browser/real-device/real-user gate.

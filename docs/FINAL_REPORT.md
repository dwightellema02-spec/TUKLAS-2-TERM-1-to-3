# TUKLAS AI — FINAL REPORT (end of the autonomous build)

Repository: `tuklas-v2`. Reports for every earlier phase are in `docs/` (`ALL_PHASE_REPORTS.md` and the files named below).
**Owner rule applied throughout: nothing is called done unless it was run and checked; everything else says NOT VERIFIED.**

## 1. Where the master plan (A–N) stands

| | Phase | Status | Evidence / document |
|---|---|---|---|
| A | Close Phase 14 (teacher analytics) | **DONE** | `PHASE_14_VERIFICATION.md` |
| B | Real baseline audit | **DONE** | `REAL_BASELINE_REPORT.md` |
| C | Real AI provider verification | **NOT VERIFIED: no API key.** Harness ready | `PHASE_C_REAL_AI_VERIFICATION.md`, `LIVE_AI_RUNBOOK.md` |
| D | Adaptive Socratic tutor | **DONE for app logic and fallback**; real-model effect NOT VERIFIED | `PHASE_D_ADAPTIVE_SOCRATIC_TUTOR.md` |
| E | Lesson-grounded AI | **DONE** (selection, budget, worked examples, objectives, teacher notes) | section 3 below |
| F | Teacher practice authoring | **DONE** (UI, API, validation, ownership) | section 3 |
| G | Document intelligence | **PARTIAL**: digital PDF, DOCX, TXT/MD, SRT/VTT; no OCR, PPTX, XLSX, images, embeddings | `PHASE_11/13_VERIFICATION.md` |
| H | Adaptive mastery loop | **DONE in the app**: mistake -> tutor -> targeted practice -> reassessed mastery; practice is selected from the bank, not AI-generated | section 3 |
| I | Voice tutor | **WIRED and tested with a stand-in speech engine**; real microphone and phones NOT VERIFIED | section 3 |
| J | Full teacher/student loop | **DONE in a real browser** on a teacher-made lesson (desktop + phone emulation) | `e2e/full-loop.spec.ts` |
| K | Production hardening | **PARTIAL**: five fixes made; list of what is not done | section 4, `DEPLOYMENT_RUNBOOK.md`, `PRIVACY_AND_DATA.md` |
| L | Real pilot | **NOT STARTED**: plan only | `PILOT_PLAN.md` |
| M | School/DepEd readiness | **NOT READY**: gap analysis only | `SCHOOL_DEPED_READINESS.md` |
| N | Productization | **NOT STARTED**: checklist only | `SCHOOL_DEPED_READINESS.md` |

**Completed: A, B, D, E, F, H, J. Partly done: G, I (wiring only), K. Not verifiable by me: C, L. Not started: M, N.**

## 2. Test results (final run)

| | |
|---|---|
| Unit (Vitest) | **922 / 922 PASS (51 files)** |
| Browser (Playwright, Chromium desktop + Pixel 5 emulation) | **100 / 100 PASS (one clean run)** |
| TypeScript / ESLint | clean / clean |
| Production build | **PASS** |
| Schema vs migrations (fresh shadow DB) | no difference (15 migrations) |
| **Live AI (real model)** | **NOT VERIFIED** |
| Real device / real teacher / real student | **NOT VERIFIED** |

## 3. What was built in this last stretch

**E: lesson-grounded AI** (`src/server/tutor/context.ts`). The tutor used to get the first six sections of a lesson whatever the
student asked. Now the sections that match the question come first (deterministic lexical retrieval), the opening is kept for
orientation, the result stays in lesson order inside a 2,400-character budget, the headings of unsent sections are named, and
teacher-authored worked examples (problem, steps, result), which the tutor could not see before, are included. A question about
the 12th section of a long lesson now reaches the model (tested).

**F: practice authoring** (`PracticeAuthoringService`, `/api/lessons/[id]/practice-questions`, studio tab "5. Practice Questions").
A teacher adds, edits and removes questions with four distinct choices, a marked answer, an explanation, a skill and difficulty, and
optional "common mistakes". Plain-arithmetic questions are verified by computation and a wrong marked answer is refused; word
problems are accepted and honestly labelled "not machine-verified". Only the lesson's author or an admin can manage them (tested
for visitors, students, other teachers, admin). The tutor sees the teacher's mistake notes for that question, as data.

**H: adaptive mastery loop.** The tutor recommends practice after three confusions, or harder practice to a proficient student, and
shows a "Practise <skill>" button that starts a session containing only that skill; answers update that skill's mastery. When no
question is open it targets the student's weakest skill WITH EVIDENCE (an untried skill is not a weakness).

**I: voice** (`voice-controls.tsx`, `src/lib/voice.ts`). Speak a question (English PH, Filipino, English US): the words appear in the
question box for the student to check, then go through the same tutor as typing. Replies can be read aloud (new replies only), maths
symbols are spoken as words. Audio is never recorded by Tuklas; the browser's speech service may process it, and the interface says
so. The site now allows the microphone for itself only (`microphone=(self)`); camera and location stay blocked. The browser tests
inject a SCRIPTED speech engine, so they prove the wiring, the permission-error messages and the typing fallback, **not** a real
microphone.

**J: the full loop** now runs on the teacher's OWN lesson: build the lesson (content, check, video link, notes, captions, 4 practice
questions), publish, class, join, assign, complete the check, grounded tutor, practise with an error and a strategy change, teacher
insights. The earlier product gap (teacher lessons could not be practised) is closed.

**Production content path.** `npm run content:load -- --author-email=<teacher> --confirm` loads the 5 Term 1 lessons and 144 practice
questions into a real database (dry run by default, prints only the DB host, idempotent, updates rows in place). The dev seed uses the
same loader.

## 4. Hardening (K): done and not done

| Done (tested) | |
|---|---|
| Login no longer reveals whether an email has an account: a hash is computed for unknown emails too, and an unknown email now **locks after 5 failures like a real account** (a lock-out difference was a second, real leak found by the new test) | `tests/hardening.test.ts` |
| `analyze-mistake` is server-authoritative: only the student's own, answered, wrongly-answered question; the client can no longer send question text or a "correct answer" (it was a free AI proxy) | `tests/hardening.test.ts` |
| One automatic retry for provider 5xx / dropped connection; never for 4xx, 429 or timeout | `tests/ai/tutor-request-audit.test.ts` |
| Token usage and model id stored for every tutor AI call (cost can be measured) | same |
| `.env.example` is committed (it had been ignored); keys cannot reach a real model during `npm test` | `.gitignore`, `vitest.config.ts` |

**Not done (be aware):** CSRF relies on `SameSite=Lax` cookies only (no Origin/token check); rate limits and the unknown-email lock are
per server process; no backups, restore test, monitoring or alerting; no load or performance test; no privacy notice, consent,
retention or deletion tool (`PRIVACY_AND_DATA.md`); no per-day or per-class AI budget; three unwired AI endpoints remain
(`generate-lesson`, `analyze-transcript`, `generate-question`), authenticated and rate-limited but not used by any page and not
grounded in a lesson.

## 5. REAL / SIMULATED / PARTIAL / MISSING / NOT VERIFIED

**REAL (code + tests + real browser):** accounts and roles; classes, join codes, assignments, admin; lesson authoring (content,
checks, video link, documents, captions, practice questions); publishing; student practice, mistakes, mastery, adaptive selection and
targeted sessions; teacher analytics; the tutor's state, teaching policy, hint ladder, answer protection, reply guards, repeat guard
and honest rule-based fallback; lesson-grounded context selection; document and caption extraction into the prompt; five fixed
security items above; 144 computed Term 1 practice questions (every answer re-derived independently).

**SIMULATED:** every AI reply in every browser test (a local fake model server); the speech engine in the voice browser tests.

**PARTIAL:** adaptivity beyond integers (the rule-based fallback and mistake classifier understand integer operations; other lessons
get generic strategy text without a live model); prerequisite review (generic, no skill map); targeted practice (selected from the
bank, not AI-generated); document intelligence (no OCR); CSRF, rate limiting, analytics at scale.

**MISSING:** consent/privacy/retention tooling; school and tenant model, SSO, roster import; content review workflow; principal or
division reports; Filipino interface; offline use; monitoring, backups, support process; AI-generated lesson-specific practice.

**NOT VERIFIED:** **a real AI model with this tutor** (no key: the harness `RUN_LIVE_AI=true npm run test:live` is ready and stamps
its evidence honestly); real phones and a real microphone; real teachers; real students; the accuracy and fitness of the Phase 12
lessons (no teacher has reviewed them); credential rotation; production deployment; load.

## 6. Known limitations
Detection of "same answer" and "I understand" is rule-based and numeric/phrase-based. Lexical retrieval misses paraphrases. State is
per conversation, so a new question starts clean. All content and tutor text are English. The mastery engine marks a skill
"Developing" after 4 answers with 3 correct; whether that threshold suits real classrooms is unknown. A game or other heavy process
on the development PC makes browser tests time out; the Playwright expect timeout is 20 s because of it.

## 7. What only you can do (in order)
1. **Rotate** the Neon password and Vercel token that were in the original zip.
2. **Put an AI key** in `.env.local` and run `RUN_LIVE_AI=true npm run test:live`. Read `docs/evidence/phase-c/live-run-*.json`
   (grounding, Socratic behaviour, the repeated-answer pair). Until then, everything about AI quality is unproven.
3. **Have a teacher review** the five Term 1 lessons and 144 questions before any student sees them.
4. Test on **real phones, a real microphone** and a slow connection (`PILOT_PLAN.md`).
5. Settle **privacy and consent** for minors (`PRIVACY_AND_DATA.md`), then deploy per `DEPLOYMENT_RUNBOOK.md`.
6. Run a small supervised **pilot** (one teacher, one class) and measure (`PILOT_PLAN.md`) before approaching a school or DepEd.

## 8. Next recommended phase and why
**C, run by you: live AI verification.** It is the single largest unknown: the tutor logic, the plan sent to the model and every
guard are built and tested, but nobody has seen a real model use them. Its result decides what to tune next (prompt wording, plan
strictness, retrieval). After that: the pilot preconditions in `PILOT_PLAN.md`. Do not build school/DepEd features before pilot
evidence exists.

## 9. Commits (this repository)
`f69cfa4` Phase D; the final stretch (E, F, H, I, J, K, content path, documents) is committed as the last commit on `master`.

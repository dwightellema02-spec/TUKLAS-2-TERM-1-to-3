# TUKLAS AI — REAL BASELINE REPORT

Repository: `tuklas-v2`, audited at the Phase 14 close (2026-10-04). Method: source reading, probes, the full automated suite and a
real-browser end-to-end test. **No phase report was used as evidence.** Labels: REAL / SIMULATED / PARTIAL / MISSING / BROKEN /
NOT VERIFIED. "Real" means executable in the current repository and backed by tests, database behaviour or browser evidence.

## 0. Status header

| | |
|---|---|
| **Current phase** | B: Real Baseline Audit (owner master plan A-N, 14 phases) |
| **Completed** | A: Phase 14 closed. Engineering phases 6-14 built (reports in `docs/`) |
| **Remaining** | C live AI, D adaptive Socratic tutor, E lesson-grounded AI, F practice authoring, G document intelligence (partly built), H adaptive mastery loop, I voice, J full-loop sign-off, K hardening, L pilot, M school/DepEd, N productization |
| **Tests passed** | 807 / 807 Vitest (43 files); typecheck, lint, production build clean; no schema drift (shadow-DB diff) |
| **Browser tests passed** | 84 / 84 Playwright (desktop + Pixel 5 emulation), including the new full-loop spec |
| **Real-world tests completed** | **None.** No live AI call, no physical device, no real teacher or student |

## 1. What is REAL

| Capability | Evidence |
|---|---|
| Accounts, sessions, roles, ownership (class, student, document, lesson) | API tests; browser: cross-teacher 404/403 over HTTP (`classroom.spec.ts`) |
| Database + 13 migrations rebuilt from scratch on every test run; test DB isolated (`_test` names enforced) | `tests/global-setup.ts`, `vitest.config.ts`, `playwright.config.ts` |
| Student practice from a lesson bank, mistakes recorded, evidence-based mastery, adaptive question choice | `student-journey.spec.ts`, mastery unit tests |
| Classes, join codes, assignments, admin console with audit log | `classroom.spec.ts` |
| Teacher analytics (Phase 14) | 10 exact-figure tests; browser |
| **Teacher authoring through the UI:** create a lesson, edit content, add a graded knowledge check, attach a YouTube link, upload notes and captions, publish | `full-loop.spec.ts` step 1 (real browser, real DB) |
| Class workflow: create class, student joins by code, teacher assigns the teacher-made lesson, student completes its check (server-graded) | `full-loop.spec.ts` steps 2-3 |
| Document pipeline: validate bytes, extract (digital PDF, DOCX, text/Markdown, SRT/VTT), clean, chunk, store only text, retrieve, put into the tutor prompt as labelled data | documents/transcript tests; step 5 shows the teacher notes AND timed captions reaching the model request |
| Honest no-AI behaviour: no key means a labelled "Automatic hint (not AI)", never a fake AI reply | `ai.ts:59-62`, `tutor.service.ts:235-253`, `tutor-adaptation.test.ts` (7 tests, key deleted) |
| Answer protection: key withheld from students until answered; tutor reply guard; answer-stating document chunks dropped while a question is open | tutor/documents API tests |
| Teacher secrets hygiene: no `.env` file is tracked; history scan (DB URLs, `sk-ant-`, `AIza`, `npg_`, `vercel_`) finds only dummy test fixtures | `git ls-files`, `git grep` over all commits (patterns only; not a substitute for a dedicated scanner) |

## 2. What is SIMULATED

| Item | Why |
|---|---|
| **Every AI reply in every browser test** | `e2e/fake-ai-server.mjs` answers locally (e.g. "Hint 2 from the fake tutor", "number line" when told to change strategy). Those tests prove what the app SENDS and how it labels and guards the reply, not that a model can teach |
| Stubbed provider in `tutor-adaptation.test.ts` and `tutor-api.test.ts` | Network edge replaced; only the request is real |
| The no-key fallback tutor | Real code, but it is rules, not intelligence. Labelled as such in the UI |

## 3. The 14 AI questions (answered from code and probes)

| # | Question | Answer | Label |
|---|---|---|---|
| 1 | No key: what happens? | `requestAiText` throws 503 (`src/server/ai.ts:59-62`); `TutorService.help` catches it and returns an automatic hint, saved with `source: AUTOMATIC` | REAL |
| 2 | Fallback or real LLM? | Both paths exist. Without a key it is the deterministic fallback (`src/server/tutor/fallback.ts`) | REAL |
| 3 | What do browser tests exercise? | The fake AI server only | SIMULATED |
| 4 | Fake servers? | Yes: `e2e/fake-ai-server.mjs` on :3401 via `ANTHROPIC_BASE_URL` | SIMULATED |
| 5 | Conversation context? | Last 8 messages are put in the prompt (`tutor.service.ts:186-196`); proven by test that turn 2 and 3 requests contain earlier replies | REAL path / NOT VERIFIED quality |
| 6 | Detect repeated student mistakes? | No. Skill flags (`repeatedSignErrors`, `repeatedConceptual`) are passed to the model as text (`prompt.ts:191-196`). Nothing compares a student's attempts: the model is NOT told "same answer as before" (test: `T2 ... model is never told`) | PARTIAL |
| 7 | Change strategy? | Only when the student types an explicit "still don't get it" style phrase (regex, `intent.ts`, `ladder.ts:85-86`). Test shows rung rises and the reply switches to the alternate explanation | PARTIAL |
| 8 | Avoid repeating itself? | **BROKEN in the fallback.** Probe: the same wrong answer twice gets the identical reply (`t2.text === t1.text`); nine plain hint requests end in identical replies once the ladder caps at rung 6. For a live model the only protection is a prompt sentence ("do not repeat an earlier reply") | BROKEN / NOT VERIFIED (live) |
| 9 | Generate questions from the lesson? | `POST /api/ai/generate-question` exists but takes a free-text topic, is not tied to the lesson or documents, and **nothing in the UI calls it** | PARTIAL, unwired |
| 10 | Use teacher materials? | Yes, retrieved chunks enter the prompt (`tutor.service.ts:203-211`), step 5 shows it. Lexical matching only | REAL path / NOT VERIFIED quality |
| 11 | PDF/DOCX content? | Extracted and indexed (real MATATAG PDFs extracted earlier: 110 chunks). Digital PDFs only | REAL (text) / MISSING (OCR) |
| 12 | Video captions? | Teacher-supplied `.srt/.vtt` only, with time ranges. No fetching from YouTube, no speech-to-text, not linked to the attached video | PARTIAL |
| 13 | Adapt on mastery? | Mastery levels are listed in the prompt; they do not change the rung, the strategy or the next question inside the tutor | PARTIAL |
| 14 | Hint -> different explanation -> prerequisite review -> targeted practice? | Hint, guiding question, concept, partial solution, worked example, full explanation exist (`ladder.ts`). **Prerequisite review and targeted-practice generation do not exist** | PARTIAL, then MISSING |

### The owner's repeated-reply problem: four-turn regression (`tests/tutor-adaptation.test.ts`, passes today by pinning the defects)

| Turn | Student | What the code does today | Verdict |
|---|---|---|---|
| T1 | wrong answer proposed | `CHECK_ANSWER`, rung 1, "Hints do not check answers..." | works as designed |
| T2 | the same wrong answer again | same intent, same rung, same text | **BROKEN: identical reply, no state change** |
| T3 | "I still don't understand" | rung up, `changeStrategy`, a different (number-line) explanation | REAL transition |
| T4 | "I get it now, signs decide" | no "understood" intent, so it is `OTHER`: the rung rises again and the tutor hands over the rule | **BROKEN: does not move forward** |

With an AI provider (network stubbed): turn 2 and 3 requests carry the earlier turns (REAL), `changeStrategy` reaches the model only on T3
(REAL), but T2's rules are identical to T1's (BROKEN). The tutor's stored state is a single integer, `ChatConversation.hintLevel`
(`prisma/schema.prisma:789-805`): there is no strategy, misconception, attempt count or confidence, so the adaptive state machine in
the master plan (phase D) **does not exist**. The tests are written so that building it turns them red, which is the signal to flip them.

## 4. Module audit

### A. Foundation: REAL
Auth, roles, migrations, isolated test DB, security headers (`next.config.mjs`). Phases 1-5 have no reports of their own (they arrived in
the original snapshot); their code is covered by the current suite, not independently re-derived.

### B. Student learning engine: REAL for the seeded content
The bank covers 6 lessons (integers + 5 Term 1 lessons, 192 computed questions). Mistake classification and the tutor fallback are
**integer-only** (`mistake-classifier.ts`, `fallback.ts:157`): in the five Term 1 lessons a wrong answer is recorded as "Concept not yet
understood" and the no-AI tutor gives generic prompts. **PARTIAL** outside integers.

### C. AI system: see section 3. Live provider: **NOT VERIFIED**
Provider selection (Anthropic or Gemini by `AI_PROVIDER`, `src/server/ai-providers/index.ts`) and the request/timeout/error mapping are
implemented. **No API key exists in this environment; no live call has ever been made; latency, cost, quality, safety of real output
and the real provider's response shape are all unproven.** I did not simulate a live call.

### D. Teacher intelligence: PARTIAL
Authoring, class, assignment and analytics are real (section 1). Gaps found by the full-loop test:
1. **No way to author practice questions.** The studio has content, knowledge checks, video link and documents. The comment in
   `practice.service.ts:73` ("teacher-authored practice bank") is not true: the bank comes from the seed.
2. **The student UI offers "Practice this lesson" on a lesson that cannot be practised.** It answers 409 "This lesson has no practice
   questions yet." (`practice.service.ts:98`, step 4). Honest, but a dead end.
3. Captions are an uploaded document, not attached to the YouTube link, and nothing fetches them.
4. A teacher-made lesson has no learning objectives or skills, so mastery and analytics skills never cover it (not yet verified in the UI;
   the studio has no objective or skill editor).
5. Assessments exist in the schema; no teacher UI for them was found: NOT VERIFIED.

### E. Content intelligence: PARTIAL
SUPPORTED: digital PDF, DOCX, TXT/MD, SRT/VTT. PARTIAL: video (captions by hand). MISSING: OCR / scanned PDF, PPTX, XLSX, images,
equations in PDFs (flattened to text), semantic (embedding) retrieval, per-class document scope.

### F. Adaptive tutor: PARTIAL (see section 3, rows 6-8, 13-14)

### G. Production readiness: NOT READY
| Item | Label | Evidence |
|---|---|---|
| Production has **no way to load curriculum**: the Term 1 and integer content exist only in `prisma/seed.ts`, which refuses to run in production or without `ALLOW_DEMO_SEED` (`seed.ts:16-21`) | BROKEN for production | seed code |
| `.env.example` was never committed: `.gitignore` re-ignored it (`.env*` after `!.env.example`) | BROKEN, **fixed** | `git check-ignore`; the file is now trackable |
| Microphone blocked for the whole site: `Permissions-Policy: microphone=()` (`next.config.mjs:26`) | by design until voice | source |
| Rate limiters (`rate-limit.ts:9`, `ai.ts:9`) are per-process memory: reset on restart, not shared between serverless instances | PARTIAL | source |
| `/api/health` leaks nothing (`{service, status}`) | REAL | `health/route.ts` |
| CSRF protection, full IDOR sweep of every route, structured logging, monitoring, backups, data-retention and privacy policy (students are minors), load/performance tests | NOT VERIFIED / MISSING | not examined or no artefact |
| Neon and Vercel credentials from the original zip rotated | **NOT VERIFIED, OWNER ACTION** | cannot be checked without contacting them; this audit never did |
| Production environment variables (`AUTH_SECRET`, `TRUSTED_PROXY_HOPS`, `TEACHER_INVITE_CODE`, AI key; `ALLOW_DEMO_SEED` never set) | NOT VERIFIED | owner checklist in `SECURITY.md` / `.env.example` |

### H. Known security defects (re-checked)
| Defect | Label | Evidence |
|---|---|---|
| Login timing reveals whether an account exists: a hash is verified only when the user exists and is active | **BROKEN (confirmed by source)**, not fixed | `src/app/api/auth/login/route.ts:71` short-circuits before `verifyPassword` |
| `analyze-mistake` trusts the caller's `correctIndex`, question and options, and lets any signed-in student send arbitrary text to the model (a free LLM proxy, capped only by an in-memory 20/minute limiter) | **BROKEN (confirmed by source)**, not fixed; nothing in the UI uses it | `api/ai/analyze-mistake/route.ts:15-42,64-69` |
| Unwired AI endpoints (`generate-lesson`, `analyze-transcript`, `generate-question`, `analyze-mistake`) exist, authenticated and rate-limited, but have no UI caller | PARTIAL; either wire or remove | grep of `src` outside `api/` is empty |

I did not run exploit tests for these two; the classification rests on the code paths cited. They were not fixed here because the
baseline phase stops before functional changes.

### I. Features claimed by old repositories and phases
| Old claim | State in V2 | Evidence |
|---|---|---|
| Voice tutor | **MISSING** | no `SpeechRecognition`, `speechSynthesis` or `getUserMedia` anywhere in `src`; microphone blocked |
| MathIsipan integration | **MISSING** | no occurrence in `src` |
| Real-user pilot system, consent | **MISSING** | no pilot or consent code |
| Research analytics | **MISSING** (class/student analytics exist) | grep: only incidental words |
| Advanced adaptive AI tutor | **PARTIAL** (ladder + intent + prompt context; no state machine) | section 3 |
| Document intelligence | **PARTIAL** (text extraction and lexical retrieval; no OCR) | section 4E |
| AI lesson generation / transcript analysis | **PARTIAL**, API only, unwired | section 4H |

## 5. The full loop, hop by hop (`e2e/full-loop.spec.ts`, desktop + phone)

| Hop | Result |
|---|---|
| Teacher creates lesson, content, knowledge check, video link | REAL |
| Teacher adds notes and captions | REAL |
| Teacher publishes | REAL |
| Teacher creates class, student joins, lesson assigned | REAL |
| Student opens lesson, answers check (first wrong, then right), completes | REAL |
| **Student practises the teacher's lesson** | **PRODUCT GAP** (no practice bank, no way to author one) |
| Student asks the tutor: model request contains lesson text, notes, timed captions | REAL request; the reply is SIMULATED |
| Student errs, asks again, tutor strategy changes, student improves | REAL transition in the app; **only possible on the seeded lesson**, so it is labelled a gap, not a pass for the teacher's lesson |
| Teacher sees insights | REAL after one fix (practised-only lessons were missing; found by this test) |

## 6. NOT VERIFIED (nothing here may be called done)
Live AI provider (any model); model paraphrasing, safety and correctness with real output; real devices (phones, tablets, school
laptops); real microphone; real teachers and students; accuracy and fitness of the Phase 12 Term 1 lessons (no teacher has reviewed
them); credential rotation; production deployment; load; CSRF; backups.

## 7. Known limitations
Content is Claude-drafted and unreviewed. Lexical retrieval misses paraphrases. Classifier is integer-only. Single in-process rate limits.
Tests run against Chromium emulation, not real phones. The AI is simulated in every browser test.

## 8. Priority gaps (highest first, by evidence)
1. **The tutor cannot be shown to work with a real model** (no key). Everything about AI quality is unknown.
2. **No adaptive state:** one integer. Same-answer-twice, understanding, prerequisite review and targeted practice do not exist (BROKEN/MISSING).
3. **Teachers cannot author practice questions**, so any lesson they make is a dead end for practice, mastery, adaptation and analytics skills.
4. **No production content path** (seed is demo-gated).
5. Tutor and classifier are integer-only; five new lessons get generic help.
6. Two confirmed security defects (login timing, `analyze-mistake`) and unwired AI endpoints.
7. Voice, device testing, pilot: later, by owner order.

## 9. Recommended next phase and why

**Phase C: Real AI provider verification**, then **D: Adaptive Socratic tutor**.
Why C first: every AI claim is unproven, and D must be designed against how a real model actually responds. It needs one thing from the
owner: an Anthropic or Gemini key in `.env.local` (plus `GEMINI_MODEL` if Gemini). Without a key, C stays NOT VERIFIED and the next
engineering step should be **D with the AI simulated**: add the structured tutor state (strategy, attempt count, last attempt,
misconception, understanding detection) so that the four-turn test in `tests/tutor-adaptation.test.ts` flips from "pinning the defect" to
passing, then F (teacher practice authoring), because gap 3 blocks the whole teacher-to-student loop.

## 10. Owner actions (cannot be done by me)
Rotate the Neon database password and the Vercel token that were in the original zip; supply an AI key; have a teacher review the Term 1
lessons; decide whether to wire or remove the four unwired AI endpoints.

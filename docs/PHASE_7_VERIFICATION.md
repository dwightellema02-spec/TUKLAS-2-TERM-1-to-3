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

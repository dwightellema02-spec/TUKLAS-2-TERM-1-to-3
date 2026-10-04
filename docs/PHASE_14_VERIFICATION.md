# TUKLAS AI — PHASE 14 VERIFICATION REPORT

**PHASE:** V2 Phase 14 — Teacher analytics (class insights and student detail)
**OBJECTIVE:** Master plan §20-21: a teacher sees, from real student records only, how their class is doing: activity, skills,
questions that were hard, common mistakes, lessons worked on, and one student's evidence.

## IMPLEMENTED

1. **Class insights** (`src/services/class-insights.service.ts`, `GET /api/classes/[id]/insights`, `src/components/class-insights.tsx`):
   14-day activity by Manila calendar day; skills weakest first with the mastery spread and "not started" counts; hard questions
   (listed only with at least 3 attempts by at least 2 students and under 75% correct, with the most chosen wrong answer, never naming
   a student); mistake categories; lessons worked on (completed, in progress, practised).
2. **Student detail** (`GET /api/classes/[id]/students/[userId]`, page `/teacher/classes/[id]/students/[userId]`): skills with accuracy,
   unresolved mistakes by type, recent sessions (with "not finished" shown honestly).
3. **Access:** through `ClassService.requireClassAccess`. Visitors 401, students 403, another teacher 404 (not 403, so ids cannot be
   probed), a non-member student 404, an administrator allowed. Data of other classes never enters a result.
4. **Honest empty states:** an empty class, or students with no answers, show no skills, no hard questions and no invented numbers.

## DEFECTS FOUND AND FIXED (both found by browser tests, not by unit tests)

1. **Scrollable tables not reachable by keyboard** (axe `scrollable-region-focusable`, phone layout). The roster table already had this
   fault; the new skills table exposed it. All five `.table-scroll` containers are now focusable regions with a label.
2. **"Lessons the class has worked on" ignored practice.** A lesson practised but not completed never appeared. Found by the full-loop
   browser test. The service now includes lessons with practice sessions (`practised` count); regression test added.
3. Grammar: "1 answers" / "1 students" now singular.

## VERIFICATION

| Item | Status | Evidence |
|---|---|---|
| Exact figures from seeded rows (activity per Manila day incl. the 01:00-Manila boundary, window accuracy, skill accuracy and levels, hard-question rules, wrong-answer counts, mistake categories) | PASS | `tests/class-insights.test.ts`, numbers computed by hand before running |
| Empty class and no-evidence students | PASS | unit + browser |
| Isolation between classes; role and ownership rules on both routes | PASS | unit (API level) + browser (cross-teacher 404 over HTTP) |
| Class insights and student page in a real browser, desktop and Pixel 5 | PASS | `e2e/classroom.spec.ts` |
| Accessibility (axe WCAG A/AA) of insights and student page; no sideways scroll | PASS | browser |
| Practised-only lesson listed | PASS | unit regression + `e2e/full-loop.spec.ts` step 7 |

**AUTOMATED TESTS:** 807 / 807 PASS (Vitest, 43 files; was 790)
**REAL BROWSER:** 84 / 84 PASS (Playwright/Chromium, desktop and Pixel 5 emulation; includes the new full-loop spec)
**TYPECHECK:** PASS  **LINT:** PASS  **BUILD:** PASS  **DATABASE:** no schema change; `prisma migrate diff` against a fresh shadow database reported no difference
**REAL DEVICE:** NOT COMPLETED  **REAL USER:** NOT COMPLETED

## KNOWN LIMITATIONS

1. Mistake categories come from a classifier written for integer operations. In other lessons mistakes show as "Concept not yet
   understood" or "Not classified" (the page says so).
2. No export, no per-assignment view, no comparison between classes or over longer periods.
3. Skill accuracy is all-time; the activity chart and summary use the last 14 days.
4. Hard-question detection matches by identical question text, so questions that differ only in numbers are separate items.
5. Figures are computed on every page view from raw rows. That is fine for a class; it has not been load tested.

## REMAINING RISKS

See `docs/REAL_BASELINE_REPORT.md`.

## FINAL DECISION

**PHASE 14 CLOSED** for what it claims. Next: the baseline audit (`docs/REAL_BASELINE_REPORT.md`).

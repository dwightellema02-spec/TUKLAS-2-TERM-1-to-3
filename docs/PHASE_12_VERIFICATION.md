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

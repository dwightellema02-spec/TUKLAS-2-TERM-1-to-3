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

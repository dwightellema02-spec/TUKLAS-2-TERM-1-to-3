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

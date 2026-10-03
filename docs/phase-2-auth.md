# Phase 2 authentication and access control

Completed: 2026-09-25

## Existing system retained

Tuklas continues to use its Next.js App Router, Prisma, and PostgreSQL architecture. Registration, login, logout, session inspection, password hashing, role checks, and the root authentication UI already existed, so Phase 2 hardened and extended those pieces rather than introducing another identity provider. The existing `STUDENT`, `TEACHER`, and `ADMIN` enum is retained; public registration permits only student and teacher accounts, matching the existing registration UI and product flow.

## Authentication and session design

- Registration normalizes email to lowercase, validates the display name and password, enforces unique email, and creates the user and first session in one database transaction.
- Passwords use asynchronous PBKDF2-HMAC-SHA512 with 220,000 iterations and a unique random salt. Existing `salt:hash` records using 100,000 iterations remain verifiable and are upgraded after a successful login.
- Login uses the same error for unknown email and incorrect password. Successful login creates a 12-hour session.
- Session cookies are signed with the server-only `AUTH_SECRET`, HttpOnly, SameSite=Lax, Secure in production, and scoped to `/`. The signed payload contains user ID, session ID, and expiry; it does not carry the user's role.
- Existing pre-Phase-2 signed cookies do not contain a database session ID and will be rejected after rollout; users with an active old cookie must sign in again. User accounts and passwords remain intact.
- `AuthSession` records live in PostgreSQL. Every protected request validates the cookie signature and checks that the session record exists and has not expired. Logout deletes that row and clears the browser cookie, so replaying the old cookie no longer authenticates.
- Public responses use a safe user projection (`id`, email, display name, role); password hashes and session signing material are not returned.

## Profiles and roles

`GET /api/profile` reads only the authenticated user's profile. `PATCH /api/profile` changes only `displayName`; strict input validation rejects attempts to update role, email, password, or another user's ID. The home screen waits for the session check, shows the user's current role, supports display-name editing, and handles sign-out errors without claiming success.

Teacher registration remains available because the existing UI explicitly offers Student and Teacher registration and no teacher approval rule exists in the current requirements. The server accepts only those two roles and rejects `ADMIN`; after registration, profile APIs cannot change role. A deployment that needs private teacher onboarding must define that product rule before changing the current registration flow.

## Student and teacher identity

`User.id` is the stable identity for both account and role-specific ownership. There are no separate `Student` or `Teacher` profile models because the current roles do not have additional profile fields. `/api/auth/session` returns the authenticated user's safe `id` and current database role. Protected routes resolve the signed session subject to the current `User` row and check that row's role; identity and role are not accepted from request bodies or browser storage.

- For a student, `studentId` is the authenticated `User.id`. `PracticeSession`, `QuizAttempt`, `MasteryRecord`, and `ChatConversation` store that same ID in their `studentId` foreign key. The practice-session route ignores any client-supplied `studentId` and assigns the authenticated database user ID.
- For a teacher, `teacherId` is the authenticated `User.id`. `Class.teacherId` and `Lesson.authorId` reference that same `User.id`; lesson creation assigns the authenticated teacher's database ID.
- Existing `Class` and `ClassMember` models provide teacher-to-class and student-to-class relationships. Phase 2 does not add teacher APIs for reading student learning evidence or enforce class membership around such reads. Any future teacher access to student evidence must be scoped through those class relationships and assignments; teachers receive no blanket access through the current APIs.

These stable foreign-key relationships let future learning events be associated with the authenticated student without creating another identity or trusting an AI/client-provided ID.

## API access rules

- Public: `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/session` (returns 401 when unauthenticated), and `GET /api/health`.
- Authenticated: `GET/PATCH /api/profile`; `GET /api/lessons`; `GET /api/auth/protected`; `POST /api/ai/analyze-transcript`.
- Teacher/admin: `POST /api/lessons`, `GET /api/lessons/[id]`, and `POST /api/ai/generate-lesson`. Teachers can read only their own lesson details; admins retain the existing all-lessons access. List results are role-filtered: students get published lessons, teachers get their own, and admins get all.
- Student only: practice session and answer APIs, tutor, question generation, mistake analysis. Practice sessions and tutor conversations are queried by the authenticated student ID; answer submission verifies that the session belongs to the current student.

Authorization is performed in the route/data layer on every request. The root page is a public sign-in entry point; the private workspace is rendered only after session verification and private data is fetched from APIs that re-check the session. There are no separate Server Actions or private server page routes in the current application.

## Database change

Added the `AuthSession` table with a user foreign key (`ON DELETE CASCADE`), unique session ID, expiry, creation timestamp, and indexes for user/expiry and expiry cleanup. Migration `20260925120000_add_auth_sessions` was applied to the existing Preview database, and Prisma reports all three migrations up to date there. Production was not modified. Apply this migration to Production in the release workflow before deploying code that queries `AuthSession`; users with old cookies will need to sign in once after rollout.

## Verification

- Full Vitest run, including the opt-in database integration suite: **7 files, 43 tests passed** against the existing Preview database.
- Coverage includes registration, duplicate and invalid input, public ADMIN rejection, safe user output, valid and invalid login, unknown-account error parity, legacy password upgrade, valid/invalid/expired sessions, logout plus stale-cookie replay rejection, authenticated identity resolution, self-only profile read/update, role mutation rejection, role-specific lesson/practice access, server-derived student and teacher ownership, cross-student practice ownership, and database integration.
- `npm run typecheck` — passed.
- `npm run lint` — passed.
- `npm run db:validate` — passed.
- Preview migration status — all migrations applied.
- `npm run build` — passed; `/`, `/api/profile`, and all existing routes compile.
- A first database test attempt encountered a transient Neon connection reset during cleanup; the affected case passed on retry and the complete suite then passed. Vitest also emits a non-blocking config-loader warning.

## Remaining requirements for Phase 3

- Apply the new AuthSession migration to Production before deploying this revision; Production was not changed in Phase 2.
- Add password reset and verified-email workflows only after the product selects its mail delivery flow. There is no account-disabled field in the current schema.
- Decide whether public teacher registration remains the intended policy. Do not invent an approval step without product direction.
- Replace process-local login/registration/AI throttles with a shared limiter before running multiple application instances, and configure a trusted proxy address source.
- Extend the authenticated workspaces with the product features planned next; student lesson detail is not yet available through the lesson-detail endpoint, which is currently teacher/admin-only.
- Run a post-deployment smoke test for student and teacher registration, login, profile update, role-specific access, and logout against the Production database after the migration is applied.

Phase 2 stops here. No deployment, push, or commit was performed.

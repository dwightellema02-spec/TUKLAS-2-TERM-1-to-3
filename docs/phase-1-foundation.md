# Phase 1 foundation audit

Audit date: 2026-09-25

## Scope and current shape

The application is a Next.js App Router project. The live root route (`src/app/page.tsx`) is the current authenticated application shell; it checks the session, supports sign-in and account registration, and loads lesson metadata from `/api/lessons`. The preserved `/prototype/index.html` is a separate static reference with demo data. Its remaining sample workflows are not production-backed, so it should not be presented as the completed student or teacher workspace.

The Prisma schema is PostgreSQL-backed and has an initial schema migration plus a migration that secures practice questions. `prisma/seed.ts` intentionally seeds no records. The schema includes users, classes and memberships, lessons and their sections/vocabulary/checks, quiz questions and attempts, assignments, practice sessions and answers, mastery records, and tutor conversations/messages.

## API and server boundaries

All API responses use the `{ success, data, error }` envelope. Route validation uses Zod and persistence is through the server-only Prisma client in `src/server/db.ts`.

| Route                                 | Methods and access   | Behavior                                                                                                                                |
| ------------------------------------- | -------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `/api/health`                         | GET, public          | Liveness only; it does not check PostgreSQL.                                                                                            |
| `/api/auth/register`                  | POST, public         | Validates and creates student/teacher accounts; rate limited.                                                                           |
| `/api/auth/login`                     | POST, public         | Validates credentials and sets the signed session cookie; rate limited.                                                                 |
| `/api/auth/session`                   | GET, public          | Returns the current session or unauthenticated state.                                                                                   |
| `/api/auth/protected`                 | GET, authenticated   | Example protected route.                                                                                                                |
| `/api/auth/logout`                    | POST, public         | Clears the session cookie.                                                                                                              |
| `/api/lessons`                        | GET, authenticated   | Student sees published lessons; teacher sees their own lessons; admin sees all lessons. Returns list metadata, not lesson body content. |
| `/api/lessons`                        | POST, teacher/admin  | Creates a validated lesson and nested content.                                                                                          |
| `/api/lessons/[id]`                   | GET, teacher/admin   | Reads lesson detail; a teacher can read only their own lesson.                                                                          |
| `/api/practice/sessions`              | POST, student        | Starts practice for an eligible published lesson.                                                                                       |
| `/api/practice/sessions/[id]/answers` | POST, owning student | Validates and records an answer and updates the session transactionally.                                                                |
| `/api/ai/analyze-transcript`          | POST, authenticated  | Validated transcript analysis.                                                                                                          |
| `/api/ai/generate-lesson`             | POST, teacher/admin  | Returns a validated draft for review; does not publish it.                                                                              |
| `/api/ai/tutor`                       | POST, student        | Tutor exchange persisted to the signed-in user's conversation.                                                                          |
| `/api/ai/generate-question`           | POST, student        | Validated question generation.                                                                                                          |
| `/api/ai/analyze-mistake`             | POST, student        | Validated mistake analysis.                                                                                                             |

`src/server/auth.ts` holds password hashing, session signing/verification, cookie helpers, and response helpers. The cookie is HttpOnly, SameSite=Lax, lasts 12 hours, and is Secure in production. Authentication is a custom signed stateless session; there is no server-side session revocation store or password recovery/email verification flow. Registration currently permits both student and teacher roles.

`src/server/ai.ts` is server-only and calls the Anthropic Messages API. The key is read only on the server, requests time out after 20 seconds, and the default model is `claude-haiku-4-5-20251001`. Input/output validation and safe provider errors are implemented. AI and auth request throttles are in-memory per process; a shared store is needed for reliable limits across multiple instances. No live paid provider request was made during this audit; AI route tests mock provider responses.

## Configuration and data safety

The server requires `DATABASE_URL` and `AUTH_SECRET` (at least 32 characters). `ANTHROPIC_API_KEY` is optional unless AI routes are to be used; `ANTHROPIC_MODEL` is optional. `.env.example` contains placeholders only. Local Prisma CLI and Vitest configuration load `.env.local`, and preserve already-exported process variables, rather than silently loading `.env` as a production database fallback. A production migration must be run in an explicitly configured release environment.

`.env`, `.env.local`, `.env.*`, `.vercel`, `.neon`, and log files are ignored. No browser code exposes server credentials as `NEXT_PUBLIC_` variables; `.env.example` contains placeholders only. Environment file contents are intentionally omitted from this document. `/api/health` is a liveness check, so use `npm run db:check` to verify a configured database connection.

## Validation run

Against the configured local/Preview database:

- `npm run typecheck` — passed.
- `npm run lint` — passed.
- `npm run db:validate` — passed.
- `npm run db:check` — passed; database connection verified.
- `npx prisma migrate status` — passed; schema is up to date on that database.
- Full Vitest run with the opt-in integration suite enabled — 7 files and 35 tests passed, including database create/read/cleanup. Remote database test and hook timeouts were increased to 30 seconds and cleanup was narrowed to test-owned records after the first run exposed latency-sensitive failures. The shared nested-question validator was corrected to retain the required question position.
- `npm run build` — passed; Next.js compiled the root page and all API routes.

The initial full test run exposed remote database latency timeouts and the missing nested question position. Those issues were fixed, and the complete suite then passed. Vitest emits a non-blocking configuration-loader warning in this environment.

## Remaining Phase 1 limitations

- The root shell lists lessons but does not yet provide a complete student lesson-reading route or integrated teacher authoring workspace.
- The practice API accepts sessions and answers but has no history/list endpoint or full learner UI.
- Quiz, mastery, class, assignment, and the rest of the learning workspace remain schema/API or product-integration work; they are not complete user-facing features.
- The static prototype still contains demo flows and must be treated as a reference. Its tutor entry now calls the authenticated tutor API, but other prototype AI actions are not production-connected.
- Rate limits are process-local. Production multi-instance operation needs a shared rate-limit store and trusted proxy configuration.
- Production migration and external hosting behavior were not changed or verified by this audit. The current changes have not been deployed.

Phase 1 foundation work stops here. Phase 2 should start only after reviewing these remaining product and operational gaps.

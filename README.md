# Tuklas V2

Tuklas V2 full-stack foundation for the Tuklas learning ecosystem.

## Architecture & Security (Phases 1, 2, and 3)

Tuklas 2.0 adopts a clean, decoupled three-tier architecture structured around the Philippine K-12 learning loop:
**Discover → Learn → Understand → Practice → Assess → Analyze → Review → Master**.

See [ARCHITECTURE.md](ARCHITECTURE.md) for full architectural documentation, domain hierarchy, and API standards.
See [SECURITY.md](SECURITY.md) for the authorization matrix, session lifecycle, and security policies.

### Key Architecture Components:

- **Decoupled Service Layer**:
  - `src/services/curriculum.service.ts`: Structured curriculum querying (Grades, Terms, Units, Competencies).
  - `src/services/lesson.service.ts`: Multi-section lessons with safe student projection (anti-cheating protection for formative checks/quizzes).
  - `src/services/practice.service.ts`: Interactive practice session tracking and transactional scoring.
- **Centralized Configuration Guard**:
  - `src/config/env.ts`: Validates environment configuration during server boot without leaking secret credentials.
- **API Pipeline & Error System**:
  - `src/lib/api-handler.ts`: Unified route handler enforcing authentication, authorization, validation, and standardized JSON envelopes.
  - `src/lib/errors.ts`: Typed domain error classes (`ValidationError`, `AuthenticationError`, `AuthorizationError`, `NotFoundError`, `ConflictError`, `DatabaseError`, `AiError`).
- **Domain & API Type System**:
  - `src/types/domain.ts`: Comprehensive types for Users, Profiles, Curriculum, Lessons, Practice, Quizzes, Mastery, and AI.
  - `src/types/api.ts`: Standardized response envelopes (`ApiResponse<T>`, `ApiSuccessResponse<T>`, `ApiErrorResponse`).
- **Database & Authentication**:
  - PostgreSQL hosted on Neon with connection pooling via Prisma ORM 6.x.
  - Signed, revocable HttpOnly cookies with role-based access control (`STUDENT`, `TEACHER`, `ADMIN`).
- **Server-Side AI Pipeline**:
  - Safe server-only Anthropic integration with rate limiting, input size limits, and structured schema validation.


## AI integration

AI requests run only on the server through the Anthropic Messages API. For local development, configure `DATABASE_URL` and a random `AUTH_SECRET` with at least 32 characters in `.env.local`; `ANTHROPIC_API_KEY` is needed only to use AI features. Never expose server secrets in browser code. `ANTHROPIC_MODEL` is optional and defaults to `claude-haiku-4-5-20251001`.

Endpoints:

- `POST /api/ai/analyze-transcript`
- `POST /api/ai/generate-lesson` (teacher/admin; returns a reviewable draft)
- `POST /api/ai/tutor` (student; persists approved chat messages)
- `POST /api/ai/generate-question` (student)
- `POST /api/ai/analyze-mistake` (student)

AI output is schema-validated, requests have input limits and per-user throttling, and provider failures/timeouts return controlled errors. Generated lesson drafts are not saved until a teacher submits reviewed content through `POST /api/lessons`. The preserved static prototype does not call Anthropic directly; production AI use must go through these authenticated server routes.

## Database schema (Phase 2)

The production PostgreSQL database foundation includes 36 tables covering the entire educational hierarchy:

- **Identity & Roles**: `User`, `StudentProfile`, `TeacherProfile`, `Session`
- **Curriculum & Classes**: `Subject`, `GradeLevel`, `Curriculum`, `Term`, `Unit`, `Class`, `ClassMember`
- **Lessons & Content**: `Lesson`, `LessonContent`, `LessonSource`, `LessonSection`, `LessonVocabulary`, `LessonCheck`
- **Practice & Assessment**: `PracticeQuestion`, `PracticeSession`, `PracticeAnswer`, `Assessment`, `QuizQuestion`, `QuizAttempt`, `AssessmentAnswer`
- **Learning Analytics & Mastery**: `LessonProgress`, `MistakeRecord`, `MasteryRecord`, `Assignment`
- **AI Ecosystem**: `ChatConversation`, `ChatMessage`, `AIInteraction`

## Development

```powershell
npm run dev
npm run typecheck
npm run lint
npm run test
npm run build

npm run db:validate
npm run db:generate
npm run db:check
npm run db:push
npm run db:seed
```

Set a development or Preview PostgreSQL `DATABASE_URL` in `.env.local` before running local database commands. Prisma and Vitest load `.env.local`; they do not silently fall back to `.env`, which may contain production configuration. For a production migration, supply the Production `DATABASE_URL` explicitly through the release environment, then run `npm run db:deploy`.

- **Curriculum & Lesson Studio (Phase 4)**:
  - Database-driven curriculum hierarchy: `Subject` → `GradeLevel` → `Term` → `Unit` → `Lesson`.
  - Role-based visibility: students view published lessons without answer keys; teachers view published lessons and manage their own drafts; admins oversee all content.
  - Ownership protection: teachers can only edit or archive their own lessons.
  - Non-destructive archival: archiving preserves student progress, attempts, answers, and mistakes.
  - Deterministic ordering: collision-safe reordering for units and lessons.
  - Dedicated `/curriculum` catalog page with instant keyword search and filters.

All 13 test suites (88 tests) run unconditionally via `npm test`:

```powershell
npm test
```

## Production deployment

This app requires a Node.js server and PostgreSQL; it cannot be deployed as a static export. Use Node.js 20.9 or newer. A deployment can run on any host that supports the Next.js Node server.

Configure these server-side environment variables in the hosting provider:

- `DATABASE_URL`: the production PostgreSQL connection string.
- `AUTH_SECRET`: a unique, random secret with at least 32 characters. Do not reuse the development value.
- `ANTHROPIC_API_KEY`: required only to enable AI endpoints.
- `ANTHROPIC_MODEL`: optional; defaults to `claude-haiku-4-5-20251001`.

For each release, install from the lockfile, apply committed migrations to the production database, build, and start the Node server:

```sh
npm ci
npm run db:deploy
npm run build
npm run start
```

### Recommended: Vercel and Neon

Vercel detects this Next.js app automatically. Connect the source repository to a Vercel project, then provision a PostgreSQL database through Vercel's Marketplace (Neon is the recommended starting point for this app). Set `DATABASE_URL` and a newly generated `AUTH_SECRET` in the Vercel **Production** environment; add `ANTHROPIC_API_KEY` only if production AI features should be enabled. Use a separate database for Preview deployments so preview code and migrations cannot affect production data.

Before routing a release to production, run `npm run db:deploy` against the production database, then let Vercel build and deploy the app. Keep database credentials and secrets in the provider's environment settings, never in source control or browser variables.

Run `npm run db:check` against the production database before routing traffic to the new release. `/api/health` is a liveness check and does not verify database connectivity.

Public registration is intended to allow both student and teacher accounts. Teacher accounts can create and publish lessons. The current rate limits are stored in process memory; use a shared rate-limit store before running multiple server instances, and ensure the hosting proxy sets a trustworthy `x-forwarded-for` header.

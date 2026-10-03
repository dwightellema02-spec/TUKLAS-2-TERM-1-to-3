# TUKLAS 2.0 — Architecture & System Design

**Tuklas 2.0** is an AI-powered, competency-based learning ecosystem tailored for the Philippine K-12 curriculum. This document details the technical architecture, domain hierarchy, data flow, security model, and API standards implemented in Phase 1 (Production Architecture & Technical Foundation).

---

## 1. High-Level Architecture Overview

Tuklas 2.0 is built on **Next.js App Router (Full-Stack)** with a decoupled three-tier architecture:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        Presentation Layer                              │
│  - App Router Pages & Layouts (`src/app/`)                             │
│  - Reusable UI Components (`src/components/`)                          │
│  - Student Learning Workspace & Teacher Management Studio               │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ HTTP / Fetch (JSON)
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        API & Service Layer                             │
│  - Unified Route Handler Pipeline (`src/lib/api-handler.ts`)            │
│  - Domain Services:                                                    │
│    • `CurriculumService` (Grades, Terms, Units, Competencies)          │
│    • `LessonService` (Lessons, Sections, Checks, Safe Projections)     │
│    • `PracticeService` (Interactive Practice, Score Transactions)      │
│    • AI Service (`src/server/ai.ts` - Mistake Analysis, Tutoring)      │
│  - Centralized Env & Config Validator (`src/config/env.ts`)            │
│  - Typed Error Hierarchy & Sanitization (`src/lib/errors.ts`)          │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ Prisma ORM 6.x
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                         Persistence Layer                              │
│  - PostgreSQL (Hosted on Neon Serverless)                              │
│  - Prisma Client with connection pooling (`src/server/db.ts`)          │
│  - Atomic Transactions for Practice Sessions & Progress Tracking       │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Domain & Curriculum Hierarchy

The domain structure follows a strict educational taxonomy aligned with the DepEd K-12 standards:

```
Curriculum / Subject (e.g. Science, Mathematics)
  └── Grade Level (Grade 7, 8, 9, 10, etc.)
       └── Term (Quarter 1, Quarter 2, Quarter 3, Quarter 4)
            └── Unit (Theme / Unit of Competency)
                 └── Lesson
                      ├── LessonSection[] (Structured content blocks)
                      ├── LessonVocabulary[] (Key terms with definitions)
                      ├── LessonCheck[] (Formative comprehension checks)
                      ├── PracticeSession[] (Formative adaptive practice)
                      ├── QuizQuestion[] / Assessment (Summative evaluations)
                      └── Competency / Skill mappings
```

### The 8-Stage Learning Loop

1. **Discover**: Browse curriculum by Grade, Term, and Unit via `/curriculum`.
2. **Learn**: Study structured lesson sections with rich explanations and curated video transcripts.
3. **Understand**: Check understanding with interactive comprehension checks and AI-powered Socratic tutoring.
4. **Practice**: Attempt adaptive practice sessions with immediate feedback and step-by-step hints.
5. **Assess**: Complete formal summative quizzes and evaluations.
6. **Analyze**: AI-driven mistake detection diagnoses specific conceptual errors and misconceptions.
7. **Review**: Targeted review suggestions and flashcard reinforcement based on error taxonomy.
8. **Master**: Competency mastery levels (0.0 to 1.0) update dynamically across the student profile.

---

## 3. Decoupled Service Layer

Business logic is isolated from HTTP handlers inside `src/services/`:

- **`CurriculumService` (`src/services/curriculum.service.ts`)**:
  - `getCurriculumHierarchy(subject?)`: Fetches structured grades, terms, units, and lesson summaries.
  - `getUnitDetails(unitId)`: Fetches a specific unit with associated lessons and competencies.

- **`LessonService` (`src/services/lesson.service.ts`)**:
  - `listLessons(filters)`: Queries published lessons with optional subject, grade, term, or unit filtering.
  - `getLessonById(id, role)`: Returns lesson content. **Crucial Security Feature**: Automatically sanitizes formative checks and quiz questions for `STUDENT` callers, removing `correctIndex` and `explanation` to prevent client-side answer harvesting.
  - `createLesson(data, authorId)`: Validates unit affiliation and creates comprehensive multi-section lessons with vocabulary and checks within a database transaction.
  - `recordProgress(lessonId, studentId, completed, score)`: Upserts student lesson progress and updates completion timestamps.

- **`PracticeService` (`src/services/practice.service.ts`)**:
  - `createSession(data, studentId)`: Initiates a tracked practice session linked to a lesson or standalone practice.
  - `recordAnswer(sessionId, data, studentId)`: Verifies answer correctness, computes score adjustments, and updates practice session state atomically.

---

## 4. API Request Pipeline & Standards

All API routes follow a standardized execution pipeline enforced by `createApiHandler` (`src/lib/api-handler.ts`):

```
Incoming Request
      │
      ▼
1. Authentication Check (Optional or Required via `requireAuth: true`)
      │ ── Failed ──► 401 AuthenticationError
      ▼
2. Role Authorization (`allowedRoles: ['TEACHER', 'ADMIN']`)
      │ ── Failed ──► 403 AuthorizationError
      ▼
3. Request Validation (`schema: z.ZodType<T>`)
      │ ── Failed ──► 400 ValidationError (with field-level error details)
      ▼
4. Service Logic Execution (`handler(req, ctx)`)
      │
      ▼
5. Standard Response Serialization:
      Success: { success: true, data: T, meta: { timestamp, requestId } }
      Error:   { success: false, error: { code, message, details? } }
```

### Standard Error Hierarchy (`src/lib/errors.ts`)

| Error Class | HTTP Status | Code | Usage |
|---|---|---|---|
| `ValidationError` | 400 | `VALIDATION_ERROR` | Schema validation failures (e.g. Zod) |
| `AuthenticationError` | 401 | `AUTHENTICATION_ERROR` | Missing or invalid auth session token |
| `AuthorizationError` | 403 | `AUTHORIZATION_ERROR` | Insufficient role permissions |
| `NotFoundError` | 404 | `NOT_FOUND` | Requested entity not found in database |
| `ConflictError` | 409 | `CONFLICT` | Unique constraint or state conflict |
| `RateLimitError` | 429 | `RATE_LIMITED` | Exceeded rate limit bucket |
| `DatabaseError` | 500 | `DATABASE_ERROR` | Prisma query or connection failure |
| `AiError` | 502 | `AI_SERVICE_ERROR` | LLM API timeout or provider failure |
| `InternalServerError` | 500 | `INTERNAL_SERVER_ERROR` | Unhandled runtime exceptions |

---

## 5. Security & Anti-Cheating Architecture

1. **Server-Side Validation**: All incoming payloads (JSON bodies, query parameters, path variables) are strictly validated using Zod before service entry.
2. **Safe Anti-Cheating Projections**:
   - Students querying `GET /api/lessons/[id]` receive clean lesson content with comprehension checks stripped of `correctIndex` and `explanation`.
   - Teachers and administrators receive the full answer keys and teaching notes.
3. **Session Management**:
   - Secure HttpOnly cookies signed with HMAC-SHA256 (`AUTH_SECRET`).
   - Server-side session verification against the database with revokability.
4. **Environment Configuration Guard**:
   - Centralized validation via `src/config/env.ts` during server startup.
   - Enforces min 32-character `AUTH_SECRET` and validates `DATABASE_URL` format.
   - Prevents leaking secret strings in error outputs and logs.

---

## 6. Deployment & Runtime Environment

- **Runtime**: Node.js 20.9+ LTS.
- **Database**: PostgreSQL 16+ on Neon (Serverless with pooling connection strings).
- **Hosting Targets**: Vercel Serverless / Node.js standalone container.
- **Build Pipeline**:
  - `npm run typecheck` (`tsc --noEmit`)
  - `npm run lint` (`eslint .`)
  - `npm run test` (`vitest run`)
  - `npm run build` (`next build`)

---

## 7. Phase 2 — Real Backend & Database Foundation

Phase 2 replaced prototype and mock layers with a production-grade PostgreSQL backend managed via Prisma ORM:

### 7.1 Database Models & Domain Hierarchy

1. **User & Identity Layer**:
   - `User`: Core authentication entity with role-based access (`STUDENT`, `TEACHER`, `ADMIN`) and active status flag.
   - `StudentProfile`: 1-to-1 extension with student number (LRN), grade level, section, and enrolled classes.
   - `TeacherProfile`: 1-to-1 extension with school, department, bio, and managed classes.

2. **Curriculum & Content Hierarchy**:
   - `Subject` → `GradeLevel` → `Curriculum` → `Term` → `Unit` → `Lesson`
   - `LessonContent`: Polymorphic content blocks (`TEXT`, `VIDEO`, `IMAGE`, `DOCUMENT`, `INTERACTIVE`) with media URLs and metadata.
   - `LessonSource`: Educational video attachments (e.g. YouTube) with video IDs, thumbnails, channels, and positions.
   - `LessonVocabulary`: Key term definitions for vocabulary acquisition.
   - `LessonCheck`: Formative in-lesson comprehension checks.

3. **Assessment & Attempt Tracking**:
   - `Assessment`: Summative assessments linked to lessons with `passingScore`, `timeLimitMinutes`, and `status`.
   - `QuizQuestion`: Formative and summative questions supporting `MULTIPLE_CHOICE`, `TRUE_FALSE`, `SHORT_ANSWER`, and `NUMERIC` types, with difficulties (`EASY`, `MEDIUM`, `HARD`), options, answers, and explanations.
   - `QuizAttempt`: Server-graded attempt records tracking score, passed status, duration, and submitted answers.
   - `AssessmentAnswer`: Granular per-question answer records storing submitted options, correctness, and points awarded.

4. **Student Progress & Mistakes**:
   - `LessonProgress`: Persistent status (`NOT_STARTED`, `IN_PROGRESS`, `COMPLETED`, `NEEDS_PRACTICE`, `MASTERED`), latest and best scores, practice and assessment attempt counts, and rolling mastery.
   - `MistakeRecord`: Diagnosed conceptual, computational, and procedural mistakes with submitted vs correct references and resolution tracking.
   - `MasteryRecord`: Competency mastery tracking with multidimensional metrics (understanding, accuracy, application, consistency).

5. **AI Interaction Persistence**:
   - `AIInteraction`: Server-logged AI requests (`TUTOR`, `QUESTION_GENERATION`, `MISTAKE_ANALYSIS`, `LESSON_DRAFT`, `TRANSCRIPT_ANALYSIS`) with input tokens, output tokens, latency, and status.

### 7.2 Core Domain Services

- **`AssessmentService` (`src/services/assessment.service.ts`)**:
  - `getAssessmentById(id, role)`: Delivers assessments with anti-cheating projection for students (stripping correct answers and explanations).
  - `submitAssessment(assessmentId, studentId, data)`: Executes atomic `db.$transaction` evaluating answers server-side, persisting attempts, creating granular answer records, generating `MistakeRecord`s on errors, and updating `LessonProgress`.
- **`ProgressService` (`src/services/progress.service.ts`)**:
  - `getStudentProgress(studentId, lessonId?)`: Aggregates completion rates, attempt counts, and lesson-specific metrics.
  - `updateProgress(studentId, lessonId, data)`: Updates status, scores, and mastery levels.
- **`MistakeService` (`src/services/mistake.service.ts`)**:
  - `getStudentMistakes(studentId, lessonId?, resolved?)`: Retrieves mistakes scoped strictly to the authenticated student.
  - `resolveMistake(mistakeId, studentId)`: Validates ownership and marks mistakes as resolved.
- **`StudentService` & `TeacherService` (`src/services/student.service.ts`, `src/services/teacher.service.ts`)**:
  - Manage profile retrieval, profile updates, and class associations.
- **`MasteryService` (`src/services/mastery.service.ts`)**:
  - Implements a rolling mastery algorithm weighted across 4 core educational dimensions:
    - Understanding (30%)
    - Accuracy (30%)
    - Application (25%)
    - Consistency (15%)

### 7.3 Phase 2 API Endpoints

| Method | Endpoint | Allowed Roles | Description |
|---|---|---|---|
| `GET` | `/api/assessments/[id]` | `STUDENT`, `TEACHER`, `ADMIN` | Fetches assessment (answer keys stripped for students) |
| `POST` | `/api/assessments/[id]/submit` | `STUDENT` | Submits answers for server-authoritative grading |
| `GET` | `/api/progress` | `STUDENT` | Retrieves student learning summary and metrics |
| `GET` | `/api/progress/lessons/[id]` | `STUDENT` | Retrieves detailed progress for a specific lesson |
| `GET` | `/api/mistakes` | `STUDENT` | Retrieves student mistakes with optional filters |
| `POST` | `/api/mistakes/[id]/resolve` | `STUDENT` | Marks an owned mistake as resolved |
| `GET` | `/api/profile` | Authenticated | Retrieves user profile with StudentProfile/TeacherProfile |
| `PATCH` | `/api/profile` | Authenticated | Updates user profile and profile metadata |

---

## 8. Seed Data & Test Accounts

Run `npm run db:seed` to populate the development database with structured Philippine K-12 curriculum:

- **Admin Account**: `admin-demo@tuklas.local` (Password: `DemoAdmin123!`)
- **Teacher Account**: `teacher-demo@tuklas.local` (Password: `DemoTeacher123!`) — Teacher at Rizal National High School
- **Student 1**: `student-juan@tuklas.local` (Password: `DemoStudent123!`) — Grade 7, Section Sampaguita
- **Sample Curriculum**: Mathematics & Science Grade 7 Term 1 with Lesson "Operations on Integers" (Sections, YouTube educational video source, vocabulary, formative checks, and published 4-question assessment).

---

## 9. Phase 3 — Production Authentication, Authorization & Account Security

Phase 3 hardened the authentication foundation into a production-grade identity and access control system:

### 9.1 Authentication Lifecycle

```text
Register / Account Creation
        ↓
Server-Side Password Policy Validation (8+ chars, uppercase, lowercase, digit)
        ↓
PBKDF2-SHA512 Password Hashing (220,000 iterations)
        ↓
Database User Creation (with StudentProfile or TeacherProfile)
        ↓
Session Generation (Cryptographic UUID in AuthSession model)
        ↓
HMAC-SHA256 Token Signing (Signed with AUTH_SECRET >= 32 chars)
        ↓
HttpOnly / SameSite=Lax Cookie Issuance
        ↓
Server-Side Role & Ownership Authorization
        ↓
Session Revocation on Logout (Database row deleted + Max-Age=0)
```

### 9.2 Centralized Authentication Modules

* **`src/lib/auth/password.ts`**: Password hashing, verification with `timingSafeEqual`, hash upgrade detection, and password policy checking.
* **`src/lib/auth/guards.ts`**: Standalone assert guards (`requireAuth`, `requireRole`, `requireAnyRole`, `requireOwnership`).
* **`src/lib/auth/audit.ts`**: Structured audit logger (`AuthAuditLogger`) emitting sanitized JSON audit trails for security actions.
* **`src/lib/auth/server-guard.ts`**: Server Component authentication guard (`requireServerUser`) for Next.js App Router layouts and pages.
* **`next.config.mjs`**: Hardened HTTP security headers (CSP, X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy).

### 9.3 Protected Workspaces & Role-Aware Routing

* `/login`: Production login interface with accessible labels, disabled states, error banners, and role-aware client redirection.
* `/student`: Dedicated workspace guarded server-side for `STUDENT` accounts.
* `/teacher`: Dedicated studio guarded server-side for `TEACHER` and `ADMIN` accounts.
* `/admin`: System governance dashboard guarded server-side for `ADMIN` accounts.
* `/unauthorized`: 403 Forbidden landing page for unauthorized role transitions.
* `GET /api/auth/me`: Safe current user identity endpoint returning metadata, role, and profile details without secrets.

---

## 10. Phase 4 — Production Curriculum System

Phase 4 turned the database foundation into an authoritative, database-driven curriculum management and learning hierarchy for Tuklas:

### 10.1 Curriculum Hierarchy & Data Flow

```text
Subject (Mathematics, Science, English, etc.)
   ↓
GradeLevel (7, 8, 9, 10 via Curriculum model)
   ↓
Term (Quarter 1, Quarter 2, Quarter 3)
   ↓
Unit (Structured theme with deterministic position)
   ↓
Lesson (Multi-section lesson with status: DRAFT | PUBLISHED | ARCHIVED)
   ↓
Lesson Content / Sources / Checks / Assessments
```

### 10.2 Role-Based Visibility & Anti-Cheating Isolation

1. **Student Browsing (`STUDENT`)**:
   - Access to published curriculum hierarchy via `GET /api/curriculum`.
   - Sees only `PUBLISHED` lessons.
   - Comprehensive checks and assessment answers (`correctIndex`, `explanation`, `sourceTranscript`) are strictly stripped from student responses.
2. **Teacher Studio (`TEACHER`)**:
   - Access to full curriculum taxonomy.
   - Can see all `PUBLISHED` lessons plus their own authored `DRAFT` and `ARCHIVED` lessons.
   - Ownership enforcement: teachers may only edit, reorder, or archive lessons they authored (`authorId === user.id`). Unauthorized updates return `403 Forbidden`.
3. **Administrator (`ADMIN`)**:
   - Full system governance across subjects, grade levels, terms, units, and all teacher lessons.
   - Ability to create and update subjects via `POST /api/curriculum/subjects`.

### 10.3 Non-Destructive Archival

Archiving a lesson or unit updates its status to `ARCHIVED` rather than performing a cascading deletion. All student historical progress (`LessonProgress`), quiz attempts (`QuizAttempt`), answer records (`AssessmentAnswer`), and mistake records (`MistakeRecord`) remain completely preserved in the database for longitudinal analytics.

### 10.4 Deterministic Ordering

Units and lessons maintain deterministic integer `position` fields (`0..N-1`). Unit and lesson reordering endpoints (`/api/curriculum/units/reorder` and `/api/lessons/reorder`) execute within database transactions using collision-safe two-phase updates to satisfy unique compound constraints (`@@unique([termId, position])`).

### 10.5 Phase 4 API Endpoints

| Method | Endpoint | Allowed Roles | Description |
|---|---|---|---|
| `GET` | `/api/curriculum` | Authenticated | Retrieves curriculum hierarchy with role filtering & query search |
| `GET` | `/api/curriculum/subjects` | Authenticated | Lists all active subjects |
| `POST` | `/api/curriculum/subjects` | `ADMIN` | Creates a new subject and auto-provisions standard terms |
| `GET` | `/api/curriculum/subjects/[id]` | Authenticated | Retrieves subject details |
| `PATCH` | `/api/curriculum/subjects/[id]` | `ADMIN` | Updates subject metadata |
| `POST` | `/api/curriculum/units` | `TEACHER`, `ADMIN` | Creates a unit under a term |
| `GET` | `/api/curriculum/units/[id]` | Authenticated | Retrieves unit details with role-filtered lessons |
| `PATCH` | `/api/curriculum/units/[id]` | `TEACHER`, `ADMIN` | Updates unit title, description, or position |
| `DELETE` | `/api/curriculum/units/[id]` | `TEACHER`, `ADMIN` | Non-destructively archives unit and contained lessons |
| `POST` | `/api/curriculum/units/reorder` | `TEACHER`, `ADMIN` | Reorders units in a term collision-safely |
| `PATCH` | `/api/lessons/[id]` | `TEACHER` (author), `ADMIN` | Updates lesson content, metadata, or publishing status |
| `DELETE` | `/api/lessons/[id]` | `TEACHER` (author), `ADMIN` | Non-destructively archives lesson (`status: ARCHIVED`) |
| `POST` | `/api/lessons/reorder` | `TEACHER`, `ADMIN` | Reorders lessons in a unit |
| `GET` | `/curriculum` | `STUDENT`, `TEACHER`, `ADMIN` | Full-page responsive curriculum catalog page |


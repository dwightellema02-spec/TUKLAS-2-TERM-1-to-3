# TUKLAS 2.0 — Security & Access Control Policy

This document details the security architecture, authentication lifecycle, role-based authorization matrix, ownership guarantees, and defensive safeguards implemented in Tuklas 2.0.

---

## 1. Threat Model & Guarantees

Tuklas 2.0 operates as an authoritative, school-oriented learning ecosystem. The architecture strictly enforces server-authoritative trust:

```text
Browser Client
      │
      ▼
HTTP Request (signed session cookie)
      │
      ▼
Authentication Verification (HMAC-SHA256 signature + Database active check)
      │
      ▼
Server-Side Role Authorization (STUDENT, TEACHER, ADMIN)
      │
      ▼
Server-Side Ownership Validation (User/Student tenancy check)
      │
      ▼
Input Validation (Strict Zod schema parsing)
      │
      ▼
Domain Service Execution (Atomic PostgreSQL transaction)
      │
      ▼
Sanitized Response Serialization (Zero secret/answer leakage)
```

**Core Security Principles**:
1. **Never Trust the Client**: Scores, mastery calculations, role memberships, and user ownership are calculated and validated exclusively on the server.
2. **Anti-Enumeration Responses**: Authentication errors return generic responses (`Invalid email or password.`) to prevent username/email harvesting.
3. **Defense Against Privilege Escalation**: Role assignment is server-authoritative. Public registration cannot assign `ADMIN` or `TEACHER` roles without verified credentials or server invite codes.
4. **Data Isolation (Tenancy)**: Students cannot view, edit, or resolve mistakes, attempt histories, or progress records belonging to other students.

---

## 2. Authentication & Credential Security

### Password Storage & Policy
* **Hashing Algorithm**: PBKDF2 with SHA-512 and 220,000 iterations using unique 16-byte cryptographically secure salts.
* **Timing-Safe Comparison**: `crypto.timingSafeEqual` prevents timing side-channel attacks during password hash verification.
* **Password Policy**:
  * Minimum 8 characters
  * At least one uppercase letter (`[A-Z]`)
  * At least one lowercase letter (`[a-z]`)
  * At least one number (`[0-9]`)
* **Zero Secret Leakage**: `passwordHash`, salts, and raw secrets are excluded from Prisma select queries, API payloads, session tokens, audit logs, and client caches.

### Session Lifecycle
* **Session Identifier**: Cryptographically random UUIDs (`randomUUID()`).
* **Session Storage**: Database-persisted in `AuthSession` model with user relationship, expiration timestamp, and compound index.
* **Token Structure**: Compact signed token (`header.payload.signature`) using HMAC-SHA256 with `AUTH_SECRET` (minimum 32 characters).
* **Validation Check**:
  ```text
  Session Token Signature Valid
  AND
  Session exists in Database
  AND
  Session expiresAt > now
  AND
  User exists
  AND
  User.isActive === true
  ```
* **Revocation & Logout**: `POST /api/auth/logout` atomically deletes the database session record and clears the HTTP cookie with `Max-Age=0`, immediately preventing replay attacks.
* **Session Cleanup**: `cleanupExpiredSessions()` purges expired session records from the database.

### Cookie Configuration
* `HttpOnly: true` (prevents JavaScript/XSS extraction)
* `SameSite: Lax` (protects against Cross-Site Request Forgery)
* `Secure: true` in production (enforces HTTPS)
* `Path: /`
* `Max-Age: 43200` (12 hours)

---

## 3. Authorization Matrix

| Feature / Resource | Unauthenticated | Student | Teacher | Admin | Enforcement Mechanism |
|---|---|---|---|---|---|
| View Public Curriculum | ✅ | ✅ | ✅ | ✅ | Open read projection |
| View Lesson Content | ❌ | ✅ (Sanitized) | ✅ (Full) | ✅ (Full) | Safe projection strips answer keys |
| Submit Assessment | ❌ | ✅ (Self) | ❌ | ❌ | Server-authoritative transaction |
| View Own Progress & Mistakes | ❌ | ✅ (Self) | ❌ | ❌ | Ownership query (`where: studentId`) |
| Resolve Own Mistakes | ❌ | ✅ (Self) | ❌ | ❌ | Ownership assertion (`requireOwnership`) |
| View Class Roster / Progress | ❌ | ❌ | ✅ (Managed) | ✅ (All) | Role check + class teacher lookup |
| Create & Edit Lessons | ❌ | ❌ | ✅ | ✅ | `allowedRoles: ['TEACHER', 'ADMIN']` |
| Publish Lessons | ❌ | ❌ | ✅ | ✅ | `allowedRoles: ['TEACHER', 'ADMIN']` |
| View System Admin Console | ❌ | ❌ | ❌ | ✅ | `allowedRoles: ['ADMIN']` |
| Deactivate Accounts | ❌ | ❌ | ❌ | ✅ | Admin-only API & Server Guard |
| Manage User Roles | ❌ | ❌ | ❌ | ✅ | Strict schema + server validation |

---

## 4. HTTP Security Headers

Configured via `next.config.mjs`:

```http
X-Content-Type-Options: nosniff
X-Frame-Options: SAMEORIGIN
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(self), geolocation=()   # microphone for this site only (voice tutor); camera and location stay blocked
Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.youtube.com https://s.ytimg.com; frame-src 'self' https://www.youtube.com https://www.youtube-nocookie.com; img-src 'self' data: https://i.ytimg.com https://img.youtube.com; style-src 'self' 'unsafe-inline'; font-src 'self' data:; connect-src 'self';
```

---

### Cross-site request protection
`src/proxy.ts` refuses a POST/PUT/PATCH/DELETE to `/api/*` when the browser marks it `Sec-Fetch-Site: cross-site` or sends an `Origin` that is not this site (403). Requests with neither header (curl, server-to-server) are unaffected. This is in addition to the `SameSite=Lax` cookie.

## 5. Audit Logging

Authentication events are emitted via `AuthAuditLogger`:
* `LOGIN_SUCCESS`: Logged with user ID, role, and client IP.
* `LOGIN_FAILURE`: Logged with normalized email, client IP, and generic reason (`USER_NOT_FOUND`, `ACCOUNT_INACTIVE`, `INVALID_PASSWORD`).
* `LOGOUT`: Logged upon session revocation.
* `PRIVILEGE_ESCALATION_BLOCKED`: Logged when an unauthorized role request or invite code mismatch occurs.
* **Redaction**: All passwords, password hashes, secrets, cookies, and tokens are scrubbed prior to output.

---

## 6. Non-Production Demo Seed Safeguards

Demo accounts (`admin-demo@tuklas.local`, `teacher-demo@tuklas.local`, `student-juan@tuklas.local`, `student-maria@tuklas.local`) are restricted:
* Refuses to seed when `process.env.NODE_ENV === 'production'`.
* Requires explicit `ALLOW_DEMO_SEED=true` flag.

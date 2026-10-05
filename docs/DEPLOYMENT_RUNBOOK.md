# Deployment runbook (Vercel + Neon)

**Nothing here has been run against production by me.** I never contacted Neon or Vercel. Every step is for the owner, and every
claim of "deployed" must be earned by doing it and checking it.

## 0. Before anything: rotate the old secrets
The original project zip contained a Neon database password and a Vercel token. They must be treated as leaked:
1. Neon: reset the database role password and create a new connection string.
2. Vercel: revoke the old token and create a new one only if automation needs it.
3. Check the Neon project's connection history for anything unexpected.

## 1. Environment variables (Vercel project settings, Production)

| Variable | Value | Notes |
|---|---|---|
| `DATABASE_URL` | the NEW pooled Neon URL | never reuse the old one |
| `AUTH_SECRET` | 32+ random bytes (`openssl rand -base64 32`) | session signing |
| `NEXT_PUBLIC_APP_URL` | the real https URL | |
| `TRUSTED_PROXY_HOPS` | `1` on Vercel | so rate limits use the real client address |
| `TEACHER_INVITE_CODE` | a long random code, or leave unset to disable teacher self-registration | there is no default |
| `AI_PROVIDER` | `anthropic` or `gemini` | |
| `ANTHROPIC_API_KEY` (+ optional `ANTHROPIC_MODEL`) or `GEMINI_API_KEY` + `GEMINI_MODEL` | from the provider | unset = honest rule-based fallback, never a fake reply |
| **never set** | `ALLOW_DEMO_SEED`, `ANTHROPIC_BASE_URL`, `TEST_DATABASE_URL` | the demo seed refuses to run in production |

`vercel.json` runs `npx prisma generate && npm run build`.

## 2. Database
```
npx prisma migrate deploy        # applies the 15 migrations; run with the production DATABASE_URL
```
Never run `migrate dev`, `migrate reset` or the seed against production.

## 3. Accounts and content (production path, no demo data)
1. Register the first account, then promote it to ADMIN directly in the database (there is no public admin sign-up by design),
   or create teachers from the admin console once an admin exists.
2. Load the Grade 7 Term 1 curriculum owned by a real teacher account:
   ```
   npm run content:load -- --author-email=teacher@school.example            # dry run: prints the host only
   npm run content:load -- --author-email=teacher@school.example --confirm  # loads 3 units, 5 lessons, 144 practice questions
   ```
   Idempotent; updates rows in place. **The lesson text is a draft no teacher has reviewed.** Have a teacher review it first.
3. Teachers can then author further lessons, documents, captions and practice questions in the studio.

## 4. After deploying, verify (each is a real check, not a claim)
- `GET /api/health` returns `{service,status}` only.
- Response headers include `Permissions-Policy: camera=(), microphone=(self), geolocation=()` and the CSP.
- Sign up a test teacher and student, run the loop once by hand: lesson, class, join, practice, tutor, insights.
- With a key set: `RUN_LIVE_AI=true npm run test:live` against a **test** database (never production), then read
  `docs/evidence/phase-c/live-run-*.json`.
- Try the tutor with the key removed: the reply must say "Automatic hint (not AI)".

## 5. Operations that do not exist yet (you must set them up)
- **Backups / point-in-time restore** (Neon feature): not configured; restore never tested.
- **Monitoring and alerts**: no error tracking, uptime check or AI-cost alert. Token usage is stored per tutor call
  (`AIInteraction.promptTokens/outputTokens`), so a daily cost query is possible; nobody runs it.
- **Log review** for personal data; **incident process**; **status page**.
- **Shared rate limiting**: limits are per serverless instance. Put an edge or Redis-backed limiter in front before a large rollout.
- **CSRF**: state-changing requests rely on `SameSite=Lax` cookies. There is no Origin/CSRF-token check (defence in depth recommended).
- **Load and performance tests**: none. Analytics are computed on every page view from raw rows.

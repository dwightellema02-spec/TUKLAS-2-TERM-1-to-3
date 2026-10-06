# Privacy and data: what Tuklas stores, and what leaves the system

**Status: an engineering inventory, not a legal document.** Tuklas serves minors. Before any real school use, a privacy review
against the Philippine Data Privacy Act (RA 10173) and DepEd's data-privacy rules, a Privacy Notice, parent/guardian consent and a
data-sharing agreement with the school are required. None of those exist yet. They are owner actions.

## What is stored (PostgreSQL)

| Data | Where | Notes |
|---|---|---|
| Account: name, email, role, password hash (PBKDF2-SHA512, salted), lock and login-failure counters | `User` | No plain passwords. Student number, grade, section, school name are optional profile fields |
| Learning records: lesson progress, check attempts, practice sessions and answers, mistakes, skill mastery and its history | `LessonProgress`, `PracticeSession/Answer`, `MistakeRecord`, `SkillMastery*` | These are the core product data |
| Tutor conversations: each student message, each reply (labelled AI or AUTOMATIC), hint level, the teaching action and strategy, a small state of counts and the last proposed numbers | `ChatConversation`, `ChatMessage` | Students' free-text messages are stored in full |
| AI audit: user, lesson, provider, latency, token counts, model id, success, fallback reason | `AIInteraction` | No prompt text is stored |
| Teacher material: extracted TEXT of uploaded PDF/DOCX/TXT/captions, in chunks | `LessonDocument`, `DocumentChunk` | The uploaded file itself is never stored |
| Class membership, assignments, admin audit log | `Class*`, `Assignment`, `AdminAuditLog` | |
| Sessions: server-side session records, HTTP-only cookie (`SameSite=Lax`, `Secure` in production) | `Session` | |

## What leaves the system

| Destination | What is sent | When |
|---|---|---|
| The AI provider (Anthropic or Google Gemini, chosen by `AI_PROVIDER`) | For each tutor request: the **student's message text**, the last 8 messages of that conversation, selected parts of the lesson, retrieved parts of the teacher's documents/captions, the open question and the student's attempt, skill levels and the teaching plan. **No name, email or account id** is included in the prompt | Only when an API key is configured. Without a key nothing is sent and the rule-based fallback answers |
| The browser vendor's speech service | The student's **audio**, if they use the microphone button (Chrome, Edge and Safari recognise speech in the vendor's cloud). Tuklas itself never receives or stores audio, only the resulting text | Only when the student presses the microphone button |
| YouTube | Embedded videos load from youtube.com (see the CSP in `next.config.mjs`) | When a lesson page with a video is opened |

A student can type something personal into the tutor box and it will be stored and sent to the AI provider. The tutor panel now
says "Please do not type personal details", but nothing detects or removes personal details a student types anyway.

## Gaps (what must be decided or built before real use)
1. **No consent flow or parent/guardian consent capture** in the product. A draft privacy notice and consent form (English and
   Filipino) exists as a document: `DRAFT_PRIVACY_NOTICE_AND_CONSENT.md`. It is not legally reviewed and is not yet shown in the app.
2. **No retention policy**: conversations and learning records are kept indefinitely. BUILT since the first version of this file:
   a student can **download all their data** and **delete their own account** (password plus the word DELETE; everything cascades,
   tested) on `/student/privacy`. Not built: teacher and administrator self-deletion (an administrator closes those), a
   per-student export for a teacher or school, an automatic retention schedule.
3. **No data-processing agreement** with Anthropic/Google reviewed; provider data-retention and "no training on API data" terms
   must be confirmed by the owner for the plan actually used.
4. ~~No warning to students~~ A short notice now appears in the tutor panel (see above). Students can also **report a bad tutor reply**;
   the class teacher sees the reply and the reason, never the student's name.
5. **No log redaction review** of hosting logs (Vercel/Neon) for personal data.
6. **No backups or restore test** documented (Neon offers point-in-time restore; it has not been configured or tested here).
7. Rate limits and the account-lockout memory for unknown emails are per server process, not shared.

## Defaults that already protect students
- The correct answer to an open question is never sent to the browser or to the model until the student has answered.
- Teachers see only their own classes; another teacher gets "not found" (tested over HTTP).
- Class-level analytics never name a student in the "hard questions" list.
- Login answers and timing do not reveal whether an email has an account (tested).
- Prompts contain no student identifiers.

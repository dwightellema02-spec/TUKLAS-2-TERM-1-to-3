# TUKLAS AI — PHASE 10 VERIFICATION REPORT

**PHASE:** V2 Phase 10 — AI Tutor v2 (Socratic hint ladder, tutoring state, lesson grounding, honest unavailable state)
**OBJECTIVE:** Make the AI learning companion real (master plan §3–§6, §16–§17, §46 rules 6–9): it helps a student think
rather than handing over answers, knows the lesson, the question and the student's skills, remembers the conversation,
and is honest about when the AI is not available.

## IMPLEMENTED

1. **Intent classifier** (English/Taglish): hint, don't understand, still confused, another example, give-me-the-answer, check-my-answer, general.
2. **Server-side hint ladder** (`src/server/tutor/ladder.ts`): rungs 1–6 while a question is unanswered, one rung at a time; rung 7
   (full explanation) only after the student has submitted. "Just give me the answer" adds scaffolding instead of the answer;
   "I still don't get it" forces a different strategy. The level is stored on the conversation, so it cannot be skipped from the client.
3. **Grounded prompt** (`prompt.ts`): published lesson (objectives, sections, vocabulary), the question and options, the student's skill levels
   and recent turns. For an open question the answer key and official explanation are **never** sent to the model.
4. **Output guard** (`guard.ts`), run on every reply before the student sees it: empty / too long, states the answer (contextual, so "Hint 1"
   is not mistaken for the answer 1), gives a right/wrong verdict on a proposed answer (anti-oracle), claims to have watched/read content it
   never received, echoes its instructions.
5. **Honest fallback** (`fallback.ts`): if the AI is unavailable or its reply is rejected, the student gets a rule-based hint labelled
   "Automatic hint (not AI)". Nothing is presented as AI that is not.
6. **Persistence and audit:** `ChatConversation.hintLevel/practiceQuestionId`, `ChatMessage.source/rung/intent`, one `AIInteraction` row per request
   (provider, latency, success, rung, intent, fallback reason).
7. **Two providers:** Anthropic and Gemini behind one interface (`AI_PROVIDER`); `ANTHROPIC_BASE_URL` override (used by the browser tests).
8. **UI** (`tutor-panel.tsx`): "Need help? Ask Tuklas" on every practice question and lesson page; quick actions; hint-level indicator;
   conversation restored on refresh; every reply labelled AI or automatic; plain notice when AI is off.
9. **Defects fixed on the way:** the answer-leak check blocked innocent replies ("Hint 1" when the answer was 1) — now contextual; the
   conversation log was not keyboard-focusable (axe) — fixed.

## VERIFICATION

| Feature | Status | Evidence |
|---|---|---|
| Intent classification | PASS | unit tests |
| Ladder (one rung at a time, rung 7 only after answering, strategy change) | PASS | unit tests + API tests + browser |
| Prompt never contains the answer key for an open question | PASS | unit tests + browser (inspects what the fake model received) |
| Guard blocks answer statements, verdicts, unseen-content claims, instruction echo | PASS | 67 guard tests + browser (misbehaving fake model) |
| Automatic fallback when AI fails or reply rejected | PASS | unit + API + browser, clearly labelled |
| Conversation memory and refresh restore | PASS | API tests + browser |
| Student isolation (other students' questions/conversations) | PASS | API tests |
| Rate limit (30/min) | PASS | API test |
| Accessibility (axe WCAG A/AA) of tutor panel and lesson page | PASS | desktop + phone |
| Phone layout | PASS | no sideways scroll |
| **Real Anthropic call** | **NOT VERIFIED** | no API key available |
| **Real Gemini call** | **NOT VERIFIED** | no API key and no `GEMINI_MODEL` |
| Tutor reply quality / pedagogy with a real model | NOT VERIFIED | needs a real model and real students |
| Voice, documents, video transcripts in the tutor | NOT IMPLEMENTED | Phases 11–12 |

**AUTOMATED TESTS:** 582 / 582 PASS (Vitest, 37 files; was 399)
**REAL BROWSER:** 48 / 48 PASS (Playwright/Chromium, desktop and Pixel 5 emulation; 16 new tutor tests) — the "AI" in these tests is a local fake
model server, so they prove the plumbing, guard and UI, not model quality
**TYPECHECK:** PASS  **LINT:** PASS  **BUILD:** PASS  **DATABASE:** PASS (12 migrations, no drift)
**SECURITY:** PASS for this surface (ownership scoping, answer-key isolation, guard, rate limit)
**REAL DEVICE:** NOT COMPLETED  **REAL USER:** NOT COMPLETED

Evidence screenshots: `docs/evidence/phase7/` (`t1`, `t2` are this phase).

## KNOWN LIMITATIONS

1. The guard is rule-based; a paraphrased answer leak (e.g. in words for a numeric answer) could still pass. It is a strong net, not a proof.
2. The intent classifier is keyword-based and will misread unusual phrasing; it errs toward treating a message as general help.
3. Tutor grounding uses lesson text only; teacher documents and video transcripts are not yet available to it.
4. Only the last 8 turns are sent to the model.
5. Automatic hints cover integer arithmetic best; other topics get generic guidance.

## DEFECTS FOUND

1. Guard false positive on single-digit answers ("Hint 1") — fixed with contextual detection and regression tests.
2. Tutor log not keyboard-focusable — fixed.
3. Test-design mistakes (fresh browser context per test; wrong expectation after reload) — fixed in the spec.

## REMAINING RISKS

1. No real model has ever run against this prompt and guard; the guard may reject too many real replies (students would see more automatic hints).
2. `analyze-mistake` still trusts a client-sent `correctIndex`.
3. Login timing still allows account enumeration.
4. Neon/Vercel credentials from the original zip still need rotating by the owner.

## FINAL DECISION

**READY_FOR_NEXT_PHASE** (Phase 11: curriculum content and document intelligence), with live-AI verification still outstanding until the owner
supplies a key (and `GEMINI_MODEL` if Gemini is used).

# TUKLAS AI — PHASE 13 VERIFICATION REPORT

**PHASE:** V2 Phase 13 — Video caption ingestion (lesson video transcripts grounding the AI tutor)
**OBJECTIVE:** Master plan §8 (resource intelligence), §6 (context hierarchy), §23 (security): a teacher attaches the caption file of a
lesson video; Tuklas stores the text with its timings, and the tutor can point a student to the part of the video that matches their
question, without trusting the captions as instructions and without leaking answers.

**SCOPE NOTE:** Captions are supplied by the teacher (.srt or .vtt). Tuklas does NOT download videos or fetch captions from YouTube or
any site, and does NOT transcribe audio (no speech-to-text). Teacher analytics, voice and the real-device/real-user gate remain open.

## IMPLEMENTED

1. **Caption parser** (`src/server/documents/transcript.ts`): WebVTT and SubRip. Skips NOTE/STYLE blocks, cue numbers and timing
   settings; strips markup, styling codes and control characters; accepts hour timestamps and a byte-order mark; skips cues with
   backwards timings; collapses lines repeated by rolling auto-captions; caps at 20,000 cues.
2. **Timed chunks:** cues are grouped into ~45-second windows (never over the chunk size), each labelled `Video m:ss–m:ss`.
3. **Type detection from bytes:** a `.srt`/`.vtt` is accepted only if the bytes are text and look like captions; an executable or a plain
   document renamed `.vtt` is refused. Reuses the existing 5 MB, ownership, 10-documents-per-lesson and storage rules (no schema change:
   `kind` is `TRANSCRIPT`).
4. **Tutor:** a caption chunk appears as `Video transcript "Video 1:10–1:20"` inside the existing data-only `TEACHER MATERIAL` block, with a
   rule that the tutor has not watched the video and may only use the time range and words shown. Delimiter look-alikes are stripped as
   for documents, and chunks stating an open question's answer are still withheld.
5. **Teacher UI:** the documents tab accepts `.srt`/`.vtt`, labels them "Video captions", and says plainly that Tuklas does not fetch
   captions itself.

## VERIFICATION

| Feature | Status | Evidence |
|---|---|---|
| VTT/SRT parsing (tags, NOTE, CRLF, BOM, hours, rolling duplicates, bad timing, cue cap) | PASS | 9 unit tests |
| Time-window chunks, size limit, headings, retrieval to the right moment, nothing when unrelated | PASS | unit |
| Byte/name type detection; renamed executable or non-captions refused | PASS | unit + API (400) + browser |
| Upload stores timed chunks for the owner; tutor prompt carries the video label and "not watched" rule | PASS | API test |
| Prompt-injection text inside captions neutralised | PASS | API test (one real closing marker) |
| Answer-stating caption chunk withheld while a question is open | PASS | API test (the unrelated chunk still reaches the prompt) |
| Teacher uploads captions, tutor receives the right moment, removal stops use | PASS | browser, desktop + phone |
| Accessibility (axe WCAG A/AA) and phone layout of the tab with captions | PASS | browser |
| Existing document behaviour unchanged | PASS | prior 618 + Phase 12 tests still pass |
| Real captions from a real lesson video | NOT VERIFIED | no real caption file available; tests use authored captions |
| Real-model use of the timings | NOT VERIFIED | no API key; the browser "AI" is the local fake server |
| Automatic transcript fetch / speech-to-text | NOT IMPLEMENTED | deliberately out of scope |

**AUTOMATED TESTS:** 790 / 790 PASS (Vitest, 41 files; was 771)
**REAL BROWSER:** 66 / 66 PASS (Playwright/Chromium, desktop and Pixel 5 emulation; 2 new)
**TYPECHECK:** PASS  **LINT:** PASS  **BUILD:** PASS  **DATABASE:** no schema change (13 migrations unchanged)
**SECURITY:** PASS for this surface (type spoofing, markup stripping, injection, answer-key withholding, ownership inherited)
**REAL DEVICE:** NOT COMPLETED  **REAL USER:** NOT COMPLETED

## KNOWN LIMITATIONS

1. Teachers must export captions themselves (for example from their video host); nothing is fetched automatically.
2. A chunk is labelled with a time range but students cannot click it to jump in the video; the tutor only says the time.
3. Captions are not tied to a specific `LessonSource` video; they attach to the lesson. A lesson with several videos shows only time
   ranges.
4. Retrieval is lexical, so a paraphrase sharing no words with the captions will not match.
5. Auto-generated captions can contain recognition errors in maths terms; Tuklas cannot detect them.

## DEFECTS FOUND

None in this phase's own code after the first run. (A vitest run hung once at `prisma migrate deploy` while checking; killing it and
rerunning to a log file succeeded. Cause not identified.)

## REMAINING RISKS

1. Live AI calls remain unverified.
2. `analyze-mistake` still trusts a client-sent `correctIndex`.
3. Login timing still allows account enumeration.
4. Neon/Vercel credentials from the original zip still need rotating by the owner.
5. Phase 12 lesson content is not teacher-reviewed.

## FINAL DECISION

**READY_FOR_NEXT_PHASE.** Recommended next: (c) teacher analytics, (d) voice (the `microphone=()` policy must change first), then (e) the
real-browser/real-device/real-user gate.

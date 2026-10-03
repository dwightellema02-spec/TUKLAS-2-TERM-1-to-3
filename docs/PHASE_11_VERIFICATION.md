# TUKLAS AI — PHASE 11 VERIFICATION REPORT

**PHASE:** V2 Phase 11 — Document Intelligence (teacher reference documents grounding the AI tutor)
**OBJECTIVE:** Master plan §8 (resource intelligence), §6 (context hierarchy), §23 (security): a teacher attaches PDF / Word / text
material to a lesson, Tuklas extracts real text from it, and the tutor uses the relevant parts when a student asks, without trusting the
document as instructions and without leaking answers hidden in a worksheet.

**SCOPE NOTE:** This phase covers documents only. Curriculum content (more Grade 7 lessons), voice, video transcripts and teacher
analytics are NOT part of it and remain open (see FINAL DECISION).

## IMPLEMENTED

1. **Extractor** (`src/server/documents/extract.ts`): digital PDF (pdf-parse), DOCX (mammoth), plain text / Markdown. **No OCR**: a scanned or
   image-only PDF is refused with an honest message instead of producing empty or invented text.
2. **File type from bytes, not names.** `%PDF-` signature for PDFs; a zip is accepted only if it is a Word package named `.docx`; text only
   with a text extension and text-like bytes. An executable renamed `.pdf` is refused.
3. **Limits:** 5 MB upload (checked from `Content-Length` before the body is read; a missing length is refused), 200 PDF pages, 300,000
   extracted characters, 10 documents per lesson, and a **zip-bomb check** that reads the DOCX central directory and refuses archives that
   declare more than 50 MB expanded or 2,000 entries, before anything is decompressed.
4. **Storage:** only extracted text is kept (`LessonDocument` + `DocumentChunk`, migration `20261004100000_lesson_documents`); the file itself is
   never stored. File names are reduced to a plain base name.
5. **Ownership:** only the lesson's author or an administrator can list, upload or remove (`DocumentService.requireLessonControl`); students and
   other teachers get 403, visitors 401, an unknown lesson 404.
6. **Retrieval** (`retrieve.ts`): deterministic lexical scoring (rarer words and heading matches count more). When nothing matches, **nothing**
   is returned, so unrelated material never reaches the model.
7. **Tutor grounding:** relevant chunks enter the prompt in a `BEGIN/END TEACHER MATERIAL` block explicitly labelled as data, not instructions.
   Delimiter look-alikes and role tags inside a document are stripped (`sanitizeMaterial`); the output guard also rejects replies echoing the
   material markers.
8. **Answer-key protection:** while a practice question is open, any retrieved chunk that states that question's answer is dropped before the
   prompt is built, so an uploaded worksheet with an answer key cannot reach the model. After the student answers, nothing is withheld.
9. **Teacher UI:** a fourth studio tab, "Reference documents" (upload, per-file words/sections/pages, two-step remove, plain error messages).
10. **Defects fixed on the way (all found by running the real thing):**
    - pdfjs failed under the Next bundler ("Setting up fake worker failed") although unit tests passed → `serverExternalPackages` for
      `pdf-parse`, `pdfjs-dist`, `mammoth`.
    - The lesson studio page overflowed sideways on phones (tab row could not wrap) → wrapping header/tabs, `min-width: 0`.
    - The lesson studio page failed WCAG contrast (grey `#64748b`) → `#475569`. It had never been checked with axe before.
    - Vitest picked up a test file Next copies into `.next` → `.next/**` excluded.
    - "Page N of M" footers stayed in extracted text → removed (found on the real MATATAG PDF).
    - Extraction failures are now logged server-side (error name and message only, never document content).

## VERIFICATION

| Feature | Status | Evidence |
|---|---|---|
| Real PDF / DOCX / text extraction | PASS | 20 extractor tests with generated real PDF and DOCX files |
| Type spoofing (exe as .pdf, arbitrary zip as .docx, binary as .txt) | PASS | unit + API tests |
| Zip bomb refused before decompression | PASS | unit + API test (60 MB of zeros, a few KB compressed) |
| Oversize / unsized upload refused before reading | PASS | API test |
| Scanned PDF refused honestly | PASS | unit + API + browser |
| Ownership and role gating on every route | PASS | API tests + browser (student gets 403) |
| 10-document limit, delete cascades to chunks | PASS | API tests |
| Retrieval returns the right chunk, nothing when unrelated | PASS | unit + API + browser |
| Prompt-injection text inside a document neutralised | PASS | API test (exactly one real closing marker; look-alikes removed) |
| Answer-key chunk withheld while a question is open | PASS | API test, with a positive control (the same chunk reaches the prompt after answering) |
| Removing a document stops the tutor using it | PASS | browser |
| Production build extracts PDF and DOCX | PASS | `next start` on the test DB: both uploads returned 201, then were removed |
| Accessibility (axe WCAG A/AA) of the documents tab | PASS | desktop + phone |
| Phone layout | PASS | no sideways scroll |
| Real documents | PASS (extraction) | `G7-BOW-Mathematics-7-Three-Term-1.pdf`: 10 pages, 1,390 words, 13 chunks; `MATATAG-Mathematics-CG-Grades1-4-and-7.pdf`: 36 pages, 11,645 words, 110 chunks (retrieval found its "add and subtract integers" competency); `Math-Reviewer.pdf`: 3 pages, 515 words |
| OCR, PPTX, XLSX, images | NOT IMPLEMENTED | deliberately out of scope (OCR would send student/teacher material to an external service and is unverified) |
| Real-model use of the material (does it paraphrase well?) | NOT VERIFIED | no API key; the browser "AI" is the local fake server |
| Mutation checks of the two new security tests | NOT DONE | a request to temporarily weaken the guard code was declined; the positive control above is the substitute evidence |

**AUTOMATED TESTS:** 618 / 618 PASS (Vitest, 39 files; was 582)
**REAL BROWSER:** 58 / 58 PASS (Playwright/Chromium, desktop and Pixel 5 emulation; 10 new document tests)
**TYPECHECK:** PASS  **LINT:** PASS  **DATABASE:** PASS (13 migrations, no drift)
**BUILD:** PASS (run before the last one-line footer-regex change; typecheck, lint and all tests were rerun after it)
**SECURITY:** PASS for this surface (ownership, type spoofing, zip bomb, size, injection, answer-key withholding)
**REAL DEVICE:** NOT COMPLETED  **REAL USER:** NOT COMPLETED

Evidence screenshots: `docs/evidence/phase7/` (`d1`, `d2` are this phase).

## KNOWN LIMITATIONS

1. Heading detection is weak on PDFs: most real chunks are labelled "Overview". Retrieval still works on content; headings only add a small bonus.
2. Retrieval is lexical, so a student's paraphrase with no shared words (or a Filipino word the notes spell in English) will not match.
3. Tables and equations in PDFs are flattened to text; mathematical layout is not preserved.
4. The zip-bomb check trusts sizes declared in the archive; it is a first line of defence, backed by the 5 MB limit, not a proof.
5. Answer-key withholding checks the exact answer text; an answer key written in a different form (for example "negative seven") is not caught by the filter, only by the reply guard.
6. Documents are visible to the tutor for everyone studying that lesson; there is no per-class or per-student document scope yet.
7. Re-uploading a changed file means removing and uploading again; there is no versioning.

## DEFECTS FOUND

See item 10 above. Five were real product defects (bundler break, phone overflow, contrast, footer noise, test discovery); none were present in
code written earlier in this phase's own tests.

## REMAINING RISKS

1. No real model has used this material; paraphrasing quality and over-reliance on notes are unmeasured.
2. `analyze-mistake` still trusts a client-sent `correctIndex`.
3. Login timing still allows account enumeration.
4. Neon/Vercel credentials from the original zip still need rotating by the owner.
5. Only one real lesson exists, so the documents feature has little curriculum to ground yet.

## FINAL DECISION

**READY_FOR_NEXT_PHASE.** Recommended next, in order: (a) Grade 7 Term 1 lesson content authored from the MATATAG guide and budget of work,
which now exist as extractable text; (b) video transcript ingestion; (c) teacher analytics; (d) voice (the `microphone=()` policy must change
first); (e) the real-browser/real-device/real-user gate. Live AI verification still needs an owner-supplied key.

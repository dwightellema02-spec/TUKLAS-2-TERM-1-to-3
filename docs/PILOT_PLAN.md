# Pilot plan (phase L): the first real use

**Status: NOT STARTED. This is a plan, not a result.** Nothing in Tuklas has been used by a real teacher or student. All claims
of learning benefit are unproven.

## Preconditions (all must be true; each is an owner action unless stated)
1. Secrets rotated; production deployed per `DEPLOYMENT_RUNBOOK.md`; backups configured and a restore tested.
2. A teacher has **reviewed and corrected** the five Term 1 lessons and their 144 practice questions.
3. A live AI key is set and `npm run test:live` has been run and its replies **read by a teacher** (Socratic? grounded? safe for Grade 7?).
4. School approval, a Privacy Notice, parent/guardian consent forms and a data-sharing agreement (see `PRIVACY_AND_DATA.md`).
5. Physical-device checks done (below).

## Scope
One teacher, one class (about 30 students), one Term 1 unit (4 weeks), school devices plus any phones students already have.

## Device matrix to test BEFORE the pilot (none done)
Android phone (Chrome), low-end Android, iPhone (Safari), school laptop (Chrome/Edge), a slow connection (throttled 3G-like).
For voice: a real microphone on each, in a noisy classroom, English and Filipino speech; confirm the browser's speech-service
disclosure is acceptable to the school.

## What to measure
| Area | Measure | Source |
|---|---|---|
| Learning | pre/post check on the unit (teacher-written, not seen in practice); per-skill accuracy trend | teacher + `SkillMastery`, `PracticeAnswer` |
| Engagement | sessions per student per week, completion of assigned lessons | `PracticeSession`, `LessonProgress` |
| Tutor usefulness | share of tutor sessions where the next answer is correct; repeated-answer sequences; "I still don't get it" rate; teacher rating of a sample of 50 replies | `ChatMessage` (action, strategy), teacher review |
| Tutor safety/correctness | any reply that states an answer early, is mathematically wrong, or is off-topic (teacher flags; zero tolerance for unsafe) | teacher review, `AIInteraction` fallback reasons |
| Reliability | fallback rate (`AUTOMATIC`), provider errors, latency, tokens per student per week (cost) | `AIInteraction` |
| Usability | 5 student and 2 teacher think-aloud sessions; a short survey | observation |
| Teacher value | time to author a lesson; whether the insights changed a teaching decision | interview |

## Stop rules
Stop and fix before continuing if: any answer leak or unsafe reply is found; a student's data is visible to the wrong person; the
fallback rate exceeds 20% for a day; or a teacher says the content is wrong.

## Not built, needed for a controlled study
Consent capture and withdrawal in the product, an anonymised research export, an in-product "report a bad reply" button for
students and teachers. None exist.

# School / DepEd readiness and productization (phases M and N)

**Status: NOT READY, and not buildable honestly before the pilot produces evidence.** This is a gap analysis against what a school
or division office would ask for. It claims nothing as done.

## Architecture gaps (verified in the schema and code)
| Need | State |
|---|---|
| Multiple schools in one deployment (tenant isolation) | **MISSING**: there is no School/Organization model. A teacher's visibility is by class ownership only. Admin sees everything. Student profile has a free-text `schoolName` |
| School administrator role (sees one school, not all) | **MISSING**: roles are STUDENT, TEACHER, ADMIN (global) |
| Roster import (CSV from the school), bulk account creation | **MISSING**: students register themselves and join with a code; admins create accounts one by one |
| Single sign-on with school accounts (e.g. Google/Microsoft for Education) | **MISSING**: email + password only |
| Teacher onboarding without a shared invite code | **PARTIAL**: invite code or admin-created accounts |
| Curriculum management for all grades/subjects | **PARTIAL**: Grade 7 Term 1 Mathematics (5 lessons) + integers lesson. The catalog has Grades 7-10 and three subjects as empty shells. No bulk authoring, versioning or review workflow |
| Content review/approval before students see a lesson | **MISSING**: a teacher publishes directly |
| Reports for principals and division offices | **MISSING**: only per-class and per-student views for the class teacher |
| Data export and deletion on request | **MISSING** |
| Accessibility audit beyond automated axe checks | **NOT VERIFIED**: automated WCAG A/AA checks pass on tested pages; no screen-reader or keyboard-only user testing |
| Filipino-language interface and content | **MISSING**: the interface and lessons are English. The tutor accepts and answers Taglish/Filipino when the model does |
| Offline or low-bandwidth use | **MISSING** |
| Uptime, support, backup, SLA | **MISSING** (no process, tooling or staffing) |

## What a school or DepEd buyer will ask for, and the honest answer today
| Question | Answer |
|---|---|
| Is it effective? | Unknown. No pilot has been run |
| Is the content DepEd-aligned? | Lessons follow the published MATATAG Grade 7 Term 1 Budget of Work competencies (see `PHASE_12_VERIFICATION.md` for what is not covered). A teacher has not reviewed it. It is not DepEd-endorsed |
| Is student data safe and lawful? | Technical safeguards exist; legal, consent and retention work does not (`PRIVACY_AND_DATA.md`) |
| Who is accountable for AI output? | Not defined. A policy for AI use with minors, content filters beyond the answer/verdict/claim guards, and a reporting channel are needed |
| What does it cost? | Hosting (Vercel, Neon) plus AI usage. Token counts per tutor call are now stored; real cost per student per month is unmeasured |

## Productization checklist (phase N, in order, after a successful pilot)
1. School/tenant model and school-admin role; roster import; SSO.
2. Content workflow: draft, teacher review, approve, publish; versioning; more grades and subjects, aligned to the MATATAG guides.
3. Principal/division reporting and data export; deletion tooling; retention schedule.
4. Operations: monitoring, alerting, backups with a tested restore, an incident process, a support channel, a status page.
5. Packaging options to decide with evidence: per-school licence, per-district agreement, or hosted SaaS; pricing from measured AI and
   hosting cost per active student; a service-level statement you can actually meet.
6. Procurement documents: security summary (`SECURITY.md`), privacy notice, data-processing terms with providers, accessibility statement.

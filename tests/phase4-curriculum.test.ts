import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { db } from '../src/server/db';
import { createSessionToken, toPublicUser } from '../src/server/auth';
import { GET as getCurriculum } from '../src/app/api/curriculum/route';
import {
  GET as listSubjects,
  POST as createSubject,
} from '../src/app/api/curriculum/subjects/route';
import {
  GET as getSubject,
  PATCH as updateSubject,
} from '../src/app/api/curriculum/subjects/[id]/route';
import { GET as getGrade } from '../src/app/api/curriculum/grades/[id]/route';
import { GET as getTerm } from '../src/app/api/curriculum/terms/[id]/route';
import { POST as createUnit } from '../src/app/api/curriculum/units/route';
import {
  GET as getUnit,
  PATCH as updateUnit,
  DELETE as archiveUnit,
} from '../src/app/api/curriculum/units/[id]/route';
import { POST as reorderUnits } from '../src/app/api/curriculum/units/reorder/route';
import {
  POST as createLesson,
} from '../src/app/api/lessons/route';
import {
  GET as getLesson,
  PATCH as updateLesson,
  DELETE as archiveLesson,
} from '../src/app/api/lessons/[id]/route';
import { POST as reorderLessons } from '../src/app/api/lessons/reorder/route';

const emailFor = (role: string) =>
  `p4-test-${role}-${randomUUID()}@example.com`;

async function authHeaderFor(user: {
  id: string;
  email: string;
  displayName: string;
  role: 'STUDENT' | 'TEACHER' | 'ADMIN';
}) {
  const token = await createSessionToken(toPublicUser(user));
  return { Cookie: `tuklas_session=${token}` };
}

afterEach(async () => {
  const testUsers = await db.user.findMany({
    where: { email: { startsWith: 'p4-test-' } },
    select: { id: true },
  });
  const userIds = testUsers.map((u) => u.id);

  if (userIds.length > 0) {
    const testLessons = await db.lesson.findMany({
      where: { authorId: { in: userIds } },
      select: { id: true },
    });
    const lessonIds = testLessons.map((l) => l.id);

    if (lessonIds.length > 0) {
      await db.lessonCheck.deleteMany({ where: { lessonId: { in: lessonIds } } });
      await db.lessonContent.deleteMany({ where: { lessonId: { in: lessonIds } } });
      await db.lessonProgress.deleteMany({ where: { lessonId: { in: lessonIds } } });
      await db.mistakeRecord.deleteMany({ where: { lessonId: { in: lessonIds } } });
      await db.quizAttempt.deleteMany({ where: { lessonId: { in: lessonIds } } });
      await db.lesson.deleteMany({ where: { id: { in: lessonIds } } });
    }

    await db.authSession.deleteMany({ where: { userId: { in: userIds } } });
    await db.lessonProgress.deleteMany({ where: { studentId: { in: userIds } } });
    await db.mistakeRecord.deleteMany({ where: { studentId: { in: userIds } } });
    await db.quizAttempt.deleteMany({ where: { studentId: { in: userIds } } });
    await db.user.deleteMany({ where: { id: { in: userIds } } });
  }

  // Clean up any test subjects and curricula created
  const testSubjects = await db.subject.findMany({
    where: { code: { in: ['P4_TEST_SUB', 'FILIPINO_TEST'] } },
    select: { id: true },
  });
  if (testSubjects.length > 0) {
    const subIds = testSubjects.map((s) => s.id);
    await db.curriculum.deleteMany({ where: { subjectId: { in: subIds } } });
    await db.subject.deleteMany({ where: { id: { in: subIds } } });
  }
});

describe('Phase 4 — Production Curriculum System', () => {
  describe('Authoritative Database-Driven Hierarchy', () => {
    it('verifies the database hierarchy Subject -> GradeLevel -> Term -> Unit -> Lesson', async () => {
      const student = await db.user.create({
        data: {
          email: emailFor('student'),
          passwordHash: 'test-hash-p4',
          role: 'STUDENT',
          displayName: 'P4 Hierarchy Student',
        },
      });

      const response = await getCurriculum(
        new Request('http://localhost/api/curriculum', {
          headers: await authHeaderFor(student),
        }),
      );

      expect(response.status).toBe(200);
      const payload = await response.json();
      expect(payload.success).toBe(true);

      const subjects = payload.data.subjects;
      expect(subjects.length).toBeGreaterThanOrEqual(3);

      const math = subjects.find((s: { code: string }) => s.code === 'MATHEMATICS');
      expect(math).toBeDefined();
      expect(math.curricula.length).toBeGreaterThanOrEqual(4);

      // Verify Grade Levels (7, 8, 9, 10)
      const gradeLevels = math.curricula.map((c: { gradeLevel: { level: number } }) => c.gradeLevel.level);
      expect(gradeLevels).toContain(7);
      expect(gradeLevels).toContain(8);

      // Verify Terms (1, 2, 3)
      const termNumbers = math.curricula[0].terms.map((t: { number: number }) => t.number);
      expect(termNumbers).toEqual([1, 2, 3]);

      // Verify Units
      const firstTermUnits = math.curricula[0].terms[0].units;
      expect(firstTermUnits.length).toBeGreaterThan(0);
      expect(typeof firstTermUnits[0].position).toBe('number');
    });

    it('enforces deterministic ordering across all levels of the curriculum', async () => {
      const admin = await db.user.create({
        data: {
          email: emailFor('admin'),
          passwordHash: 'test-hash-p4',
          role: 'ADMIN',
          displayName: 'P4 Order Admin',
        },
      });

      const response = await getCurriculum(
        new Request('http://localhost/api/curriculum', {
          headers: await authHeaderFor(admin),
        }),
      );

      const payload = await response.json();
      const subjects = payload.data.subjects;

      // Verify subjects are ordered alphabetically
      const subjectNames = subjects.map((s: { name: string }) => s.name);
      const sortedNames = [...subjectNames].sort((a, b) => a.localeCompare(b));
      expect(subjectNames).toEqual(sortedNames);

      // Verify grade levels are ordered ascending
      for (const sub of subjects) {
        const levels = sub.curricula.map((c: { gradeLevel: { level: number } }) => c.gradeLevel.level);
        for (let i = 1; i < levels.length; i++) {
          expect(levels[i]).toBeGreaterThanOrEqual(levels[i - 1]);
        }
      }
    });
  });

  describe('Role-Based Visibility & Anti-Cheating Isolation', () => {
    it('isolates drafts and strips assessment answer keys from student view', async () => {
      const teacherA = await db.user.create({
        data: {
          email: emailFor('teacherA'),
          passwordHash: 'test-hash-p4',
          role: 'TEACHER',
          displayName: 'Teacher Alpha',
        },
      });

      const teacherB = await db.user.create({
        data: {
          email: emailFor('teacherB'),
          passwordHash: 'test-hash-p4',
          role: 'TEACHER',
          displayName: 'Teacher Beta',
        },
      });

      const student = await db.user.create({
        data: {
          email: emailFor('student'),
          passwordHash: 'test-hash-p4',
          role: 'STUDENT',
          displayName: 'P4 Student',
        },
      });

      // Get an existing demo unit
      const unit = await db.unit.findFirstOrThrow({
        include: { term: { include: { curriculum: { include: { subject: true, gradeLevel: true } } } } },
      });

      // Teacher A creates a DRAFT lesson
      const draftLesson = await db.lesson.create({
        data: {
          title: 'Secret Teacher A Draft',
          subject: unit.term.curriculum.subject.name,
          gradeLevel: unit.term.curriculum.gradeLevel.label,
          unitId: unit.id,
          authorId: teacherA.id,
          status: 'DRAFT',
          position: 10,
          checks: {
            create: {
              position: 0,
              question: 'Secret Draft Question?',
              options: ['A', 'B'],
              correctIndex: 0,
              explanation: 'Secret answer key explanation',
            },
          },
        },
      });

      // Teacher B creates a PUBLISHED lesson
      const publishedLesson = await db.lesson.create({
        data: {
          title: 'Official Teacher B Published Lesson',
          subject: unit.term.curriculum.subject.name,
          gradeLevel: unit.term.curriculum.gradeLevel.label,
          unitId: unit.id,
          authorId: teacherB.id,
          status: 'PUBLISHED',
          position: 11,
          checks: {
            create: {
              position: 0,
              question: 'Public Question?',
              options: ['Alpha', 'Beta'],
              correctIndex: 1,
              explanation: 'Detailed teacher-only explanation',
            },
          },
        },
      });

      // 1. Student requests curriculum hierarchy
      const studentCurriculumRes = await getCurriculum(
        new Request('http://localhost/api/curriculum', {
          headers: await authHeaderFor(student),
        }),
      );
      const studentCurriculumData = await studentCurriculumRes.json();
      const allStudentLessonTitles = JSON.stringify(studentCurriculumData);

      // Student MUST see published lesson, but MUST NOT see Teacher A's draft
      expect(allStudentLessonTitles).toContain('Official Teacher B Published Lesson');
      expect(allStudentLessonTitles).not.toContain('Secret Teacher A Draft');

      // 2. Student requests published lesson details: answers stripped
      const studentLessonRes = await getLesson(
        new Request(`http://localhost/api/lessons/${publishedLesson.id}`, {
          headers: await authHeaderFor(student),
        }),
        { params: Promise.resolve({ id: publishedLesson.id }) },
      );
      expect(studentLessonRes.status).toBe(200);
      const studentLessonData = await studentLessonRes.json();
      expect(studentLessonData.data.lesson.checks[0]).not.toHaveProperty('correctIndex');
      expect(studentLessonData.data.lesson.checks[0]).not.toHaveProperty('explanation');

      // 3. Teacher A requests curriculum hierarchy: sees own draft AND published
      const teacherACurriculumRes = await getCurriculum(
        new Request('http://localhost/api/curriculum', {
          headers: await authHeaderFor(teacherA),
        }),
      );
      const teacherAData = await teacherACurriculumRes.json();
      const teacherAText = JSON.stringify(teacherAData);
      expect(teacherAText).toContain('Secret Teacher A Draft');
      expect(teacherAText).toContain('Official Teacher B Published Lesson');

      // Clean up test lessons
      await db.lesson.deleteMany({ where: { id: { in: [draftLesson.id, publishedLesson.id] } } });
    });
  });

  describe('Teacher Lesson Management & Ownership Protection', () => {
    it('allows authors to update their lessons and blocks unauthorized teachers (403)', async () => {
      const teacherA = await db.user.create({
        data: {
          email: emailFor('teacherA'),
          passwordHash: 'test-hash-p4',
          role: 'TEACHER',
          displayName: 'Teacher Alpha',
        },
      });

      const teacherB = await db.user.create({
        data: {
          email: emailFor('teacherB'),
          passwordHash: 'test-hash-p4',
          role: 'TEACHER',
          displayName: 'Teacher Beta',
        },
      });

      const unit = await db.unit.findFirstOrThrow({
        include: { term: { include: { curriculum: { include: { subject: true, gradeLevel: true } } } } },
      });

      // Teacher A creates a lesson
      const lesson = await db.lesson.create({
        data: {
          title: 'Initial Alpha Lesson',
          subject: unit.term.curriculum.subject.name,
          gradeLevel: unit.term.curriculum.gradeLevel.label,
          unitId: unit.id,
          authorId: teacherA.id,
          status: 'DRAFT',
          estimatedMinutes: 20,
        },
      });

      // Teacher A updates their own lesson
      const updateRes = await updateLesson(
        new Request(`http://localhost/api/lessons/${lesson.id}`, {
          method: 'PATCH',
          headers: {
            'content-type': 'application/json',
            ...(await authHeaderFor(teacherA)),
          },
          body: JSON.stringify({
            title: 'Updated Alpha Lesson Title',
            estimatedMinutes: 35,
            status: 'PUBLISHED',
          }),
        }),
        { params: Promise.resolve({ id: lesson.id }) },
      );

      expect(updateRes.status).toBe(200);
      const updatedData = await updateRes.json();
      expect(updatedData.data.lesson.title).toBe('Updated Alpha Lesson Title');
      expect(updatedData.data.lesson.estimatedMinutes).toBe(35);
      expect(updatedData.data.lesson.status).toBe('PUBLISHED');

      // Teacher B attempts to update Teacher A's lesson -> MUST RETURN 403 FORBIDDEN
      const forbiddenUpdateRes = await updateLesson(
        new Request(`http://localhost/api/lessons/${lesson.id}`, {
          method: 'PATCH',
          headers: {
            'content-type': 'application/json',
            ...(await authHeaderFor(teacherB)),
          },
          body: JSON.stringify({
            title: 'Hacked by Teacher B',
          }),
        }),
        { params: Promise.resolve({ id: lesson.id }) },
      );

      expect(forbiddenUpdateRes.status).toBe(403);

      // Teacher B attempts to archive Teacher A's lesson -> MUST RETURN 403 FORBIDDEN
      const forbiddenArchiveRes = await archiveLesson(
        new Request(`http://localhost/api/lessons/${lesson.id}`, {
          method: 'DELETE',
          headers: await authHeaderFor(teacherB),
        }),
        { params: Promise.resolve({ id: lesson.id }) },
      );

      expect(forbiddenArchiveRes.status).toBe(403);

      // Clean up
      await db.lesson.delete({ where: { id: lesson.id } });
    });
  });

  describe('Non-Destructive Archival & History Preservation', () => {
    it('archives a lesson without deleting student progress records', async () => {
      const teacher = await db.user.create({
        data: {
          email: emailFor('teacher'),
          passwordHash: 'test-hash-p4',
          role: 'TEACHER',
          displayName: 'Teacher Historian',
        },
      });

      const student = await db.user.create({
        data: {
          email: emailFor('student'),
          passwordHash: 'test-hash-p4',
          role: 'STUDENT',
          displayName: 'Progress Student',
        },
      });

      const unit = await db.unit.findFirstOrThrow({
        include: { term: { include: { curriculum: { include: { subject: true, gradeLevel: true } } } } },
      });

      const lesson = await db.lesson.create({
        data: {
          title: 'Lesson With Student History',
          subject: unit.term.curriculum.subject.name,
          gradeLevel: unit.term.curriculum.gradeLevel.label,
          unitId: unit.id,
          authorId: teacher.id,
          status: 'PUBLISHED',
        },
      });

      // Record student progress on this lesson
      await db.lessonProgress.create({
        data: {
          studentId: student.id,
          lessonId: lesson.id,
          status: 'COMPLETED',
          completedAt: new Date(),
        },
      });

      // Teacher archives the lesson
      const archiveRes = await archiveLesson(
        new Request(`http://localhost/api/lessons/${lesson.id}`, {
          method: 'DELETE',
          headers: await authHeaderFor(teacher),
        }),
        { params: Promise.resolve({ id: lesson.id }) },
      );

      expect(archiveRes.status).toBe(200);
      const archiveData = await archiveRes.json();
      expect(archiveData.data.lesson.status).toBe('ARCHIVED');

      // Verify that the lesson STILL exists in the database
      const dbLesson = await db.lesson.findUnique({ where: { id: lesson.id } });
      expect(dbLesson).not.toBeNull();
      expect(dbLesson?.status).toBe('ARCHIVED');

      // Verify that the student progress record STILL exists
      const progress = await db.lessonProgress.findUnique({
        where: {
          studentId_lessonId: {
            studentId: student.id,
            lessonId: lesson.id,
          },
        },
      });
      expect(progress).not.toBeNull();
      expect(progress?.status).toBe('COMPLETED');

      // Clean up
      await db.lessonProgress.delete({
        where: { studentId_lessonId: { studentId: student.id, lessonId: lesson.id } },
      });
      await db.lesson.delete({ where: { id: lesson.id } });
    });
  });

  describe('Subject & Unit Administration', () => {
    it('allows Admin to create and update subjects, and forbids non-admins', async () => {
      const admin = await db.user.create({
        data: {
          email: emailFor('admin'),
          passwordHash: 'test-hash-p4',
          role: 'ADMIN',
          displayName: 'Curriculum Administrator',
        },
      });

      const teacher = await db.user.create({
        data: {
          email: emailFor('teacher'),
          passwordHash: 'test-hash-p4',
          role: 'TEACHER',
          displayName: 'Standard Teacher',
        },
      });

      // Teacher attempts to create subject -> 403 Forbidden
      const teacherCreateRes = await createSubject(
        new Request('http://localhost/api/curriculum/subjects', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            ...(await authHeaderFor(teacher)),
          },
          body: JSON.stringify({
            code: 'P4_TEST_SUB',
            name: 'P4 Test Subject',
          }),
        }),
      );
      expect(teacherCreateRes.status).toBe(403);

      // Admin creates subject -> 201 Created
      const adminCreateRes = await createSubject(
        new Request('http://localhost/api/curriculum/subjects', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            ...(await authHeaderFor(admin)),
          },
          body: JSON.stringify({
            code: 'P4_TEST_SUB',
            name: 'P4 Test Subject',
            description: 'Created during Phase 4 curriculum tests',
          }),
        }),
      );

      expect(adminCreateRes.status).toBe(201);
      const subjectPayload = await adminCreateRes.json();
      const createdSubject = subjectPayload.data.subject;
      expect(createdSubject.code).toBe('P4_TEST_SUB');

      // Admin updates subject
      const updateRes = await updateSubject(
        new Request(`http://localhost/api/curriculum/subjects/${createdSubject.id}`, {
          method: 'PATCH',
          headers: {
            'content-type': 'application/json',
            ...(await authHeaderFor(admin)),
          },
          body: JSON.stringify({
            description: 'Updated subject description',
          }),
        }),
        { params: Promise.resolve({ id: createdSubject.id }) },
      );

      expect(updateRes.status).toBe(200);
      const updatedSubjectData = await updateRes.json();
      expect(updatedSubjectData.data.subject.description).toBe('Updated subject description');

      // Clean up subject & its automatically generated curricula
      await db.curriculum.deleteMany({ where: { subjectId: createdSubject.id } });
      await db.subject.delete({ where: { id: createdSubject.id } });
    });

    it('allows Teachers to create, update, and safely archive curriculum units', async () => {
      const teacher = await db.user.create({
        data: {
          email: emailFor('teacher'),
          passwordHash: 'test-hash-p4',
          role: 'TEACHER',
          displayName: 'Unit Author Teacher',
        },
      });

      const term = await db.term.findFirstOrThrow();

      // Teacher creates unit
      const createUnitRes = await createUnit(
        new Request('http://localhost/api/curriculum/units', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            ...(await authHeaderFor(teacher)),
          },
          body: JSON.stringify({
            termId: term.id,
            title: 'Phase 4 Experimental Unit',
            description: 'A newly created unit for geometry',
            position: 99,
          }),
        }),
      );

      expect(createUnitRes.status).toBe(201);
      const unitPayload = await createUnitRes.json();
      const unitId = unitPayload.data.unit.id;
      expect(unitPayload.data.unit.title).toBe('Phase 4 Experimental Unit');

      // Teacher updates unit
      const updateUnitRes = await updateUnit(
        new Request(`http://localhost/api/curriculum/units/${unitId}`, {
          method: 'PATCH',
          headers: {
            'content-type': 'application/json',
            ...(await authHeaderFor(teacher)),
          },
          body: JSON.stringify({
            title: 'Updated Experimental Unit Title',
          }),
        }),
        { params: Promise.resolve({ id: unitId }) },
      );

      expect(updateUnitRes.status).toBe(200);

      // Teacher archives unit non-destructively
      const archiveUnitRes = await archiveUnit(
        new Request(`http://localhost/api/curriculum/units/${unitId}`, {
          method: 'DELETE',
          headers: await authHeaderFor(teacher),
        }),
        { params: Promise.resolve({ id: unitId }) },
      );

      expect(archiveUnitRes.status).toBe(200);

      // Clean up unit
      await db.unit.delete({ where: { id: unitId } });
    });
  });

  describe('Search & Filtering', () => {
    it('filters curriculum hierarchy by search keyword and grade level', async () => {
      const student = await db.user.create({
        data: {
          email: emailFor('student'),
          passwordHash: 'test-hash-p4',
          role: 'STUDENT',
          displayName: 'Filter Student',
        },
      });

      // Filter by search keyword
      const searchRes = await getCurriculum(
        new Request('http://localhost/api/curriculum?search=integers', {
          headers: await authHeaderFor(student),
        }),
      );

      expect(searchRes.status).toBe(200);
      const searchData = await searchRes.json();
      expect(searchData.success).toBe(true);

      // Filter by grade level
      const gradeRes = await getCurriculum(
        new Request('http://localhost/api/curriculum?gradeLevel=7', {
          headers: await authHeaderFor(student),
        }),
      );

      expect(gradeRes.status).toBe(200);
      const gradeData = await gradeRes.json();
      const mathSubject = gradeData.data.subjects.find((s: { code: string }) => s.code === 'MATHEMATICS');
      expect(mathSubject.curricula.length).toBe(1);
      expect(mathSubject.curricula[0].gradeLevel.level).toBe(7);
    });
  });

  describe('Subject, Unit & Lesson Route Verification', () => {
    it('verifies listSubjects, getSubject, getUnit, and reordering endpoints', async () => {
      const teacher = await db.user.create({
        data: {
          email: emailFor('teacher'),
          passwordHash: 'test-hash-p4',
          role: 'TEACHER',
          displayName: 'Endpoint Test Teacher',
        },
      });

      // 1. listSubjects
      const listSubjectsRes = await listSubjects(
        new Request('http://localhost/api/curriculum/subjects', {
          headers: await authHeaderFor(teacher),
        }),
      );
      expect(listSubjectsRes.status).toBe(200);
      const listPayload = await listSubjectsRes.json();
      expect(listPayload.data.subjects.length).toBeGreaterThanOrEqual(3);

      // 2. getSubject
      const mathSubject = listPayload.data.subjects.find((s: { code: string }) => s.code === 'MATHEMATICS');
      const getSubjectRes = await getSubject(
        new Request(`http://localhost/api/curriculum/subjects/${mathSubject.id}`, {
          headers: await authHeaderFor(teacher),
        }),
        { params: Promise.resolve({ id: mathSubject.id }) },
      );
      expect(getSubjectRes.status).toBe(200);
      const getSubjectPayload = await getSubjectRes.json();
      expect(getSubjectPayload.data.subject.name).toBe('Mathematics');

      // 3. getGrade
      const grade7 = await db.gradeLevel.findUniqueOrThrow({ where: { level: 7 } });
      const getGradeRes = await getGrade(
        new Request(`http://localhost/api/curriculum/grades/${grade7.id}`, {
          headers: await authHeaderFor(teacher),
        }),
        { params: Promise.resolve({ id: grade7.id }) },
      );
      expect(getGradeRes.status).toBe(200);
      const getGradePayload = await getGradeRes.json();
      expect(getGradePayload.data.grade.level).toBe(7);

      // 4. getTerm
      const firstTerm = await db.term.findFirstOrThrow();
      const getTermRes = await getTerm(
        new Request(`http://localhost/api/curriculum/terms/${firstTerm.id}`, {
          headers: await authHeaderFor(teacher),
        }),
        { params: Promise.resolve({ id: firstTerm.id }) },
      );
      expect(getTermRes.status).toBe(200);
      const getTermPayload = await getTermRes.json();
      expect(getTermPayload.data.term.id).toBe(firstTerm.id);

      // 5. getUnit
      const firstUnit = await db.unit.findFirstOrThrow({
        include: { term: { include: { curriculum: { include: { subject: true, gradeLevel: true } } } } },
      });
      const getUnitRes = await getUnit(
        new Request(`http://localhost/api/curriculum/units/${firstUnit.id}`, {
          headers: await authHeaderFor(teacher),
        }),
        { params: Promise.resolve({ id: firstUnit.id }) },
      );
      expect(getUnitRes.status).toBe(200);
      const getUnitPayload = await getUnitRes.json();
      expect(getUnitPayload.data.unit.id).toBe(firstUnit.id);

      // 6. reorderUnits
      const unitsInTerm = await db.unit.findMany({
        where: { termId: firstUnit.termId },
        orderBy: { position: 'asc' },
        select: { id: true },
      });
      if (unitsInTerm.length >= 2) {
        const reversedIds = unitsInTerm.map((u) => u.id).reverse();
        const reorderRes = await reorderUnits(
          new Request('http://localhost/api/curriculum/units/reorder', {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              ...(await authHeaderFor(teacher)),
            },
            body: JSON.stringify({
              termId: firstUnit.termId,
              unitIds: reversedIds,
            }),
          }),
        );
        expect(reorderRes.status).toBe(200);
        // restore original order
        await reorderUnits(
          new Request('http://localhost/api/curriculum/units/reorder', {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              ...(await authHeaderFor(teacher)),
            },
            body: JSON.stringify({
              termId: firstUnit.termId,
              unitIds: unitsInTerm.map((u) => u.id),
            }),
          }),
        );
      }

      // 5. createLesson & reorderLessons
      const newLessonRes1 = await createLesson(
        new Request('http://localhost/api/lessons', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            ...(await authHeaderFor(teacher)),
          },
          body: JSON.stringify({
            title: 'Reorder Test Lesson 1',
            subject: firstUnit.term.curriculum.subject.name,
            gradeLevel: firstUnit.term.curriculum.gradeLevel.label,
            unitId: firstUnit.id,
            status: 'DRAFT',
          }),
        }),
      );
      expect(newLessonRes1.status).toBe(201);
      const lesson1Data = await newLessonRes1.json();

      const newLessonRes2 = await createLesson(
        new Request('http://localhost/api/lessons', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            ...(await authHeaderFor(teacher)),
          },
          body: JSON.stringify({
            title: 'Reorder Test Lesson 2',
            subject: firstUnit.term.curriculum.subject.name,
            gradeLevel: firstUnit.term.curriculum.gradeLevel.label,
            unitId: firstUnit.id,
            status: 'DRAFT',
          }),
        }),
      );
      expect(newLessonRes2.status).toBe(201);
      const lesson2Data = await newLessonRes2.json();

      const reorderLessonsRes = await reorderLessons(
        new Request('http://localhost/api/lessons/reorder', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            ...(await authHeaderFor(teacher)),
          },
          body: JSON.stringify({
            unitId: firstUnit.id,
            lessonIds: [lesson2Data.data.lesson.id, lesson1Data.data.lesson.id],
          }),
        }),
      );
      expect(reorderLessonsRes.status).toBe(200);

      // Clean up test lessons
      await db.lesson.deleteMany({
        where: { id: { in: [lesson1Data.data.lesson.id, lesson2Data.data.lesson.id] } },
      });
    });
  });
});

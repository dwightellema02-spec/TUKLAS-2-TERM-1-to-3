import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { GET as getAssessment } from '../src/app/api/assessments/[id]/route';
import { POST as submitAssessment } from '../src/app/api/assessments/[id]/submit/route';
import { GET as getProgress } from '../src/app/api/progress/route';
import { GET as getLessonProgress } from '../src/app/api/progress/lessons/[id]/route';
import { GET as getMistakes } from '../src/app/api/mistakes/route';
import { POST as resolveMistake } from '../src/app/api/mistakes/[id]/resolve/route';
import { GET as getProfile, PATCH as updateProfile } from '../src/app/api/profile/route';
import { POST as register } from '../src/app/api/auth/register/route';
import { db } from '../src/server/db';
import { MasteryService } from '../src/services/mastery.service';
import { ProgressService } from '../src/services/progress.service';

const emailFor = (prefix = 'phase2-test') => `${prefix}-${randomUUID()}@example.com`;

afterEach(async () => {
  const users = await db.user.findMany({
    where: { email: { startsWith: 'phase2-test-' } },
    select: { id: true },
  });
  const userIds = users.map((u) => u.id);

  if (userIds.length > 0) {
    await db.mistakeRecord.deleteMany({ where: { studentId: { in: userIds } } });
    await db.assessmentAnswer.deleteMany({
      where: { attempt: { studentId: { in: userIds } } },
    });
    await db.quizAttempt.deleteMany({ where: { studentId: { in: userIds } } });
    await db.lessonProgress.deleteMany({ where: { studentId: { in: userIds } } });
    await db.studentProfile.deleteMany({ where: { userId: { in: userIds } } });
    await db.teacherProfile.deleteMany({ where: { userId: { in: userIds } } });
    await db.user.deleteMany({ where: { id: { in: userIds } } });
  }
});

describe('Phase 2 — Real Backend & Database Foundation', () => {
  describe('Seed Data Verification', () => {
    it('has seeded demo admin, teacher, and student accounts with profiles', async () => {
      const admin = await db.user.findUnique({
        where: { id: 'demo-admin-account' },
      });
      expect(admin).toBeTruthy();
      expect(admin?.role).toBe('ADMIN');
      expect(admin?.isActive).toBe(true);

      const teacher = await db.user.findUnique({
        where: { id: 'demo-curriculum-author' },
        include: { teacherProfile: true },
      });
      expect(teacher).toBeTruthy();
      expect(teacher?.role).toBe('TEACHER');
      expect(teacher?.teacherProfile?.schoolName).toBe('Rizal National High School');

      const student1 = await db.user.findUnique({
        where: { id: 'demo-student-juan' },
        include: { studentProfile: true },
      });
      expect(student1).toBeTruthy();
      expect(student1?.role).toBe('STUDENT');
      expect(student1?.studentProfile?.studentNumber).toBe('STU-2026-001');

      const student2 = await db.user.findUnique({
        where: { id: 'demo-student-maria' },
        include: { studentProfile: true },
      });
      expect(student2).toBeTruthy();
      expect(student2?.role).toBe('STUDENT');
      expect(student2?.studentProfile?.studentNumber).toBe('STU-2026-002');
    });

    it('has seeded real curriculum, lesson content, YouTube sources, and assessment questions', async () => {
      const lesson = await db.lesson.findUnique({
        where: { id: 'lesson-math-7-integers' },
        include: {
          sources: true,
          sections: true,
          vocabulary: true,
          checks: true,
          assessments: {
            include: { questions: true },
          },
        },
      });

      expect(lesson).toBeTruthy();
      expect(lesson?.title).toBe('Operations on Integers');
      expect(lesson?.sources.length).toBeGreaterThan(0);
      expect(lesson?.sources[0].provider).toBe('youtube');
      expect(lesson?.sources[0].videoId).toBe('kYJv8y-9q5U');

      expect(lesson?.sections.length).toBeGreaterThan(0);
      expect(lesson?.vocabulary.length).toBeGreaterThan(0);
      expect(lesson?.checks.length).toBeGreaterThan(0);

      expect(lesson?.assessments.length).toBeGreaterThan(0);
      expect(lesson?.assessments[0].questions.length).toBe(4);
    });
  });

  describe('Assessment API & Server-Authoritative Scoring', () => {
    it('enforces anti-cheating by stripping correct answers and explanations for students', async () => {
      const studentEmail = emailFor('anti-cheat-stu');
      const studentReg = await register(
        new Request('http://localhost/api/auth/register', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            email: studentEmail,
            password: 'StrongPass123!',
            displayName: 'Honest Student',
            role: 'STUDENT',
          }),
        }),
      );
      const studentCookie = studentReg.headers.get('set-cookie') ?? '';

      const response = await getAssessment(
        new Request('http://localhost/api/assessments/assessment-math-7-integers', {
          headers: { Cookie: studentCookie },
        }),
        { params: Promise.resolve({ id: 'assessment-math-7-integers' }) },
      );

      expect(response.status).toBe(200);
      const payload = await response.json();
      expect(payload.success).toBe(true);
      expect(payload.data.assessment.questions.length).toBe(4);

      for (const q of payload.data.assessment.questions) {
        expect(q).not.toHaveProperty('correctIndex');
        expect(q).not.toHaveProperty('correctAnswer');
        expect(q).not.toHaveProperty('explanation');
      }
    });

    it('allows teachers to view the full answer keys and explanations', async () => {
      const teacherEmail = emailFor('anti-cheat-teach');
      const teacherReg = await register(
        new Request('http://localhost/api/auth/register', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            email: teacherEmail,
            password: 'StrongPass123!',
            displayName: 'Exam Proctor',
            role: 'TEACHER',
            inviteCode: process.env.TEACHER_INVITE_CODE,
          }),
        }),
      );
      const teacherCookie = teacherReg.headers.get('set-cookie') ?? '';

      const response = await getAssessment(
        new Request('http://localhost/api/assessments/assessment-math-7-integers', {
          headers: { Cookie: teacherCookie },
        }),
        { params: Promise.resolve({ id: 'assessment-math-7-integers' }) },
      );

      expect(response.status).toBe(200);
      const payload = await response.json();
      expect(payload.success).toBe(true);

      const q1 = payload.data.assessment.questions[0];
      expect(q1).toHaveProperty('correctIndex');
      expect(q1).toHaveProperty('explanation');
    });

    it('evaluates student answers authoritatively, records mistakes, and updates progress transactionally', async () => {
      const studentEmail = emailFor('scoring-stu');
      const studentReg = await register(
        new Request('http://localhost/api/auth/register', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            email: studentEmail,
            password: 'StrongPass123!',
            displayName: 'Evaluating Student',
            role: 'STUDENT',
          }),
        }),
      );
      const studentCookie = studentReg.headers.get('set-cookie') ?? '';
      const studentUser = await db.user.findUniqueOrThrow({ where: { email: studentEmail } });

      // Submitting 3 correct and 1 incorrect:
      // Q1: correctIndex = 1 (we submit 1 -> correct)
      // Q2: correctIndex = 1 (we submit 1 -> correct)
      // Q3: correctIndex = 0 (we submit 0 -> correct)
      // Q4: correctIndex = 2 (we submit 0 -> wrong!)
      const submitResponse = await submitAssessment(
        new Request('http://localhost/api/assessments/assessment-math-7-integers/submit', {
          method: 'POST',
          headers: { 'content-type': 'application/json', Cookie: studentCookie },
          body: JSON.stringify({
            answers: [
              { questionId: 'quiz-q-integers-1', selectedIndex: 1 },
              { questionId: 'quiz-q-integers-2', selectedIndex: 1 },
              { questionId: 'quiz-q-integers-3', selectedIndex: 0 },
              { questionId: 'quiz-q-integers-4', selectedIndex: 0 }, // wrong answer
            ],
          }),
        }),
        { params: Promise.resolve({ id: 'assessment-math-7-integers' }) },
      );

      expect(submitResponse.status).toBe(200);
      const submitPayload = await submitResponse.json();
      expect(submitPayload.success).toBe(true);
      expect(submitPayload.data.result.total).toBe(4);
      expect(submitPayload.data.result.correct).toBe(3);
      expect(submitPayload.data.result.score).toBe(75);
      expect(submitPayload.data.result.passed).toBe(true); // 75 >= 75 passingScore

      // Verify QuizAttempt persisted
      const attempt = await db.quizAttempt.findUnique({
        where: { id: submitPayload.data.result.attemptId },
        include: { answers: true, mistakes: true },
      });
      expect(attempt).toBeTruthy();
      expect(attempt?.score).toBe(75);
      expect(attempt?.answers.length).toBe(4);
      expect(attempt?.mistakes.length).toBe(1);
      expect(attempt?.mistakes[0].questionId).toBe('quiz-q-integers-4');

      // Verify LessonProgress updated atomically
      const progress = await db.lessonProgress.findUnique({
        where: {
          studentId_lessonId: {
            studentId: studentUser.id,
            lessonId: 'lesson-math-7-integers',
          },
        },
      });
      expect(progress).toBeTruthy();
      expect(progress?.status).toBe('COMPLETED');
      expect(progress?.latestScore).toBe(75);
      expect(progress?.bestScore).toBe(75);
      expect(progress?.assessmentAttempts).toBe(1);
    });

    it('denies teachers from submitting student assessments', async () => {
      const teacherEmail = emailFor('teacher-denied');
      const teacherReg = await register(
        new Request('http://localhost/api/auth/register', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            email: teacherEmail,
            password: 'StrongPass123!',
            displayName: 'Teacher User',
            role: 'TEACHER',
            inviteCode: process.env.TEACHER_INVITE_CODE,
          }),
        }),
      );
      const teacherCookie = teacherReg.headers.get('set-cookie') ?? '';

      const submitResponse = await submitAssessment(
        new Request('http://localhost/api/assessments/assessment-math-7-integers/submit', {
          method: 'POST',
          headers: { 'content-type': 'application/json', Cookie: teacherCookie },
          body: JSON.stringify({
            answers: [{ questionId: 'quiz-q-integers-1', selectedIndex: 1 }],
          }),
        }),
        { params: Promise.resolve({ id: 'assessment-math-7-integers' }) },
      );

      expect(submitResponse.status).toBe(403);
    });
  });

  describe('Student Progress & Mistakes API', () => {
    it('retrieves persistent student progress and summary metrics', async () => {
      const studentEmail = emailFor('progress-query-stu');
      const studentReg = await register(
        new Request('http://localhost/api/auth/register', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            email: studentEmail,
            password: 'StrongPass123!',
            displayName: 'Tracked Student',
            role: 'STUDENT',
          }),
        }),
      );
      const cookie = studentReg.headers.get('set-cookie') ?? '';

      const progressResponse = await getProgress(
        new Request('http://localhost/api/progress', {
          headers: { Cookie: cookie },
        }),
      );

      expect(progressResponse.status).toBe(200);
      const payload = await progressResponse.json();
      expect(payload.success).toBe(true);
      expect(payload.data.summary).toHaveProperty('totalLessonsTracked');
      expect(payload.data.summary).toHaveProperty('completedCount');
      expect(payload.data.summary).toHaveProperty('masteredCount');

      // Before student has progress on the lesson, querying returns 404
      const notFoundRes = await getLessonProgress(
        new Request('http://localhost/api/progress/lessons/lesson-math-7-integers', {
          headers: { Cookie: cookie },
        }),
        { params: Promise.resolve({ id: 'lesson-math-7-integers' }) },
      );
      expect(notFoundRes.status).toBe(404);

      // Student records progress on the lesson
      const user = await db.user.findUniqueOrThrow({ where: { email: studentEmail } });
      await ProgressService.updateProgress(user.id, 'lesson-math-7-integers', {
        status: 'IN_PROGRESS',
      });

      const lessonProgressRes = await getLessonProgress(
        new Request('http://localhost/api/progress/lessons/lesson-math-7-integers', {
          headers: { Cookie: cookie },
        }),
        { params: Promise.resolve({ id: 'lesson-math-7-integers' }) },
      );
      expect(lessonProgressRes.status).toBe(200);
      const lessonProgressPayload = await lessonProgressRes.json();
      expect(lessonProgressPayload.success).toBe(true);
      expect(lessonProgressPayload.data.progress.status).toBe('IN_PROGRESS');
    });

    it('prevents student A from viewing or resolving student B mistakes', async () => {
      const studentAEmail = emailFor('student-a');
      const studentBEmail = emailFor('student-b');

      const regA = await register(
        new Request('http://localhost/api/auth/register', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            email: studentAEmail,
            password: 'StrongPass123!',
            displayName: 'Student A',
            role: 'STUDENT',
          }),
        }),
      );
      const regB = await register(
        new Request('http://localhost/api/auth/register', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            email: studentBEmail,
            password: 'StrongPass123!',
            displayName: 'Student B',
            role: 'STUDENT',
          }),
        }),
      );

      const cookieA = regA.headers.get('set-cookie') ?? '';
      const cookieB = regB.headers.get('set-cookie') ?? '';

      const userA = await db.user.findUniqueOrThrow({ where: { email: studentAEmail } });
      const userB = await db.user.findUniqueOrThrow({ where: { email: studentBEmail } });
      expect(userB.id).toBeDefined();

      // Create a mistake record for Student A
      const mistakeA = await db.mistakeRecord.create({
        data: {
          studentId: userA.id,
          submittedAnswer: 'Wrong Answer',
          correctReference: 'Right Answer',
          category: 'CONCEPTUAL',
        },
      });

      // Student B queries mistakes -> mistakeA must NOT be returned
      const getBResponse = await getMistakes(
        new Request('http://localhost/api/mistakes', {
          headers: { Cookie: cookieB },
        }),
      );
      expect(getBResponse.status).toBe(200);
      const mistakesB = (await getBResponse.json()).data.mistakes;
      expect(mistakesB.some((m: { id: string }) => m.id === mistakeA.id)).toBe(false);

      // Student B attempts to resolve Student A's mistake -> 403 Forbidden
      const resolveResponse = await resolveMistake(
        new Request(`http://localhost/api/mistakes/${mistakeA.id}/resolve`, {
          method: 'POST',
          headers: { Cookie: cookieB },
        }),
        { params: Promise.resolve({ id: mistakeA.id }) },
      );
      expect(resolveResponse.status).toBe(403);

      // Student A resolves their own mistake -> 200 OK
      const resolveResponseA = await resolveMistake(
        new Request(`http://localhost/api/mistakes/${mistakeA.id}/resolve`, {
          method: 'POST',
          headers: { Cookie: cookieA },
        }),
        { params: Promise.resolve({ id: mistakeA.id }) },
      );
      expect(resolveResponseA.status).toBe(200);
      const updatedMistake = await db.mistakeRecord.findUniqueOrThrow({ where: { id: mistakeA.id } });
      expect(updatedMistake.resolved).toBe(true);
    });
  });

  describe('StudentProfile and TeacherProfile Persistence', () => {
    it('creates and updates StudentProfile metadata via profile endpoint', async () => {
      const studentEmail = emailFor('profile-academic');
      const reg = await register(
        new Request('http://localhost/api/auth/register', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            email: studentEmail,
            password: 'StrongPass123!',
            displayName: 'Academic Student',
            role: 'STUDENT',
          }),
        }),
      );
      const cookie = reg.headers.get('set-cookie') ?? '';

      const updateRes = await updateProfile(
        new Request('http://localhost/api/profile', {
          method: 'PATCH',
          headers: { 'content-type': 'application/json', Cookie: cookie },
          body: JSON.stringify({
            studentNumber: 'LRN-123456789012',
            gradeLevel: 'Grade 7',
            section: 'Orchid',
            schoolName: 'Quezon City High School',
            bio: 'Learning science enthusiastically.',
          }),
        }),
      );

      expect(updateRes.status).toBe(200);
      const payload = await updateRes.json();
      expect(payload.data.user.studentProfile.studentNumber).toBe('LRN-123456789012');
      expect(payload.data.user.studentProfile.section).toBe('Orchid');

      // Verify retrieval via GET
      const getRes = await getProfile(
        new Request('http://localhost/api/profile', {
          headers: { Cookie: cookie },
        }),
      );
      expect(getRes.status).toBe(200);
      const getPayload = await getRes.json();
      expect(getPayload.data.user.studentProfile.studentNumber).toBe('LRN-123456789012');
    });
  });

  describe('Mastery & Research Metrics Calculation', () => {
    it('computes rolling mastery across understanding, accuracy, application, and consistency', async () => {
      const studentEmail = emailFor('mastery-test-stu');
      const reg = await register(
        new Request('http://localhost/api/auth/register', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            email: studentEmail,
            password: 'StrongPass123!',
            displayName: 'Mastery Candidate',
            role: 'STUDENT',
          }),
        }),
      );
      expect(reg.status).toBe(201);
      const user = await db.user.findUniqueOrThrow({ where: { email: studentEmail } });

      // First attempt: 80% on Integers
      const m1 = await MasteryService.recordPerformance(
        user.id,
        'Mathematics',
        'Operations on Integers',
        80,
        true,
      );
      expect(m1.mastery).toBe(80);
      expect(m1.accuracy).toBe(80);
      expect(m1.consistency).toBe(80);

      // Second attempt: 90% on Integers
      const m2 = await MasteryService.recordPerformance(
        user.id,
        'Mathematics',
        'Operations on Integers',
        90,
        true,
      );
      expect(m2.accuracy).toBeGreaterThan(80);
      expect(m2.consistency).toBeGreaterThan(80);
    });
  });
});

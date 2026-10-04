import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { db } from '../src/server/db';
import { createSessionToken, SESSION_COOKIE_NAME } from '../src/server/auth';
import { ClassInsightsService, INSIGHT, manilaDay, recentDays } from '../src/services/class-insights.service';
import { GET as classInsights } from '../src/app/api/classes/[id]/insights/route';
import { GET as studentInsight } from '../src/app/api/classes/[id]/students/[userId]/route';

const PREFIX = 'insight-test-';
// 2026-10-04 12:00 in Manila (UTC+8).
const NOW = new Date('2026-10-04T04:00:00.000Z');
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

type Role = 'STUDENT' | 'TEACHER' | 'ADMIN';

async function actor(role: Role, tag: string) {
  const user = await db.user.create({
    data: { email: `${PREFIX}${tag}-${randomUUID()}@example.com`, passwordHash: 'x', role, displayName: `${role} ${tag}` },
  });
  const token = await createSessionToken({ id: user.id, email: user.email, displayName: user.displayName, role });
  return { user, cookie: `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}` };
}

const ctx = <T extends Record<string, string>>(params: T) => ({ params: Promise.resolve(params) });
const get = (cookie: string) => new Request('http://localhost/api/x', { headers: cookie ? { Cookie: cookie } : {} });

async function makeClass(teacherId: string, studentIds: string[]) {
  const cls = await db.class.create({ data: { name: `${PREFIX}class-${randomUUID().slice(0, 6)}`, teacherId } });
  for (const userId of studentIds) await db.classMember.create({ data: { classId: cls.id, userId } });
  return cls;
}

type Ans = { q: string; picked: number; correct: boolean; at: Date; skill?: string };
const OPTIONS = ['1', '5', '−1', '0'];

async function practise(studentId: string, answers: Ans[]) {
  return db.practiceSession.create({
    data: {
      studentId,
      lessonId: 'lesson-math-7-integers',
      subject: 'Mathematics',
      topic: 'Integers',
      difficulty: 'EASY',
      total: answers.length,
      correct: answers.filter((a) => a.correct).length,
      startedAt: answers[0]?.at ?? NOW,
      answers: {
        create: answers.map((a) => ({
          question: a.q,
          options: OPTIONS,
          correctIndex: 0,
          selectedIndex: a.picked,
          correct: a.correct,
          skill: a.skill ?? 'Adding integers',
          answeredAt: a.at,
        })),
      },
    },
  });
}

afterEach(async () => {
  const users = await db.user.findMany({ where: { email: { startsWith: PREFIX } }, select: { id: true } });
  const ids = users.map((u) => u.id);
  await db.class.deleteMany({ where: { teacherId: { in: ids } } });
  await db.user.deleteMany({ where: { id: { in: ids } } });
});

describe('Manila calendar days', () => {
  it('uses the school time zone, not UTC', () => {
    expect(manilaDay(new Date('2026-10-03T17:00:00Z'))).toBe('2026-10-04'); // 01:00 in Manila
    expect(manilaDay(new Date('2026-10-03T15:59:00Z'))).toBe('2026-10-03'); // 23:59 in Manila
  });

  it('lists the last 14 days ending today, oldest first', () => {
    const days = recentDays(NOW);
    expect(days).toHaveLength(INSIGHT.days);
    expect(days[0]).toBe('2026-09-21');
    expect(days[13]).toBe('2026-10-04');
  });
});

describe('class insights', () => {
  it('shows an empty class honestly: nothing invented', async () => {
    const teacher = await actor('TEACHER', 'empty');
    const cls = await makeClass(teacher.user.id, []);
    const insights = await ClassInsightsService.getClassInsights(cls.id, { id: teacher.user.id, role: 'TEACHER' }, NOW);
    expect(insights.summary).toEqual({ studentCount: 0, activeStudents: 0, questionsAnswered: 0, accuracy: null });
    expect(insights.skills).toEqual([]);
    expect(insights.hardestQuestions).toEqual([]);
    expect(insights.mistakeCategories).toEqual([]);
    expect(insights.lessons).toEqual([]);
    expect(insights.activity).toHaveLength(14);
    expect(insights.activity.every((day) => day.questions === 0 && day.students === 0)).toBe(true);
  });

  it('shows students who have not practised as having no evidence', async () => {
    const teacher = await actor('TEACHER', 'quiet');
    const pupil = await actor('STUDENT', 'quiet');
    const cls = await makeClass(teacher.user.id, [pupil.user.id]);
    const insights = await ClassInsightsService.getClassInsights(cls.id, { id: teacher.user.id, role: 'TEACHER' }, NOW);
    expect(insights.summary).toMatchObject({ studentCount: 1, activeStudents: 0, questionsAnswered: 0, accuracy: null });
    expect(insights.skills).toEqual([]);
  });

  it('computes exact figures from the class’s own rows', async () => {
    const teacher = await actor('TEACHER', 'figures');
    const [a, b, c] = await Promise.all([actor('STUDENT', 'a'), actor('STUDENT', 'b'), actor('STUDENT', 'c')]);
    const cls = await makeClass(teacher.user.id, [a.user.id, b.user.id, c.user.id]);
    const today = new Date(NOW.getTime());
    const yesterday = new Date(NOW.getTime() - DAY);
    const old = new Date(NOW.getTime() - 20 * DAY);

    // "Hard": 3 students, 1 correct of 3. A and B both pick option 1 ("5").
    // "Easy": everyone correct. "Rare": one student three times. "Thin": two attempts only.
    await practise(a.user.id, [
      { q: 'HARD 3 + (−2)', picked: 1, correct: false, at: today },
      { q: 'EASY 1 + 1', picked: 0, correct: true, at: today },
      { q: 'RARE 9 − 9', picked: 1, correct: false, at: yesterday },
      { q: 'RARE 9 − 9', picked: 1, correct: false, at: yesterday },
      { q: 'RARE 9 − 9', picked: 1, correct: false, at: yesterday },
      { q: 'THIN 2 + 2', picked: 1, correct: false, at: old },
    ]);
    await practise(b.user.id, [
      { q: 'HARD 3 + (−2)', picked: 1, correct: false, at: today },
      { q: 'EASY 1 + 1', picked: 0, correct: true, at: yesterday },
      { q: 'THIN 2 + 2', picked: 2, correct: false, at: yesterday },
    ]);
    await practise(c.user.id, [
      { q: 'HARD 3 + (−2)', picked: 0, correct: true, at: new Date('2026-10-03T17:00:00Z') }, // 01:00 on Oct 4 in Manila
      { q: 'EASY 1 + 1', picked: 0, correct: true, at: today },
    ]);

    const skill = await db.skill.findUniqueOrThrow({ where: { code: 'G7-INT-ADD' } });
    for (const [student, status] of [[a, 'LEARNING'], [b, 'LEARNING'], [c, 'PROFICIENT']] as const) {
      await db.skillMastery.create({
        data: { studentId: student.user.id, skillId: skill.id, status, ruleCode: 'T', attemptCount: 3, accuracy: 0.5, recentAccuracy: 0.5, consistency: 0.5, details: {}, masteryVersion: 'test' },
      });
    }
    await db.mistakeRecord.createMany({
      data: [
        { studentId: a.user.id, submittedAnswer: '5', category: 'SIGN_ERROR', resolved: false },
        { studentId: a.user.id, submittedAnswer: '5', category: 'SIGN_ERROR', resolved: true },
        { studentId: b.user.id, submittedAnswer: '5', category: 'SIGN_ERROR', resolved: false },
        { studentId: b.user.id, submittedAnswer: '1', category: null, resolved: false },
      ],
    });
    await db.lessonProgress.create({ data: { studentId: a.user.id, lessonId: 'lesson-math-7-integers', status: 'COMPLETED' } });
    await db.lessonProgress.create({ data: { studentId: b.user.id, lessonId: 'lesson-math-7-integers', status: 'IN_PROGRESS' } });
    await db.lessonProgress.create({ data: { studentId: c.user.id, lessonId: 'lesson-math-7-integers', status: 'NOT_STARTED' } });

    const insights = await ClassInsightsService.getClassInsights(cls.id, { id: teacher.user.id, role: 'TEACHER' }, NOW);

    // Window = last 14 days: the 20-day-old answer is excluded. 5+... count by hand:
    // A: today 2, yesterday 3 (= 5); B: today 1, yesterday 2 (= 3); C: today 2 (= 2)  → 10 answers.
    // Correct in window: A 1, B 1, C 2 = 4 → 40%.
    expect(insights.summary).toEqual({ studentCount: 3, activeStudents: 3, questionsAnswered: 10, accuracy: 40 });

    const byDay = Object.fromEntries(insights.activity.map((day) => [day.date, day]));
    expect(byDay['2026-10-04']).toEqual({ date: '2026-10-04', students: 3, questions: 5 }); // A 2, B 1, C 2 (incl. the 01:00 Manila answer)
    expect(byDay['2026-10-03']).toEqual({ date: '2026-10-03', students: 2, questions: 5 }); // A 3, B 2
    expect(byDay['2026-10-02'].questions).toBe(0);

    // Skills: all-time answers for "Adding integers" = 11 (A 6, B 3, C 2), correct = 4 (A 1, B 1, C 2) → 36%.
    expect(insights.skills).toHaveLength(1);
    expect(insights.skills[0]).toMatchObject({
      name: 'Adding integers',
      studentsWithEvidence: 3,
      studentsWithoutEvidence: 0,
      levels: { LEARNING: 2, DEVELOPING: 0, PROFICIENT: 1, MASTERED: 0 },
      answers: 11,
      accuracy: 36,
    });

    // Hard questions: only HARD qualifies (EASY is all-correct, RARE has one student, THIN has two attempts).
    expect(insights.hardestQuestions).toHaveLength(1);
    expect(insights.hardestQuestions[0]).toMatchObject({
      question: 'HARD 3 + (−2)',
      attempts: 3,
      students: 3,
      correctRate: 33,
      correctAnswer: '1',
      commonWrongAnswer: { text: '5', count: 2 },
    });

    expect(insights.mistakeCategories).toEqual([
      { category: 'SIGN_ERROR', count: 3, unresolved: 2, students: 2 },
      { category: 'UNCLASSIFIED', count: 1, unresolved: 1, students: 1 },
    ]);

    // NOT_STARTED rows do not count as lesson activity.
    expect(insights.lessons).toEqual([
      { id: 'lesson-math-7-integers', title: 'Operations on Integers', completed: 1, inProgress: 1, practised: 3, studentCount: 3 },
    ]);

    // No student is named in the class-level hard-question list.
    expect(JSON.stringify(insights.hardestQuestions)).not.toMatch(/insight-test-/);
  });

  it('lists a lesson the class only PRACTISED (regression: found by the full-loop browser test)', async () => {
    const teacher = await actor('TEACHER', 'practiceonly');
    const pupil = await actor('STUDENT', 'practiceonly');
    const cls = await makeClass(teacher.user.id, [pupil.user.id]);
    await practise(pupil.user.id, [{ q: 'ONLY PRACTICE', picked: 0, correct: true, at: NOW }]); // no LessonProgress row exists
    const insights = await ClassInsightsService.getClassInsights(cls.id, { id: teacher.user.id, role: 'TEACHER' }, NOW);
    expect(insights.lessons).toEqual([
      { id: 'lesson-math-7-integers', title: 'Operations on Integers', completed: 0, inProgress: 0, practised: 1, studentCount: 1 },
    ]);
  });

  it('never includes students of another class', async () => {
    const teacher = await actor('TEACHER', 'mine');
    const rival = await actor('TEACHER', 'rival');
    const mine = await actor('STUDENT', 'mine');
    const theirs = await actor('STUDENT', 'theirs');
    const cls = await makeClass(teacher.user.id, [mine.user.id]);
    await makeClass(rival.user.id, [theirs.user.id]);
    await practise(theirs.user.id, [{ q: 'OTHER CLASS', picked: 1, correct: false, at: NOW }]);

    const insights = await ClassInsightsService.getClassInsights(cls.id, { id: teacher.user.id, role: 'TEACHER' }, NOW);
    expect(insights.summary.questionsAnswered).toBe(0);
    expect(JSON.stringify(insights)).not.toContain('OTHER CLASS');
  });
});

describe('who may see analytics', () => {
  it('refuses visitors and students, hides the class from another teacher, and allows an admin', async () => {
    const owner = await actor('TEACHER', 'o');
    const rival = await actor('TEACHER', 'r');
    const admin = await actor('ADMIN', 'admin');
    const pupil = await actor('STUDENT', 'pupil');
    const cls = await makeClass(owner.user.id, [pupil.user.id]);
    const params = ctx({ id: cls.id });

    expect((await classInsights(get(''), params)).status).toBe(401);
    expect((await classInsights(get(pupil.cookie), params)).status).toBe(403);
    expect((await classInsights(get(rival.cookie), params)).status).toBe(404); // not "forbidden": ids cannot be probed
    expect((await classInsights(get(owner.cookie), params)).status).toBe(200);
    expect((await classInsights(get(admin.cookie), params)).status).toBe(200);
    expect((await classInsights(get(owner.cookie), ctx({ id: 'nope' }))).status).toBe(404);
  });

  it('applies the same rules to a single student', async () => {
    const owner = await actor('TEACHER', 'so');
    const rival = await actor('TEACHER', 'sr');
    const pupil = await actor('STUDENT', 'sp');
    const outsider = await actor('STUDENT', 'out');
    const cls = await makeClass(owner.user.id, [pupil.user.id]);
    const at = (userId: string) => ctx({ id: cls.id, userId });

    expect((await studentInsight(get(''), at(pupil.user.id))).status).toBe(401);
    expect((await studentInsight(get(pupil.cookie), at(pupil.user.id))).status).toBe(403);
    expect((await studentInsight(get(rival.cookie), at(pupil.user.id))).status).toBe(404);
    expect((await studentInsight(get(owner.cookie), at(outsider.user.id))).status).toBe(404); // not a member
    expect((await studentInsight(get(owner.cookie), at(pupil.user.id))).status).toBe(200);
  });
});

describe('single student insight', () => {
  it('reports the student’s own evidence', async () => {
    const teacher = await actor('TEACHER', 'one');
    const pupil = await actor('STUDENT', 'one');
    const other = await actor('STUDENT', 'two');
    const cls = await makeClass(teacher.user.id, [pupil.user.id, other.user.id]);
    await practise(pupil.user.id, [
      { q: 'Q1', picked: 0, correct: true, at: NOW },
      { q: 'Q2', picked: 1, correct: false, at: NOW },
    ]);
    await practise(other.user.id, [{ q: 'Q3', picked: 1, correct: false, at: NOW }]);
    const skill = await db.skill.findUniqueOrThrow({ where: { code: 'G7-INT-ADD' } });
    await db.skillMastery.create({
      data: { studentId: pupil.user.id, skillId: skill.id, status: 'DEVELOPING', ruleCode: 'T', attemptCount: 2, accuracy: 0.5, recentAccuracy: 0.5, consistency: 0.5, details: {}, masteryVersion: 'test' },
    });
    await db.mistakeRecord.create({ data: { studentId: pupil.user.id, submittedAnswer: '5', category: 'SIGN_ERROR', resolved: false } });
    await db.mistakeRecord.create({ data: { studentId: other.user.id, submittedAnswer: '5', category: 'CONCEPTUAL', resolved: false } });

    const view = await ClassInsightsService.getStudentInsight(cls.id, pupil.user.id, { id: teacher.user.id, role: 'TEACHER' }, NOW);
    expect(view.student.id).toBe(pupil.user.id);
    expect(view.totals).toEqual({ questionsAnswered: 2, accuracy: 50 });
    expect(view.skills).toEqual([{ name: 'Adding integers', status: 'DEVELOPING', attempts: 2, accuracy: 50 }]);
    expect(view.unresolvedMistakes).toEqual([{ category: 'SIGN_ERROR', count: 1 }]);
    expect(view.recentSessions).toHaveLength(1);
    expect(view.recentSessions[0]).toMatchObject({ answered: 2, correct: 1, total: 2 });
    expect(JSON.stringify(view)).not.toContain('Q3');
  });
});

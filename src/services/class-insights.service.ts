/**
 * Tuklas 2.0 — Class and student analytics for teachers (master plan §20, §21).
 *
 * Every figure is computed from real rows of the class's own students (practice answers, skill mastery,
 * mistake records, lesson progress). Nothing is estimated or filled in: a skill, question or category with
 * too little evidence is left out or marked as such. Access goes through `ClassService.requireClassAccess`,
 * so a teacher can only ever see their own classes (an admin sees any).
 *
 * Days are Manila calendar days (the school's time zone), so "today" matches the teacher's wall clock.
 */

import { db } from '../server/db';
import { NotFoundError } from '../lib/errors';
import { ClassService, type Actor } from './class.service';

export const INSIGHT = {
  /** Length of the activity window, in days. */
  days: 14,
  /** A question is listed as hard only with at least this many attempts by at least this many students... */
  minAttempts: 3,
  minStudents: 2,
  /** ...and when fewer than this share of attempts were correct. */
  hardBelow: 0.75,
  hardestShown: 5,
  lessonsShown: 10,
} as const;

const DAY_MS = 24 * 60 * 60 * 1000;
const MASTERY_ORDER = ['LEARNING', 'DEVELOPING', 'PROFICIENT', 'MASTERED'] as const;

/** YYYY-MM-DD in Asia/Manila. */
export const manilaDay = (date: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(date);

/** The last `days` Manila calendar days ending today, oldest first. */
export function recentDays(now: Date, days: number = INSIGHT.days): string[] {
  return Array.from({ length: days }, (_, i) => manilaDay(new Date(now.getTime() - (days - 1 - i) * DAY_MS)));
}

const pct = (part: number, total: number) => (total > 0 ? Math.round((part / total) * 100) : null);

type AnswerRow = {
  question: string;
  options: unknown;
  selectedIndex: number;
  correctIndex: number;
  correct: boolean;
  skill: string | null;
  answeredAt: Date;
  session: { studentId: string };
};

function activityByDay(answers: AnswerRow[], now: Date) {
  const days = recentDays(now);
  const buckets = new Map(days.map((day) => [day, { students: new Set<string>(), questions: 0 }]));
  for (const answer of answers) {
    const bucket = buckets.get(manilaDay(answer.answeredAt));
    if (!bucket) continue;
    bucket.students.add(answer.session.studentId);
    bucket.questions += 1;
  }
  return days.map((date) => ({ date, students: buckets.get(date)!.students.size, questions: buckets.get(date)!.questions }));
}

const optionText = (options: unknown, index: number) => (Array.isArray(options) && typeof options[index] === 'string' ? (options[index] as string) : null);

export class ClassInsightsService {
  static async getClassInsights(classId: string, actor: Actor, now: Date = new Date()) {
    const cls = await ClassService.requireClassAccess(classId, actor);
    const members = await db.classMember.findMany({ where: { classId }, select: { userId: true } });
    const ids = members.map((member) => member.userId);
    const since = new Date(now.getTime() - INSIGHT.days * DAY_MS);

    const [answers, mastery, mistakes, progress, practiceSessions] = await Promise.all([
      db.practiceAnswer.findMany({
        where: { session: { studentId: { in: ids } } },
        select: {
          question: true,
          options: true,
          selectedIndex: true,
          correctIndex: true,
          correct: true,
          skill: true,
          answeredAt: true,
          session: { select: { studentId: true } },
        },
      }),
      db.skillMastery.findMany({
        where: { studentId: { in: ids } },
        select: { studentId: true, status: true, skill: { select: { code: true, name: true } } },
      }),
      db.mistakeRecord.findMany({ where: { studentId: { in: ids } }, select: { studentId: true, category: true, resolved: true } }),
      db.lessonProgress.findMany({
        where: { studentId: { in: ids } },
        select: { studentId: true, status: true, lesson: { select: { id: true, title: true } } },
      }),
      db.practiceSession.findMany({
        where: { studentId: { in: ids }, lessonId: { not: null } },
        select: { studentId: true, lesson: { select: { id: true, title: true } } },
      }),
    ]);

    // ---- window summary
    const inWindow = answers.filter((answer) => answer.answeredAt >= since);
    const summary = {
      studentCount: ids.length,
      activeStudents: new Set(inWindow.map((answer) => answer.session.studentId)).size,
      questionsAnswered: inWindow.length,
      accuracy: pct(inWindow.filter((answer) => answer.correct).length, inWindow.length),
    };

    // ---- skills: where the class stands, weakest first
    const skillMap = new Map<string, { code: string | null; name: string; levels: Record<string, number> }>();
    for (const row of mastery) {
      const entry = skillMap.get(row.skill.name) ?? { code: row.skill.code, name: row.skill.name, levels: {} };
      entry.levels[row.status] = (entry.levels[row.status] ?? 0) + 1;
      skillMap.set(row.skill.name, entry);
    }
    const skills = [...skillMap.values()]
      .map((entry) => {
        const mine = answers.filter((answer) => answer.skill === entry.name);
        const withEvidence = Object.values(entry.levels).reduce((sum, n) => sum + n, 0);
        return {
          code: entry.code,
          name: entry.name,
          studentsWithEvidence: withEvidence,
          studentsWithoutEvidence: Math.max(0, ids.length - withEvidence),
          levels: Object.fromEntries(MASTERY_ORDER.map((level) => [level, entry.levels[level] ?? 0])) as Record<(typeof MASTERY_ORDER)[number], number>,
          answers: mine.length,
          accuracy: pct(mine.filter((answer) => answer.correct).length, mine.length),
        };
      })
      .sort((a, b) => (a.accuracy ?? 101) - (b.accuracy ?? 101) || a.name.localeCompare(b.name));

    // ---- hardest questions (needs real evidence; never names a student)
    const byQuestion = new Map<string, AnswerRow[]>();
    for (const answer of answers) byQuestion.set(answer.question, [...(byQuestion.get(answer.question) ?? []), answer]);
    const hardestQuestions = [...byQuestion.entries()]
      .map(([question, rows]) => {
        const correct = rows.filter((row) => row.correct).length;
        const wrongCounts = new Map<string, number>();
        for (const row of rows.filter((r) => !r.correct)) {
          const text = optionText(row.options, row.selectedIndex);
          if (text) wrongCounts.set(text, (wrongCounts.get(text) ?? 0) + 1);
        }
        const topWrong = [...wrongCounts.entries()].sort((a, b) => b[1] - a[1])[0];
        return {
          question,
          skill: rows[0].skill,
          attempts: rows.length,
          students: new Set(rows.map((row) => row.session.studentId)).size,
          correctRate: correct / rows.length,
          correctAnswer: optionText(rows[0].options, rows[0].correctIndex),
          commonWrongAnswer: topWrong ? { text: topWrong[0], count: topWrong[1] } : null,
        };
      })
      .filter((q) => q.attempts >= INSIGHT.minAttempts && q.students >= INSIGHT.minStudents && q.correctRate < INSIGHT.hardBelow)
      .sort((a, b) => a.correctRate - b.correctRate || b.attempts - a.attempts)
      .slice(0, INSIGHT.hardestShown)
      .map((q) => ({ ...q, correctRate: Math.round(q.correctRate * 100) }));

    // ---- mistake categories
    const categories = new Map<string, { count: number; unresolved: number; students: Set<string> }>();
    for (const mistake of mistakes) {
      const key = mistake.category ?? 'UNCLASSIFIED';
      const entry = categories.get(key) ?? { count: 0, unresolved: 0, students: new Set<string>() };
      entry.count += 1;
      if (!mistake.resolved) entry.unresolved += 1;
      entry.students.add(mistake.studentId);
      categories.set(key, entry);
    }
    const mistakeCategories = [...categories.entries()]
      .map(([category, entry]) => ({ category, count: entry.count, unresolved: entry.unresolved, students: entry.students.size }))
      .sort((a, b) => b.count - a.count);

    // ---- lessons the class has worked on
    // A lesson counts as worked on when a student has progress on it OR has practised it (practice alone,
    // without finishing the lesson, is real activity the teacher must see).
    const lessonMap = new Map<string, { id: string; title: string; completed: number; inProgress: number; practised: Set<string> }>();
    const entryFor = (lesson: { id: string; title: string }) => {
      const entry = lessonMap.get(lesson.id) ?? { id: lesson.id, title: lesson.title, completed: 0, inProgress: 0, practised: new Set<string>() };
      lessonMap.set(lesson.id, entry);
      return entry;
    };
    for (const row of progress) {
      if (row.status === 'NOT_STARTED') continue;
      const entry = entryFor(row.lesson);
      if (row.status === 'COMPLETED' || row.status === 'MASTERED') entry.completed += 1;
      else entry.inProgress += 1;
    }
    for (const session of practiceSessions) {
      if (session.lesson) entryFor(session.lesson).practised.add(session.studentId);
    }
    const lessons = [...lessonMap.values()]
      .map((entry) => ({ id: entry.id, title: entry.title, completed: entry.completed, inProgress: entry.inProgress, practised: entry.practised.size }))
      .sort(
        (a, b) => b.completed + b.inProgress + b.practised - (a.completed + a.inProgress + a.practised) || a.title.localeCompare(b.title),
      )
      .slice(0, INSIGHT.lessonsShown)
      .map((entry) => ({ ...entry, studentCount: ids.length }));

    return {
      class: { id: cls.id, name: cls.name },
      windowDays: INSIGHT.days,
      summary,
      activity: activityByDay(inWindow, now),
      skills,
      hardestQuestions,
      mistakeCategories,
      lessons,
      thresholds: { minAttempts: INSIGHT.minAttempts, minStudents: INSIGHT.minStudents, hardBelowPercent: INSIGHT.hardBelow * 100 },
    };
  }

  /** One student's evidence, for a teacher who wants to see why the roster flagged them. */
  static async getStudentInsight(classId: string, studentId: string, actor: Actor, now: Date = new Date()) {
    await ClassService.requireClassAccess(classId, actor);
    const member = await db.classMember.findUnique({
      where: { classId_userId: { classId, userId: studentId } },
      include: { user: { select: { id: true, displayName: true, email: true } } },
    });
    if (!member) throw new NotFoundError('That student is not in this class.');

    const [answers, mastery, mistakes, sessions] = await Promise.all([
      db.practiceAnswer.findMany({
        where: { session: { studentId } },
        select: { question: true, options: true, selectedIndex: true, correctIndex: true, correct: true, skill: true, answeredAt: true, session: { select: { studentId: true } } },
      }),
      db.skillMastery.findMany({
        where: { studentId },
        select: { status: true, attemptCount: true, skill: { select: { name: true } } },
      }),
      db.mistakeRecord.findMany({ where: { studentId, resolved: false }, select: { category: true } }),
      db.practiceSession.findMany({
        where: { studentId },
        orderBy: { startedAt: 'desc' },
        take: 8,
        select: { id: true, startedAt: true, correct: true, total: true, completedAt: true, lesson: { select: { title: true } }, _count: { select: { answers: true } } },
      }),
    ]);

    const categories = new Map<string, number>();
    for (const mistake of mistakes) categories.set(mistake.category ?? 'UNCLASSIFIED', (categories.get(mistake.category ?? 'UNCLASSIFIED') ?? 0) + 1);

    return {
      student: { id: member.user.id, displayName: member.user.displayName, email: member.user.email },
      windowDays: INSIGHT.days,
      totals: { questionsAnswered: answers.length, accuracy: pct(answers.filter((a) => a.correct).length, answers.length) },
      activity: activityByDay(answers.filter((a) => a.answeredAt >= new Date(now.getTime() - INSIGHT.days * DAY_MS)), now),
      skills: mastery
        .map((row) => {
          const mine = answers.filter((a) => a.skill === row.skill.name);
          return { name: row.skill.name, status: row.status, attempts: row.attemptCount, accuracy: pct(mine.filter((a) => a.correct).length, mine.length) };
        })
        .sort((a, b) => a.name.localeCompare(b.name)),
      unresolvedMistakes: [...categories.entries()].map(([category, count]) => ({ category, count })).sort((a, b) => b.count - a.count),
      recentSessions: sessions.map((session) => ({
        id: session.id,
        lesson: session.lesson?.title ?? null,
        startedAt: session.startedAt,
        answered: session._count.answers,
        correct: session.correct,
        total: session.total,
        finished: session.completedAt !== null,
      })),
    };
  }
}

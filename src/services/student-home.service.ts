/**
 * Tuklas 2.0: the extra numbers on the student home screen (streak, today's goal, what to practise next, progress).
 *
 * Every figure is computed from the student's own rows. With no activity the streak is 0, the goal is 0 of 3, there is no
 * recommendation and no subject percentage beyond the lessons that exist. Nothing here is a placeholder.
 * Days are counted in Philippine time (UTC+8), because a student practising at 11 pm should not lose their streak at 3 pm.
 */

import { db } from '../server/db';

/** Activities a student is asked to complete each day. */
export const DAILY_GOAL = 3;

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
/** How far back streaks are looked up; a streak longer than this shows as this many days. */
export const STREAK_WINDOW_DAYS = 60;

/** The calendar day (YYYY-MM-DD) of a moment, in Philippine time. */
export function manilaDay(date: Date): string {
  return new Date(date.getTime() + 8 * HOUR).toISOString().slice(0, 10);
}

/**
 * Consecutive days of activity ending today. A student who has not been active yet today but was yesterday keeps
 * yesterday's streak (they still have today to continue it); a gap of a full day ends it.
 */
export function computeStreak(activity: Date[], now: Date): number {
  const days = new Set(activity.map(manilaDay));
  let cursor = now;
  if (!days.has(manilaDay(cursor))) cursor = new Date(cursor.getTime() - DAY);
  let streak = 0;
  while (days.has(manilaDay(cursor)) && streak < STREAK_WINDOW_DAYS) {
    streak += 1;
    cursor = new Date(cursor.getTime() - DAY);
  }
  return streak;
}

export type RecommendedSkill = {
  skillId: string;
  skillName: string;
  level: 'LEARNING' | 'DEVELOPING';
  accuracyPercent: number;
  lessonId: string;
  lessonTitle: string;
};

export type SubjectProgress = { subject: string; completed: number; total: number; percent: number };

export type RecentResult = { id: string; title: string; correct: number; total: number; percent: number; date: Date };

export class StudentHomeService {
  static async get(studentId: string, now: Date = new Date()) {
    const since = new Date(now.getTime() - STREAK_WINDOW_DAYS * DAY);
    const today = manilaDay(now);

    const [answers, checks, completedToday, mastery, lessons, progress, finished] = await Promise.all([
      db.practiceAnswer.findMany({
        where: { session: { studentId }, answeredAt: { gte: since } },
        select: { answeredAt: true, sessionId: true },
      }),
      db.lessonCheckAttempt.findMany({
        where: { studentId, answeredAt: { gte: since } },
        select: { answeredAt: true, lessonId: true },
      }),
      db.lessonProgress.findMany({
        where: { studentId, completedAt: { gte: new Date(now.getTime() - 2 * DAY) } },
        select: { lessonId: true, completedAt: true },
      }),
      db.skillMastery.findMany({
        where: { studentId, attemptCount: { gt: 0 }, status: { in: ['LEARNING', 'DEVELOPING'] } },
        include: { skill: { select: { id: true, name: true } } },
      }),
      db.lesson.findMany({
        where: { status: 'PUBLISHED', OR: [{ unitId: null }, { unit: { isDemo: false } }] },
        select: { id: true, subject: true },
      }),
      db.lessonProgress.findMany({ where: { studentId, status: { in: ['COMPLETED', 'MASTERED'] } }, select: { lessonId: true } }),
      db.practiceSession.findMany({
        where: { studentId, completedAt: { not: null }, total: { gt: 0 } },
        orderBy: { completedAt: 'desc' },
        take: 5,
        select: { id: true, correct: true, total: true, completedAt: true, topic: true, lesson: { select: { title: true } } },
      }),
    ]);

    // ---- streak and today's goal
    const streak = computeStreak([...answers.map((a) => a.answeredAt), ...checks.map((c) => c.answeredAt)], now);
    const doneToday = new Set<string>();
    for (const a of answers) if (manilaDay(a.answeredAt) === today) doneToday.add(`practice:${a.sessionId}`);
    for (const c of checks) if (manilaDay(c.answeredAt) === today) doneToday.add(`lesson:${c.lessonId}`);
    for (const p of completedToday) if (p.completedAt && manilaDay(p.completedAt) === today) doneToday.add(`lesson:${p.lessonId}`);

    // ---- what to practise next: the weakest skills the student has actually tried
    const weak = [...mastery].sort((a, b) => {
      const level = (s: string) => (s === 'LEARNING' ? 0 : 1);
      return level(a.status) - level(b.status) || a.accuracy - b.accuracy;
    });
    const weakIds = weak.slice(0, 4).map((row) => row.skillId);
    const homes = weakIds.length
      ? await db.quizQuestion.findMany({
          where: { skillId: { in: weakIds }, assessmentId: null, lesson: { status: 'PUBLISHED' } },
          distinct: ['skillId'],
          select: { skillId: true, lessonId: true, lesson: { select: { title: true } } },
        })
      : [];
    const homeBySkill = new Map(homes.map((h) => [h.skillId, h]));
    const needsPractice: RecommendedSkill[] = weak
      .slice(0, 4)
      .filter((row) => homeBySkill.has(row.skillId))
      .map((row) => {
        const home = homeBySkill.get(row.skillId)!;
        return {
          skillId: row.skillId,
          skillName: row.skill.name,
          level: row.status as 'LEARNING' | 'DEVELOPING',
          accuracyPercent: Math.round(row.accuracy * 100),
          lessonId: home.lessonId,
          lessonTitle: home.lesson.title,
        };
      });

    // ---- progress per subject: completed lessons out of the lessons that exist
    const completedIds = new Set(progress.map((p) => p.lessonId));
    const bySubject = new Map<string, { completed: number; total: number }>();
    for (const lesson of lessons) {
      const entry = bySubject.get(lesson.subject) ?? { completed: 0, total: 0 };
      entry.total += 1;
      if (completedIds.has(lesson.id)) entry.completed += 1;
      bySubject.set(lesson.subject, entry);
    }
    const subjects: SubjectProgress[] = [...bySubject.entries()]
      .map(([subject, v]) => ({ subject, ...v, percent: v.total ? Math.round((v.completed / v.total) * 100) : 0 }))
      .sort((a, b) => a.subject.localeCompare(b.subject));

    const recentResults: RecentResult[] = finished.map((s) => ({
      id: s.id,
      title: s.lesson?.title ?? s.topic,
      correct: s.correct,
      total: s.total,
      percent: Math.round((s.correct / s.total) * 100),
      date: s.completedAt!,
    }));

    return {
      streak,
      goal: { done: Math.min(doneToday.size, DAILY_GOAL), target: DAILY_GOAL, activitiesToday: doneToday.size },
      recommended: needsPractice[0] ?? null,
      needsPractice: needsPractice.slice(1, 3),
      subjects,
      recentResults,
    };
  }
}

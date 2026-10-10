import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { db } from '../src/server/db';
import { computeStreak, DAILY_GOAL, manilaDay, StudentHomeService } from '../src/services/student-home.service';

const PREFIX = 'home-test-';
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

describe('manilaDay', () => {
  it('counts days in Philippine time (UTC+8), not UTC', () => {
    // 23:30 UTC on Oct 10 is 07:30 on Oct 11 in Manila.
    expect(manilaDay(new Date('2026-10-10T23:30:00Z'))).toBe('2026-10-11');
    // 15:30 UTC on Oct 10 is 23:30 on Oct 10 in Manila.
    expect(manilaDay(new Date('2026-10-10T15:30:00Z'))).toBe('2026-10-10');
    // 16:00 UTC is exactly midnight in Manila: the next day starts.
    expect(manilaDay(new Date('2026-10-10T16:00:00Z'))).toBe('2026-10-11');
  });
});

describe('computeStreak', () => {
  const now = new Date('2026-10-10T04:00:00Z'); // noon on Oct 10 in Manila
  const at = (daysAgo: number, hourUtc = 3) => new Date(new Date('2026-10-10T00:00:00Z').getTime() - daysAgo * DAY + hourUtc * HOUR);

  it('is 0 with no activity', () => {
    expect(computeStreak([], now)).toBe(0);
  });

  it('counts consecutive days ending today', () => {
    expect(computeStreak([at(0), at(1), at(2)], now)).toBe(3);
  });

  it('keeps yesterday\'s streak when the student has not yet done anything today', () => {
    expect(computeStreak([at(1), at(2)], now)).toBe(2);
  });

  it('ends the streak after a full missed day', () => {
    expect(computeStreak([at(2), at(3), at(4)], now)).toBe(0);
    expect(computeStreak([at(0), at(2), at(3)], now)).toBe(1);
  });

  it('counts many answers on one day as a single day', () => {
    expect(computeStreak([at(0, 1), at(0, 2), at(0, 3), at(1, 1)], now)).toBe(2);
  });

  it('treats a late-evening Manila answer as that Manila day', () => {
    // 15:30 UTC Oct 9 = 23:30 on Oct 9 in Manila: yesterday, not the day before.
    expect(computeStreak([new Date('2026-10-09T15:30:00Z')], now)).toBe(1);
  });
});

async function student(tag: string) {
  return db.user.create({
    data: { email: `${PREFIX}${tag}-${randomUUID()}@example.com`, passwordHash: 'test-only-hash', role: 'STUDENT', displayName: `Home ${tag}` },
  });
}

afterEach(async () => {
  await db.user.deleteMany({ where: { email: { startsWith: PREFIX } } });
});

/** Two published Term 1 lessons that have knowledge checks, with their first check each. */
async function twoChecks() {
  const checks = await db.lessonCheck.findMany({
    where: { lesson: { id: { in: ['lesson-math-7-polygons', 'lesson-math-7-w1-draw-polygons'] } } },
    distinct: ['lessonId'],
    select: { id: true, lessonId: true },
  });
  expect(checks).toHaveLength(2);
  return checks;
}

describe('StudentHomeService', () => {
  it('starts at zero: no streak, no goal progress, nothing recommended, no results', async () => {
    const s = await student('fresh');
    const home = await StudentHomeService.get(s.id);
    expect(home.streak).toBe(0);
    expect(home.goal).toEqual({ done: 0, target: DAILY_GOAL, activitiesToday: 0 });
    expect(home.recommended).toBeNull();
    expect(home.needsPractice).toEqual([]);
    expect(home.recentResults).toEqual([]);
    // Subject progress covers the lessons that exist, all not yet completed.
    expect(home.subjects.length).toBeGreaterThan(0);
    for (const subject of home.subjects) {
      expect(subject.completed).toBe(0);
      expect(subject.percent).toBe(0);
      expect(subject.total).toBeGreaterThan(0);
    }
  });

  it('counts a lesson worked on today once toward the goal and starts a streak', async () => {
    const s = await student('today');
    const [a, b] = await twoChecks();
    const now = new Date();
    await db.lessonCheckAttempt.createMany({
      data: [
        { studentId: s.id, lessonId: a.lessonId, checkId: a.id, selectedIndex: 0, correct: true, answeredAt: now },
        { studentId: s.id, lessonId: a.lessonId, checkId: a.id, selectedIndex: 1, correct: false, answeredAt: now },
        { studentId: s.id, lessonId: b.lessonId, checkId: b.id, selectedIndex: 0, correct: true, answeredAt: now },
      ],
    });
    const home = await StudentHomeService.get(s.id, now);
    expect(home.goal.activitiesToday).toBe(2); // two lessons, however many answers
    expect(home.goal.done).toBe(2);
    expect(home.streak).toBe(1);
  });

  it('does not count yesterday toward today\'s goal but keeps the streak alive', async () => {
    const s = await student('yesterday');
    const [a] = await twoChecks();
    const now = new Date();
    await db.lessonCheckAttempt.create({
      data: { studentId: s.id, lessonId: a.lessonId, checkId: a.id, selectedIndex: 0, correct: true, answeredAt: new Date(now.getTime() - DAY) },
    });
    const home = await StudentHomeService.get(s.id, now);
    expect(home.goal.done).toBe(0);
    expect(home.streak).toBe(1);
  });

  it('caps the goal at its target however much was done', async () => {
    const s = await student('cap');
    const now = new Date();
    const lessons = await db.lesson.findMany({ where: { id: { startsWith: 'lesson-math-7-' }, checks: { some: {} } }, select: { id: true, checks: { select: { id: true }, take: 1 } } });
    expect(lessons.length).toBeGreaterThan(DAILY_GOAL);
    await db.lessonCheckAttempt.createMany({
      data: lessons.map((lesson) => ({ studentId: s.id, lessonId: lesson.id, checkId: lesson.checks[0].id, selectedIndex: 0, correct: true, answeredAt: now })),
    });
    const home = await StudentHomeService.get(s.id, now);
    expect(home.goal.activitiesToday).toBe(lessons.length);
    expect(home.goal.done).toBe(DAILY_GOAL);
  });

  it('recommends the weakest skill the student has actually tried, with the lesson it belongs to', async () => {
    const s = await student('weak');
    const sum = await db.skill.findUniqueOrThrow({ where: { code: 'G7-POLY-SUM' } });
    const regular = await db.skill.findUniqueOrThrow({ where: { code: 'G7-POLY-REG' } });
    const base = { ruleCode: 'test', consistency: 0.5, details: {}, masteryVersion: 'test' };
    await db.skillMastery.createMany({
      data: [
        { studentId: s.id, skillId: sum.id, status: 'DEVELOPING', attemptCount: 6, accuracy: 0.6, recentAccuracy: 0.6, ...base },
        { studentId: s.id, skillId: regular.id, status: 'LEARNING', attemptCount: 4, accuracy: 0.25, recentAccuracy: 0.25, ...base },
      ],
    });
    const home = await StudentHomeService.get(s.id);
    expect(home.recommended?.skillId).toBe(regular.id); // LEARNING comes before DEVELOPING
    expect(home.recommended?.level).toBe('LEARNING');
    expect(home.recommended?.accuracyPercent).toBe(25);
    expect(home.recommended?.lessonId).toMatch(/^lesson-math-7-/);
    expect(home.needsPractice.map((item) => item.skillId)).toEqual([sum.id]);
  });

  it('ignores skills that are untried or already strong', async () => {
    const s = await student('strong');
    const sum = await db.skill.findUniqueOrThrow({ where: { code: 'G7-POLY-SUM' } });
    const regular = await db.skill.findUniqueOrThrow({ where: { code: 'G7-POLY-REG' } });
    const base = { ruleCode: 'test', consistency: 0.9, details: {}, masteryVersion: 'test' };
    await db.skillMastery.createMany({
      data: [
        { studentId: s.id, skillId: sum.id, status: 'MASTERED', attemptCount: 12, accuracy: 1, recentAccuracy: 1, ...base },
        { studentId: s.id, skillId: regular.id, status: 'LEARNING', attemptCount: 0, accuracy: 0, recentAccuracy: 0, ...base },
      ],
    });
    const home = await StudentHomeService.get(s.id);
    expect(home.recommended).toBeNull();
  });

  it('reports subject progress from completed lessons, and recent results from finished sessions only', async () => {
    const s = await student('progress');
    await db.lessonProgress.create({ data: { studentId: s.id, lessonId: 'lesson-math-7-polygons', status: 'COMPLETED', completedAt: new Date() } });
    await db.practiceSession.createMany({
      data: [
        { studentId: s.id, lessonId: 'lesson-math-7-polygons', topic: 'Polygons', subject: 'Mathematics', difficulty: 'ADAPTIVE', type: 'PRACTICE', total: 10, correct: 9, completedAt: new Date() },
        { studentId: s.id, lessonId: 'lesson-math-7-polygons', topic: 'Polygons', subject: 'Mathematics', difficulty: 'ADAPTIVE', type: 'PRACTICE', total: 10, correct: 2 },
      ],
    });
    const home = await StudentHomeService.get(s.id);
    const maths = home.subjects.find((subject) => subject.subject === 'Mathematics');
    expect(maths?.completed).toBe(1);
    expect(maths?.percent).toBe(Math.round((1 / (maths?.total ?? 1)) * 100));
    expect(home.recentResults).toHaveLength(1);
    expect(home.recentResults[0]).toMatchObject({ correct: 9, total: 10, percent: 90 });
  });
});

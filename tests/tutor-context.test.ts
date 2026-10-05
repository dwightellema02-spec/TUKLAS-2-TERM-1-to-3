import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../src/server/db';
import { createSessionToken, SESSION_COOKIE_NAME } from '../src/server/auth';
import { LESSON_CONTEXT, sectionToText, selectLessonContext, type LessonSectionInput } from '../src/server/tutor/context';
import { POST as askTutor } from '../src/app/api/ai/tutor/route';

const section = (heading: string, text: string, extra: Partial<LessonSectionInput> = {}): LessonSectionInput => ({
  heading,
  type: 'TEXT',
  sourceExplanation: null,
  content: text,
  metadata: null,
  ...extra,
});

const topics = ['Rivers', 'Volcanoes', 'Weather', 'Maps', 'Forests', 'Deserts', 'Oceans', 'Islands', 'Glaciers', 'Soil', 'Fractions', 'Percent'];
const lesson = (extra: LessonSectionInput[] = []) => ({
  title: 'A long lesson',
  objectives: ['Understand the topics'],
  sections: [...topics.map((topic) => section(`Section about ${topic}`, `${topic} are discussed here in a short paragraph about ${topic.toLowerCase()}.`)), ...extra],
  vocabulary: [
    { term: 'Fraction', definition: 'A part of a whole.' },
    { term: 'Glacier', definition: 'A slow river of ice.' },
    { term: 'Delta', definition: 'Land at a river mouth.' },
  ],
});

describe('lesson context selection', () => {
  it('finds the section the student asks about, even when it is far past the first six (the old behaviour dropped it)', () => {
    const picked = selectLessonContext(lesson(), 'Can you explain fractions to me?');
    expect(picked.sections.map((s) => s.heading)).toContain('Section about Fractions');
    expect(picked.sections.length).toBeLessThanOrEqual(LESSON_CONTEXT.maxSections);
  });

  it('keeps the lesson in its own order and keeps the opening for orientation when little matches', () => {
    const picked = selectLessonContext(lesson(), 'what about glaciers and percent');
    const headings = picked.sections.map((s) => s.heading);
    expect(headings).toEqual([...headings].sort((a, b) => topics.findIndex((t) => a.includes(t)) - topics.findIndex((t) => b.includes(t))));
    expect(headings[0]).toBe('Section about Rivers'); // opening kept
  });

  it('a generic message ("help me") falls back to the start of the lesson, never to nothing', () => {
    const picked = selectLessonContext(lesson(), 'help me please');
    expect(picked.sections.length).toBeGreaterThanOrEqual(3);
    expect(picked.sections[0].heading).toBe('Section about Rivers');
  });

  it('stays inside the character budget, however long the sections are', () => {
    const long = Array.from({ length: 10 }, (_, i) => section(`Long ${i}`, `word${i} `.repeat(400)));
    const picked = selectLessonContext({ ...lesson(), sections: long }, 'word1 word2 word3 word4 word5 word6');
    const total = picked.sections.reduce((sum, s) => sum + s.text.length, 0);
    expect(total).toBeLessThanOrEqual(LESSON_CONTEXT.budgetChars);
    for (const s of picked.sections) expect(s.text.length).toBeLessThanOrEqual(LESSON_CONTEXT.perSectionChars);
  });

  it('names the sections it did not send, by heading only', () => {
    const picked = selectLessonContext(lesson(), 'tell me about fractions');
    expect(picked.otherSections.length).toBeGreaterThan(0);
    expect(picked.otherSections.every((heading) => heading.startsWith('Section about'))).toBe(true);
    const shown = new Set(picked.sections.map((s) => s.heading));
    expect(picked.otherSections.some((heading) => shown.has(heading))).toBe(false);
  });

  it('puts the vocabulary the student asked about first', () => {
    const picked = selectLessonContext(lesson(), 'what is a glacier');
    expect(picked.vocabulary[0].term).toBe('Glacier');
  });

  it('skips empty sections', () => {
    const picked = selectLessonContext({ ...lesson(), sections: [section('Empty', ''), section('Real', 'Real content about fractions.')] }, 'fractions');
    expect(picked.sections.map((s) => s.heading)).toEqual(['Real']);
  });

  it('is deterministic', () => {
    expect(selectLessonContext(lesson(), 'percent and fractions')).toEqual(selectLessonContext(lesson(), 'percent and fractions'));
  });
});

describe('teacher-authored worked examples become text the tutor can use', () => {
  it('turns problem, steps and result into one readable section', () => {
    const text = sectionToText(
      section('Example 1', '', {
        type: 'EXAMPLE',
        metadata: { problem: 'Solve 2x + 3 = 11', steps: [{ action: 'Subtract 3 from both sides', explanation: '2x = 8' }, { action: 'Divide by 2', explanation: 'x = 4' }], finalAnswer: 'x = 4' },
      }),
    );
    expect(text).toContain('Worked example. Problem: Solve 2x + 3 = 11.');
    expect(text).toContain('Step 1: Subtract 3 from both sides (2x = 8)');
    expect(text).toContain('Step 2: Divide by 2 (x = 4)');
    expect(text).toContain('Result: x = 4.');
  });

  it('ignores malformed metadata instead of failing', () => {
    expect(() => sectionToText(section('Bad', 'text', { type: 'EXAMPLE', metadata: { steps: 'nope', problem: 5 } }))).not.toThrow();
    expect(sectionToText(section('Bad', 'plain', { type: 'EXAMPLE', metadata: 'garbage' }))).toBe('plain');
  });
});

describe('what the tutor really sends for a long lesson', () => {
  beforeEach(() => {
    process.env.AI_PROVIDER = 'anthropic';
    process.env.ANTHROPIC_API_KEY = 'test-only-key';
  });
  afterEach(async () => {
    vi.unstubAllGlobals();
    await db.lesson.deleteMany({ where: { title: { startsWith: 'ctx-test-' } } });
    await db.user.deleteMany({ where: { email: { startsWith: 'ctx-test-' } } });
  });

  it('includes the 12th section, a worked example and the objectives when the student asks about them', async () => {
    const teacher = await db.user.create({ data: { email: `ctx-test-t-${randomUUID()}@example.com`, passwordHash: 'x', role: 'TEACHER', displayName: 'T' } });
    const pupil = await db.user.create({ data: { email: `ctx-test-s-${randomUUID()}@example.com`, passwordHash: 'x', role: 'STUDENT', displayName: 'S' } });
    const created = await db.lesson.create({
      data: {
        authorId: teacher.id,
        title: `ctx-test-lesson ${randomUUID().slice(0, 4)}`,
        subject: 'Mathematics',
        gradeLevel: 'Grade 7',
        status: 'PUBLISHED',
        publishedAt: new Date(),
        objectives: { create: [{ description: 'Convert fractions to percents', position: 0 }] },
        sections: {
          create: [
            ...topics.map((topic, position) => ({ position, heading: `Section about ${topic}`, content: `${topic} are discussed here.` })),
            {
              position: 12,
              heading: 'Worked example: quokka counting',
              type: 'EXAMPLE',
              metadata: { problem: 'A zoo has 4 quokkas and gets 3 more', steps: [{ action: 'Add 4 and 3', explanation: '4 + 3' }], finalAnswer: '7 quokkas' },
            },
          ],
        },
      },
    });
    const prompts: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: { body: string }) => {
        prompts.push(JSON.parse(init.body).system);
        return new Response(JSON.stringify({ content: [{ type: 'text', text: 'Think about adding.' }] }), { status: 200, headers: { 'content-type': 'application/json' } });
      }),
    );
    const token = await createSessionToken({ id: pupil.id, email: pupil.email, displayName: pupil.displayName, role: 'STUDENT' });
    const cookie = `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`;
    const send = (message: string) =>
      askTutor(new Request('http://localhost/api/ai/tutor', { method: 'POST', headers: { 'content-type': 'application/json', Cookie: cookie }, body: JSON.stringify({ message, lessonId: created.id }) }));

    expect((await send('How did the quokka example work?')).status).toBe(200);
    expect(prompts[0]).toContain('Worked example: quokka counting');
    expect(prompts[0]).toMatch(/Problem: A zoo has 4 quokkas and gets 3 more/);
    expect(prompts[0]).toContain('Objectives: Convert fractions to percents');
    expect(prompts[0]).toMatch(/Other sections of this lesson \(not shown\): .*Section about/); // the rest are named, not sent
    expect(prompts[0].length).toBeLessThan(6_000);
  });
});

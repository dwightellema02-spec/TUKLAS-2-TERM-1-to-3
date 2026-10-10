import { requireServerUser } from '../../../lib/auth/server-guard';
import { db } from '../../../server/db';
import { PracticeSetup, type SetupLesson } from '../../../components/practice-setup';

export const dynamic = 'force-dynamic';

export default async function PracticeSetupPage({ searchParams }: { searchParams: Promise<{ lesson?: string | string[] }> }) {
  await requireServerUser(['STUDENT']);
  const { lesson } = await searchParams;
  const initialLessonId = Array.isArray(lesson) ? lesson[0] : lesson;

  // Lessons that can be practised: published, outside the demo unit, with at least one practice question of their own.
  const lessons = await db.lesson.findMany({
    where: {
      status: 'PUBLISHED',
      OR: [{ unitId: null }, { unit: { isDemo: false } }],
      quizQuestions: { some: { assessmentId: null } },
    },
    orderBy: [{ unit: { term: { number: 'asc' } } }, { unit: { position: 'asc' } }, { position: 'asc' }, { createdAt: 'asc' }],
    select: { id: true, title: true, unit: { select: { title: true } } },
  });
  const skillRows = await db.quizQuestion.findMany({
    where: { lessonId: { in: lessons.map((l) => l.id) }, assessmentId: null, skillId: { not: null } },
    distinct: ['lessonId', 'skillId'],
    select: { lessonId: true, skillRecord: { select: { id: true, name: true } } },
  });
  const skillsByLesson = new Map<string, Array<{ id: string; name: string }>>();
  for (const row of skillRows) {
    if (!row.skillRecord) continue;
    skillsByLesson.set(row.lessonId, [...(skillsByLesson.get(row.lessonId) ?? []), row.skillRecord]);
  }
  const setupLessons: SetupLesson[] = lessons.map((l) => ({
    id: l.id,
    title: l.title,
    unitTitle: l.unit?.title ?? null,
    skills: (skillsByLesson.get(l.id) ?? []).sort((a, b) => a.name.localeCompare(b.name)),
  }));

  return (
    <main>
      <header className="ui-head">
        <div>
          <span className="eyebrow">Practice</span>
          <h1>Practice</h1>
          <p className="ui-sub">Choose what to practise. The difficulty adapts as you go.</p>
        </div>
      </header>
      <section className="ui-card" aria-label="Practice setup">
        <PracticeSetup lessons={setupLessons} initialLessonId={initialLessonId} />
      </section>
    </main>
  );
}

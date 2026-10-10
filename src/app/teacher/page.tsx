import Link from 'next/link';
import { requireServerUser } from '../../lib/auth/server-guard';
import { db } from '../../server/db';
import { ClassService } from '../../services/class.service';
import { ClassInsightsService } from '../../services/class-insights.service';

export const dynamic = 'force-dynamic';

/** At most this many classes are analysed on the dashboard (an administrator can own many). */
const MAX_CLASSES_ANALYSED = 8;

const LESSON_STATUS = { PUBLISHED: 'Live', DRAFT: 'Draft', ARCHIVED: 'Archived' } as const;

const barClass = (percent: number) => (percent >= 75 ? '' : percent >= 50 ? ' amber' : ' brick');

export default async function TeacherStudioPage() {
  const user = await requireServerUser(['TEACHER', 'ADMIN']);
  const actor = { id: user.id, role: user.role };
  const classes = await ClassService.listClasses(actor);
  const students = classes.reduce((sum, cls) => sum + cls._count.members, 0);
  const assignments = classes.reduce((sum, cls) => sum + cls._count.assignments, 0);

  const [insights, lessons] = await Promise.all([
    Promise.all(classes.slice(0, MAX_CLASSES_ANALYSED).map((cls) => ClassInsightsService.getClassInsights(cls.id, actor))),
    db.lesson.findMany({
      where: user.role === 'ADMIN' ? {} : { authorId: user.id },
      orderBy: { updatedAt: 'desc' },
      take: 8,
      select: { id: true, title: true, status: true, subject: true, gradeLevel: true },
    }),
  ]);

  // ---- put the classes' numbers together; every figure is weighted by how many answers stand behind it
  const active = insights.reduce((sum, i) => sum + i.summary.activeStudents, 0);
  const questions = insights.reduce((sum, i) => sum + i.summary.questionsAnswered, 0);
  const accuracy = questions > 0 ? Math.round(insights.reduce((sum, i) => sum + (i.summary.accuracy ?? 0) * i.summary.questionsAnswered, 0) / questions) : null;
  const reported = insights.reduce((sum, i) => sum + i.reportedReplies.total, 0);

  const skillMap = new Map<string, { answers: number; weighted: number }>();
  for (const insight of insights) {
    for (const skill of insight.skills) {
      if (skill.accuracy === null || skill.answers === 0) continue;
      const entry = skillMap.get(skill.name) ?? { answers: 0, weighted: 0 };
      entry.answers += skill.answers;
      entry.weighted += skill.accuracy * skill.answers;
      skillMap.set(skill.name, entry);
    }
  }
  const skills = [...skillMap.entries()]
    .map(([name, entry]) => ({ name, answers: entry.answers, percent: Math.round(entry.weighted / entry.answers) }))
    .sort((a, b) => a.percent - b.percent || a.name.localeCompare(b.name))
    .slice(0, 6);
  const hardest = skills[0] ?? null;

  return (
    <main>
      <header className="ui-head">
        <div>
          <span className="eyebrow">Teacher studio</span>
          <h1>Welcome, {user.displayName}</h1>
          <p className="ui-sub">
            {classes.length} {classes.length === 1 ? 'class' : 'classes'} · {students} {students === 1 ? 'student' : 'students'} ·{' '}
            {assignments} active {assignments === 1 ? 'assignment' : 'assignments'}
          </p>
        </div>
        <Link className="ui-btn" href="/teacher/lessons/new">+ Create New Lesson</Link>
      </header>

      <section aria-label="Class summary" className="ui-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))' }}>
        <div className="ui-card">
          <p className="ui-sub" style={{ margin: 0 }}>Active students (14 days)</p>
          <p className="ui-display" style={{ margin: '4px 0 0', fontSize: '1.9rem', fontWeight: 700, color: 'var(--deep)' }}>
            {active} <span style={{ fontSize: '1rem', color: 'var(--ink-soft)' }}>of {students}</span>
          </p>
        </div>
        <div className="ui-card">
          <p className="ui-sub" style={{ margin: 0 }}>Questions answered</p>
          <p className="ui-display" style={{ margin: '4px 0 0', fontSize: '1.9rem', fontWeight: 700, color: 'var(--deep)' }}>{questions}</p>
        </div>
        <div className="ui-card">
          <p className="ui-sub" style={{ margin: 0 }}>Average accuracy</p>
          <p className="ui-display" style={{ margin: '4px 0 0', fontSize: '1.9rem', fontWeight: 700, color: 'var(--deep)' }}>
            {accuracy === null ? '–' : `${accuracy}%`}
          </p>
        </div>
        <div className="ui-card">
          <p className="ui-sub" style={{ margin: 0 }}>Hardest skill right now</p>
          <p className="ui-display" style={{ margin: '4px 0 0', fontSize: '1.15rem', fontWeight: 700, color: 'var(--deep)' }}>
            {hardest ? hardest.name : 'Not enough practice yet'}
          </p>
          {hardest && <p className="ui-warn" style={{ margin: 0, fontSize: '0.85rem' }}>{hardest.percent}% correct</p>}
        </div>
      </section>

      <div className="ui-main-side" style={{ marginTop: 22 }}>
        <div className="ui-stack">
          <section aria-labelledby="mastery-heading" className="ui-card">
            <h2 id="mastery-heading">Skills across your classes</h2>
            {skills.length === 0 ? (
              <p className="empty-state">Skill results appear here once students have practised. Nothing is estimated before then.</p>
            ) : (
              skills.map((skill) => (
                <div key={skill.name} className="ui-metric" style={{ display: 'block' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                    <span>{skill.name}</span>
                    <strong>{skill.percent}%</strong>
                  </div>
                  <div className={`ui-bar${barClass(skill.percent)}`} role="img" aria-label={`${skill.percent}% correct over ${skill.answers} answers`}>
                    <span style={{ width: `${skill.percent}%` }} />
                  </div>
                </div>
              ))
            )}
            <p style={{ margin: '12px 0 0', color: 'var(--ink-soft)', fontSize: '0.82rem' }}>
              Weakest first. Each figure is the share of correct answers by your students in the last answers on record.
            </p>
          </section>

          <section aria-labelledby="lessons-heading" className="ui-card">
            <div className="ui-section-title" style={{ margin: '0 0 12px' }}>
              <h2 id="lessons-heading" style={{ fontSize: '1.12rem', color: 'var(--deep)' }}>Lessons</h2>
              <Link href="/curriculum">Curriculum Catalog →</Link>
            </div>
            {lessons.length === 0 ? (
              <p className="empty-state">You have not written a lesson yet. Choose “+ Create New Lesson” to begin.</p>
            ) : (
              lessons.map((lesson) => (
                <div key={lesson.id} className="ui-row">
                  <span className="ui-icon-tile" aria-hidden="true">{lesson.title.slice(0, 1).toUpperCase()}</span>
                  <div className="ui-row-body">
                    <h3>{lesson.title}</h3>
                    <p>{lesson.subject} · {lesson.gradeLevel}</p>
                  </div>
                  <span className="ui-pill">{LESSON_STATUS[lesson.status]}</span>
                  <Link href={`/teacher/lessons/${lesson.id}/studio`} className="ui-btn ghost" style={{ minHeight: 38, padding: '6px 14px' }}>
                    Studio
                  </Link>
                </div>
              ))
            )}
          </section>
        </div>

        <div className="ui-stack">
          <section aria-labelledby="classes-heading" className="ui-card">
            <h2 id="classes-heading">Classes</h2>
            {classes.length === 0 ? (
              <p style={{ marginTop: 0 }}>You have no classes yet. Create one and give students its join code.</p>
            ) : (
              <ul className="review-list" style={{ marginBottom: 14 }}>
                {classes.map((cls) => (
                  <li key={cls.id} className="review-item">
                    <Link href={`/teacher/classes/${cls.id}`}>{cls.name}</Link>
                    <p style={{ margin: '4px 0 0', color: 'var(--ink-soft)', fontSize: '0.86rem' }}>
                      {cls._count.members} {cls._count.members === 1 ? 'student' : 'students'} · {cls._count.assignments} active{' '}
                      {cls._count.assignments === 1 ? 'assignment' : 'assignments'}
                    </p>
                  </li>
                ))}
              </ul>
            )}
            <Link className="ui-btn" href="/teacher/classes">
              {classes.length === 0 ? 'Create a class' : 'Manage classes'}
            </Link>
          </section>

          <section aria-labelledby="reports-heading" className="ui-card">
            <h2 id="reports-heading">Reported tutor replies</h2>
            <p style={{ margin: 0 }}>
              {reported === 0
                ? 'No replies have been reported by your students.'
                : `${reported} ${reported === 1 ? 'reply has' : 'replies have'} been reported. Open a class to read ${reported === 1 ? 'it' : 'them'}, without student names.`}
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}

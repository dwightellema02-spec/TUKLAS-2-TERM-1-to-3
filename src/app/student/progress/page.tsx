import Link from 'next/link';
import { requireServerUser } from '../../../lib/auth/server-guard';
import { db } from '../../../server/db';
import { DashboardService } from '../../../services/dashboard.service';
import { SkillMasteryService } from '../../../services/skill-mastery.service';
import { StudentHomeService } from '../../../services/student-home.service';
import { StartPracticeButton } from '../../../components/start-practice';

export const dynamic = 'force-dynamic';

const LEVELS = ['NOT_STARTED', 'LEARNING', 'DEVELOPING', 'PROFICIENT', 'MASTERED'] as const;
const LEVEL_LABEL: Record<(typeof LEVELS)[number], string> = {
  NOT_STARTED: 'Not started',
  LEARNING: 'Learning',
  DEVELOPING: 'Developing',
  PROFICIENT: 'Proficient',
  MASTERED: 'Mastered',
};
const STATUS_LABEL = { NOT_STARTED: 'Not started', IN_PROGRESS: 'In progress', COMPLETED: 'Completed' } as const;
const STATUS_CLASS = { NOT_STARTED: '', IN_PROGRESS: ' in-progress', COMPLETED: ' completed' } as const;

export default async function ProgressPage() {
  const user = await requireServerUser(['STUDENT']);
  const [dashboard, home, mastery] = await Promise.all([
    DashboardService.getStudentDashboard(user.id),
    StudentHomeService.get(user.id),
    SkillMasteryService.listForStudent(user.id),
  ]);
  const { stats, path } = dashboard;

  const skillIds = mastery.map((row) => row.skill.id);
  const homes = skillIds.length
    ? await db.quizQuestion.findMany({
        where: { skillId: { in: skillIds }, assessmentId: null, lesson: { status: 'PUBLISHED' } },
        distinct: ['skillId'],
        select: { skillId: true, lessonId: true, lesson: { select: { title: true } } },
      })
    : [];
  const homeBySkill = new Map(homes.map((h) => [h.skillId, h]));
  // Weakest first: those are the ones worth practising.
  const skills = [...mastery].sort((a, b) => LEVELS.indexOf(a.status) - LEVELS.indexOf(b.status) || a.accuracy - b.accuracy);
  const percentDone = stats.lessonsAvailable ? Math.round((stats.lessonsCompleted / stats.lessonsAvailable) * 100) : 0;

  return (
    <main>
      <header className="ui-head">
        <div>
          <span className="eyebrow">Progress</span>
          <h1>Your progress</h1>
          <p className="ui-sub">Built from your answers over time, not from a single quiz.</p>
        </div>
        <Link className="ui-btn amber" href="/student/practice">Practice →</Link>
      </header>

      <section aria-label="Totals" className="stat-grid" style={{ marginTop: 0 }}>
        <div className="stat-card">
          <strong>{percentDone}%</strong>
          of lessons completed ({stats.lessonsCompleted} of {stats.lessonsAvailable})
        </div>
        <div className="stat-card">
          <strong>{stats.practiceSessions}</strong>
          practice sessions
        </div>
        <div className="stat-card">
          <strong>{home.streak}</strong>
          {home.streak === 1 ? 'day' : 'days'} in a row
        </div>
        <div className="stat-card">
          <strong>{stats.unresolvedMistakes}</strong>
          {stats.unresolvedMistakes === 1 ? 'mistake' : 'mistakes'} to review{' '}
          {stats.unresolvedMistakes > 0 && <Link href="/student/mistakes">Review now</Link>}
        </div>
      </section>

      <div className="ui-main-side">
        <div className="ui-stack">
          <section aria-labelledby="skills-heading" className="ui-card">
            <h2 id="skills-heading">Skills</h2>
            {skills.length === 0 ? (
              <p className="ui-note">
                Skill levels appear after you practise. Start with <Link href="/student/practice">a practice session</Link>.
              </p>
            ) : (
              <ul className="review-list">
                {skills.map((item) => {
                  const step = LEVELS.indexOf(item.status);
                  const where = homeBySkill.get(item.skill.id);
                  const weak = item.status === 'LEARNING' || item.status === 'DEVELOPING';
                  return (
                    <li key={item.skill.id} className="review-item">
                      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                        <p style={{ margin: 0, fontWeight: 700 }}>{item.skill.name}</p>
                        <span className={`status-chip${item.status === 'MASTERED' || item.status === 'PROFICIENT' ? ' completed' : weak ? ' in-progress' : ''}`}>
                          {LEVEL_LABEL[item.status]}
                        </span>
                      </div>
                      <div className={`ui-bar${weak ? ' amber' : ''}`} role="img" aria-label={`Level ${step} of 4: ${LEVEL_LABEL[item.status]}`}>
                        <span style={{ width: `${(step / 4) * 100}%` }} />
                      </div>
                      <p style={{ margin: '6px 0 0', color: 'var(--ink-soft)', fontSize: '0.86rem' }}>
                        {Math.round(item.accuracy * 100)}% correct over {item.attemptCount} {item.attemptCount === 1 ? 'answer' : 'answers'}
                        {where ? ` · ${where.lesson.title}` : ''}
                      </p>
                      {weak && where && (
                        <p style={{ margin: '8px 0 0' }}>
                          <StartPracticeButton lessonId={where.lessonId} skillId={item.skill.id} label="Practise this skill" className="ui-btn ghost" />
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section aria-labelledby="lessons-heading" className="ui-card">
            <h2 id="lessons-heading">Lessons</h2>
            {path.length === 0 ? (
              <p className="empty-state">No lessons are available yet.</p>
            ) : (
              <ul className="review-list">
                {path.map((lesson) => (
                  <li key={lesson.id} className="review-item">
                    <p style={{ margin: 0 }}>
                      <Link href={`/lessons/${lesson.id}`}>{lesson.title}</Link>{' '}
                      <span className={`status-chip${STATUS_CLASS[lesson.status]}`}>{STATUS_LABEL[lesson.status]}</span>
                    </p>
                    {lesson.unitTitle && <p style={{ margin: '4px 0 0', color: 'var(--ink-soft)' }}>{lesson.unitTitle}</p>}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <div className="ui-stack">
          <section aria-labelledby="results-heading" className="ui-card">
            <h2 id="results-heading">Recent results</h2>
            {home.recentResults.length === 0 ? (
              <p className="empty-state">Finish a practice session to see your results here.</p>
            ) : (
              home.recentResults.map((result) => (
                <div key={result.id} className="ui-metric">
                  <span>
                    <Link href={`/student/practice/${result.id}`}>{result.title}</Link>
                    <br />
                    <span style={{ color: 'var(--ink-soft)', fontSize: '0.82rem' }}>
                      {result.correct} of {result.total} · {result.date.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}
                    </span>
                  </span>
                  <strong className={result.percent >= 70 ? 'ui-good' : 'ui-warn'}>{result.percent}%</strong>
                </div>
              ))
            )}
          </section>

          <section aria-labelledby="by-subject-heading" className="ui-card">
            <h2 id="by-subject-heading">By subject</h2>
            {home.subjects.map((subject) => (
              <div key={subject.subject} className="ui-metric" style={{ display: 'block' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                  <span>{subject.subject}</span>
                  <strong>{subject.percent}%</strong>
                </div>
                <div className="ui-bar" role="img" aria-label={`${subject.completed} of ${subject.total} lessons completed`}>
                  <span style={{ width: `${subject.percent}%` }} />
                </div>
              </div>
            ))}
          </section>
        </div>
      </div>
    </main>
  );
}

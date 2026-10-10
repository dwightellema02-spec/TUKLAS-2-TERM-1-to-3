import Link from 'next/link';
import { requireServerUser } from '../../lib/auth/server-guard';
import { DashboardService } from '../../services/dashboard.service';
import { ClassService } from '../../services/class.service';
import { StudentHomeService } from '../../services/student-home.service';
import { JoinClass } from '../../components/join-class';
import { StartPracticeButton } from '../../components/start-practice';

export const dynamic = 'force-dynamic';

const STATUS_LABEL = {
  NOT_STARTED: 'Not started',
  IN_PROGRESS: 'In progress',
  COMPLETED: 'Completed',
} as const;

const STATUS_CLASS = {
  NOT_STARTED: '',
  IN_PROGRESS: ' in-progress',
  COMPLETED: ' completed',
} as const;

const LEVEL_LABEL = { LEARNING: 'Learning', DEVELOPING: 'Developing' } as const;

const initials = (title: string) => title.replace(/[^A-Za-z0-9 ]/g, '').split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '·';

export default async function StudentWorkspacePage() {
  const user = await requireServerUser(['STUDENT']);
  const [dashboard, classView, home] = await Promise.all([
    DashboardService.getStudentDashboard(user.id),
    ClassService.getStudentView(user.id),
    StudentHomeService.get(user.id),
  ]);
  const { stats, continueLesson, path, recentSessions } = dashboard;
  const firstName = user.displayName;

  return (
    <main>
      <header className="ui-head">
        <div>
          <span className="eyebrow">Student workspace</span>
          <h1>Welcome back, {firstName}</h1>
          <p className="ui-sub">
            {home.streak > 0
              ? `Day ${home.streak} of your learning streak. Keep it going today.`
              : 'Do one activity today to start your learning streak.'}
          </p>
        </div>
        <span className="ui-pill" aria-label={`Learning streak: ${home.streak} ${home.streak === 1 ? 'day' : 'days'}`}>
          🔥 {home.streak}-day streak
        </span>
      </header>

      <form action="/curriculum" method="get" role="search" className="ui-search">
        <label htmlFor="home-search" className="sr-only">Search lessons</label>
        <span aria-hidden="true">🔎</span>
        <input id="home-search" name="q" type="search" placeholder="What would you like to learn today?" />
        <button type="submit" className="ui-btn">Search</button>
      </form>

      <nav aria-label="Quick actions" className="ui-quick" style={{ margin: '16px 0 26px' }}>
        <Link href="/student/learn"><span aria-hidden="true">▶</span> Learn from a lesson</Link>
        <Link href="/student/ask"><span aria-hidden="true">✦</span> Ask Tuklas</Link>
        <Link href="/student/practice"><span aria-hidden="true">✎</span> Practice</Link>
        <Link href="/student/mistakes"><span aria-hidden="true">↺</span> Review mistakes</Link>
      </nav>

      <div className="ui-main-side">
        <div className="ui-stack">
          <section aria-labelledby="continue-heading">
            <div className="ui-section-title" style={{ marginTop: 0 }}>
              <h2 id="continue-heading">{continueLesson?.status === 'IN_PROGRESS' ? 'Continue learning' : 'Start learning'}</h2>
              <Link href="/curriculum">See all →</Link>
            </div>
            {continueLesson ? (
              <div className="ui-row">
                <span className="ui-icon-tile" aria-hidden="true">{initials(continueLesson.title)}</span>
                <div className="ui-row-body">
                  <h3>{continueLesson.title}</h3>
                  <p>
                    {continueLesson.unitTitle ?? continueLesson.subject}
                    {continueLesson.estimatedMinutes ? ` · about ${continueLesson.estimatedMinutes} minutes` : ''}
                  </p>
                </div>
                <Link className="ui-btn ghost" href={`/lessons/${continueLesson.id}`}>
                  {continueLesson.status === 'IN_PROGRESS' ? 'Continue lesson' : 'Open lesson'}
                </Link>
              </div>
            ) : (
              <p className="ui-note">
                {stats.lessonsAvailable === 0
                  ? 'No lessons are published yet. Check back soon.'
                  : 'You have completed every available lesson. Great work!'}
              </p>
            )}
          </section>

          <section aria-labelledby="recommended-heading">
            <div className="ui-section-title" style={{ marginTop: 0 }}>
              <h2 id="recommended-heading">Recommended for you</h2>
            </div>
            {home.recommended ? (
              <div className="ui-row">
                <span className="ui-icon-tile" aria-hidden="true">{initials(home.recommended.skillName)}</span>
                <div className="ui-row-body">
                  <h3>{home.recommended.skillName}</h3>
                  <p>
                    Your recent practice shows this is your weakest skill so far ({LEVEL_LABEL[home.recommended.level]}, {home.recommended.accuracyPercent}% correct) in {home.recommended.lessonTitle}.
                  </p>
                </div>
                <StartPracticeButton lessonId={home.recommended.lessonId} skillId={home.recommended.skillId} label="Practice now" />
              </div>
            ) : (
              <p className="ui-note">
                Once you have practised, Tuklas shows the skill that needs the most work here. Try{' '}
                <Link href="/student/practice">a practice session</Link>.
              </p>
            )}
          </section>

          {home.needsPractice.length > 0 && (
            <section aria-labelledby="needs-heading">
              <div className="ui-section-title" style={{ marginTop: 0 }}>
                <h2 id="needs-heading">Needs practice</h2>
              </div>
              {home.needsPractice.map((item) => (
                <div key={item.skillId} className="ui-row">
                  <span className="ui-icon-tile blue" aria-hidden="true">{initials(item.skillName)}</span>
                  <div className="ui-row-body">
                    <h3>{item.skillName}</h3>
                    <p>{LEVEL_LABEL[item.level]} · {item.accuracyPercent}% correct · {item.lessonTitle}</p>
                  </div>
                  <StartPracticeButton lessonId={item.lessonId} skillId={item.skillId} label="Review" className="ui-btn ghost" />
                </div>
              ))}
            </section>
          )}

          <section aria-labelledby="classes-heading" className="ui-card">
            <h2 id="classes-heading">Your classes and assignments</h2>

            {classView.assignments.length > 0 ? (
              <ul className="review-list" style={{ marginBottom: 16 }}>
                {classView.assignments.map((assignment) => (
                  <li key={assignment.id} className={`review-item${assignment.overdue ? ' missed' : ''}`}>
                    <p style={{ margin: 0 }}>
                      <Link href={`/lessons/${assignment.lesson.id}`}>{assignment.lesson.title}</Link>{' '}
                      <span className={`status-chip${STATUS_CLASS[assignment.status]}`}>{STATUS_LABEL[assignment.status]}</span>
                      {assignment.overdue && <strong> · Overdue</strong>}
                    </p>
                    <p style={{ margin: '4px 0 0', color: 'var(--ink-soft)' }}>
                      {assignment.className}
                      {assignment.dueAt
                        ? ` · due ${assignment.dueAt.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}`
                        : ' · no due date'}
                    </p>
                  </li>
                ))}
              </ul>
            ) : classView.classes.length > 0 ? (
              <p className="empty-state">Your teacher has not assigned anything yet.</p>
            ) : (
              <p className="empty-state">You are not in a class yet. Ask your teacher for a join code.</p>
            )}

            {classView.classes.length > 0 && (
              <p style={{ color: 'var(--ink-soft)' }}>
                In class: {classView.classes.map((cls) => `${cls.name} (${cls.teacher})`).join(', ')}
              </p>
            )}
            <JoinClass />
          </section>

          <section aria-labelledby="path-heading" className="ui-card">
            <h2 id="path-heading">Your learning path</h2>
            {path.length === 0 ? (
              <p className="empty-state">No lessons are available yet.</p>
            ) : (
              <ol className="review-list">
                {path.map((lesson, index) => (
                  <li key={lesson.id} className="review-item">
                    <p style={{ margin: 0 }}>
                      <span style={{ color: 'var(--ink-soft)' }}>{index + 1}. </span>
                      <Link href={`/lessons/${lesson.id}`}>{lesson.title}</Link>{' '}
                      <span className={`status-chip${STATUS_CLASS[lesson.status]}`}>{STATUS_LABEL[lesson.status]}</span>
                    </p>
                    {lesson.unitTitle && <p style={{ margin: '4px 0 0', color: 'var(--ink-soft)' }}>{lesson.unitTitle}</p>}
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>

        <div className="ui-stack">
          <section aria-labelledby="progress-heading" className="ui-card">
            <h2 id="progress-heading">Your progress</h2>
            {home.subjects.length === 0 ? (
              <p className="empty-state">No lessons are available yet.</p>
            ) : (
              home.subjects.map((subject) => (
                <div key={subject.subject} className="ui-metric" style={{ display: 'block' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                    <span>{subject.subject}</span>
                    <strong>{subject.percent}%</strong>
                  </div>
                  <div className="ui-bar" role="img" aria-label={`${subject.completed} of ${subject.total} lessons completed`}>
                    <span style={{ width: `${subject.percent}%` }} />
                  </div>
                  <p style={{ margin: '4px 0 0', color: 'var(--ink-soft)', fontSize: '0.82rem' }}>
                    {subject.completed} of {subject.total} lessons completed
                  </p>
                </div>
              ))
            )}
            <p style={{ margin: '12px 0 0' }}>
              <Link className="ui-btn ghost" href="/student/progress" style={{ width: '100%' }}>View full progress →</Link>
            </p>
          </section>

          <section aria-labelledby="goal-heading" className="ui-card">
            <h2 id="goal-heading">Today’s goal</h2>
            <p style={{ margin: '0 0 8px', color: 'var(--ink-soft)' }}>
              {home.goal.done} of {home.goal.target} activities completed
            </p>
            <div style={{ display: 'flex', gap: 6 }} role="img" aria-label={`${home.goal.done} of ${home.goal.target} activities completed today`}>
              {Array.from({ length: home.goal.target }, (_, i) => (
                <span key={i} className={`ui-bar${i < home.goal.done ? '' : ' empty'}`} style={{ flex: 1, margin: 0 }}>
                  <span style={{ width: i < home.goal.done ? '100%' : '0%' }} />
                </span>
              ))}
            </div>
            <p style={{ margin: '10px 0 0', color: 'var(--ink-soft)', fontSize: '0.82rem' }}>
              An activity is a practice session or a lesson you worked on today.
            </p>
          </section>

          <section aria-labelledby="results-heading" className="ui-card">
            <h2 id="results-heading">Recent results</h2>
            {home.recentResults.length === 0 ? (
              <p className="empty-state">Finish a practice session to see your results here.</p>
            ) : (
              home.recentResults.map((result) => (
                <div key={result.id} className="ui-metric">
                  <Link href={`/student/practice/${result.id}`}>{result.title}</Link>
                  <strong className={result.percent >= 70 ? 'ui-good' : 'ui-warn'}>{result.percent}%</strong>
                </div>
              ))
            )}
          </section>
        </div>
      </div>

      <section aria-label="Your progress at a glance" className="stat-grid">
        <div className="stat-card">
          <strong>{stats.lessonsCompleted}</strong>
          of {stats.lessonsAvailable} lessons completed
        </div>
        <div className="stat-card">
          <strong>{stats.lessonsInProgress}</strong>
          in progress
        </div>
        <div className="stat-card">
          <strong>{stats.practiceSessions}</strong>
          practice sessions
        </div>
        <div className="stat-card">
          <strong>{stats.unresolvedMistakes}</strong>
          {stats.unresolvedMistakes === 1 ? 'mistake' : 'mistakes'} to review
          {stats.unresolvedMistakes > 0 && (
            <>
              {' '}
              <Link href="/student/mistakes">Review now</Link>
            </>
          )}
        </div>
      </section>

      <section aria-labelledby="recent-heading" className="ui-card">
        <h2 id="recent-heading">Recent practice</h2>
        {recentSessions.length === 0 ? (
          <p className="empty-state">
            No practice yet. Open a lesson and choose “Practice this lesson” to try some questions.
          </p>
        ) : (
          <ul className="review-list">
            {recentSessions.map((session) => (
              <li key={session.id} className="review-item">
                <p style={{ margin: 0 }}>
                  <Link href={`/student/practice/${session.id}`}>{session.lesson?.title ?? session.topic}</Link>
                </p>
                <p style={{ margin: '4px 0 0', color: 'var(--ink-soft)' }}>
                  {session.completedAt
                    ? `${session.correct} of ${session.total} correct`
                    : 'In progress — pick up where you left off'}
                  {' · '}
                  {session.startedAt.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

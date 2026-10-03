import Link from 'next/link';
import { requireServerUser } from '../../lib/auth/server-guard';
import { DashboardService } from '../../services/dashboard.service';

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

export default async function StudentWorkspacePage() {
  const user = await requireServerUser(['STUDENT']);
  const dashboard = await DashboardService.getStudentDashboard(user.id);
  const { stats, continueLesson, path, recentSessions } = dashboard;

  return (
    <main className="practice-page" style={{ padding: '24px max(20px, calc((100vw - 1000px) / 2))' }}>
      <nav className="app-nav">
        <Link className="brand" href="/">Tuklas<span>V2</span></Link>
        <Link href="/curriculum">Curriculum</Link>
      </nav>

      <header style={{ margin: '8px 0 24px' }}>
        <span className="eyebrow">Student workspace</span>
        <h1 style={{ margin: '8px 0', color: '#0e3b34', fontSize: 'clamp(1.8rem, 5vw, 2.6rem)' }}>
          Welcome back, {user.displayName}
        </h1>
      </header>

      <section aria-labelledby="continue-heading" className="practice-card">
        <h2 id="continue-heading" style={{ marginTop: 0, color: '#0e3b34' }}>
          {continueLesson?.status === 'IN_PROGRESS' ? 'Continue learning' : 'Start learning'}
        </h2>
        {continueLesson ? (
          <>
            <p style={{ margin: '0 0 4px', fontWeight: 700 }}>{continueLesson.title}</p>
            <p style={{ margin: '0 0 12px', color: '#53635a' }}>
              {continueLesson.unitTitle ?? continueLesson.subject}
              {continueLesson.estimatedMinutes ? ` · about ${continueLesson.estimatedMinutes} minutes` : ''}
            </p>
            <div className="action-row" style={{ marginTop: 0 }}>
              <Link className="link-button" href={`/lessons/${continueLesson.id}`} style={{ background: '#0e3b34', color: '#fff' }}>
                {continueLesson.status === 'IN_PROGRESS' ? 'Continue lesson' : 'Open lesson'}
              </Link>
            </div>
          </>
        ) : (
          <p className="empty-state">
            {stats.lessonsAvailable === 0
              ? 'No lessons are published yet. Check back soon.'
              : 'You have completed every available lesson. Great work!'}
          </p>
        )}
      </section>

      <section aria-label="Your progress" className="stat-grid">
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

      <section aria-labelledby="path-heading" className="practice-card" style={{ marginBottom: 24 }}>
        <h2 id="path-heading" style={{ marginTop: 0, color: '#0e3b34' }}>Your learning path</h2>
        {path.length === 0 ? (
          <p className="empty-state">No lessons are available yet.</p>
        ) : (
          <ol className="review-list">
            {path.map((lesson, index) => (
              <li key={lesson.id} className="review-item">
                <p style={{ margin: 0 }}>
                  <span style={{ color: '#53635a' }}>{index + 1}. </span>
                  <Link href={`/lessons/${lesson.id}`}>{lesson.title}</Link>{' '}
                  <span className={`status-chip${STATUS_CLASS[lesson.status]}`}>{STATUS_LABEL[lesson.status]}</span>
                </p>
                {lesson.unitTitle && <p style={{ margin: '4px 0 0', color: '#53635a' }}>{lesson.unitTitle}</p>}
              </li>
            ))}
          </ol>
        )}
      </section>

      <section aria-labelledby="recent-heading" className="practice-card">
        <h2 id="recent-heading" style={{ marginTop: 0, color: '#0e3b34' }}>Recent practice</h2>
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
                <p style={{ margin: '4px 0 0', color: '#53635a' }}>
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

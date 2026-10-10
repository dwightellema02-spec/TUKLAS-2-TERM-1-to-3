import Link from 'next/link';
import { requireServerUser } from '../../../lib/auth/server-guard';
import { DashboardService } from '../../../services/dashboard.service';

export const dynamic = 'force-dynamic';

export default async function AskTuklasPage() {
  const user = await requireServerUser(['STUDENT']);
  const { path, continueLesson } = await DashboardService.getStudentDashboard(user.id);

  return (
    <main>
      <header className="ui-head">
        <div>
          <span className="eyebrow">Ask Tuklas</span>
          <h1>Ask Tuklas</h1>
          <p className="ui-sub">
            Tuklas helps you think. It asks guiding questions and explains. It does not just hand over answers.
          </p>
        </div>
      </header>

      <section className="ui-card" aria-labelledby="how-heading">
        <h2 id="how-heading">Where to ask</h2>
        <p style={{ marginTop: 0 }}>
          Help is tied to what you are studying, so it can use the lesson’s own words and your teacher’s notes. Open a lesson and use
          the <strong>Ask about this lesson</strong> panel, or ask about a single question while you practise.
        </p>
        {continueLesson && (
          <p style={{ marginBottom: 0 }}>
            <Link className="ui-btn amber" href={`/lessons/${continueLesson.id}`}>Ask about “{continueLesson.title}”</Link>
          </p>
        )}
      </section>

      <div className="ui-section-title">
        <h2>Pick a lesson to ask about</h2>
      </div>
      {path.length === 0 ? (
        <p className="ui-note">No lessons are available yet.</p>
      ) : (
        <ul className="review-list">
          {path.map((lesson) => (
            <li key={lesson.id} className="review-item">
              <p style={{ margin: 0 }}>
                <Link href={`/lessons/${lesson.id}`}>{lesson.title}</Link>
              </p>
              {lesson.unitTitle && <p style={{ margin: '4px 0 0', color: 'var(--ink-soft)' }}>{lesson.unitTitle}</p>}
            </li>
          ))}
        </ul>
      )}
      <p className="ui-note" style={{ marginTop: 20 }}>
        Please do not type personal details. If a reply is wrong or unkind, use “Report this reply” in the panel so your teacher can see it.
      </p>
    </main>
  );
}

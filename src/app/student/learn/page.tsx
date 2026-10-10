import Link from 'next/link';
import { requireServerUser } from '../../../lib/auth/server-guard';
import { DashboardService } from '../../../services/dashboard.service';

export const dynamic = 'force-dynamic';

export default async function LearnHubPage() {
  const user = await requireServerUser(['STUDENT']);
  const { continueLesson, path } = await DashboardService.getStudentDashboard(user.id);
  const started = path.filter((lesson) => lesson.status !== 'NOT_STARTED');

  return (
    <main>
      <header className="ui-head">
        <div>
          <span className="eyebrow">Learn</span>
          <h1>Learn</h1>
          <p className="ui-sub">Choose how you want to learn this topic.</p>
        </div>
      </header>

      <div className="ui-tiles">
        <Link className="ui-tile" href="/curriculum">
          <span className="ui-icon-tile" aria-hidden="true">🏫</span>
          <h2>Teacher lesson</h2>
          <p>Open a lesson your teacher published. Each one has checks, practice and help from Tuklas.</p>
        </Link>

        {continueLesson ? (
          <Link className="ui-tile" href={`/lessons/${continueLesson.id}`}>
            <span className="ui-icon-tile" aria-hidden="true">▶</span>
            <h2>{continueLesson.status === 'IN_PROGRESS' ? 'Continue where you stopped' : 'Start your next lesson'}</h2>
            <p>{continueLesson.title}</p>
          </Link>
        ) : (
          <div className="ui-tile">
            <span className="ui-icon-tile" aria-hidden="true">▶</span>
            <h2>Continue where you stopped</h2>
            <p>No lessons are available yet.</p>
          </div>
        )}

        <Link className="ui-tile" href="/student/progress">
          <span className="ui-icon-tile" aria-hidden="true">↺</span>
          <h2>Review a previous lesson</h2>
          <p>
            {started.length > 0
              ? `You have started ${started.length} ${started.length === 1 ? 'lesson' : 'lessons'}. Open any of them again from your progress page.`
              : 'Lessons you have started will appear here so you can open them again.'}
          </p>
        </Link>

        <div className="ui-tile soon" aria-label="YouTube video lesson, coming soon">
          <span className="ui-icon-tile" aria-hidden="true">▶</span>
          <h2>YouTube video lesson</h2>
          <p>Paste a video transcript and Tuklas builds an interactive lesson from it.</p>
          <span className="ui-pill">Coming soon</span>
        </div>

        <div className="ui-tile soon" aria-label="AI lesson, coming soon">
          <span className="ui-icon-tile" aria-hidden="true">✦</span>
          <h2>AI lesson</h2>
          <p>Describe a topic and Tuklas drafts a lesson to get you started.</p>
          <span className="ui-pill">Coming soon</span>
        </div>

        <div className="ui-tile soon" aria-label="Uploaded study material, coming soon">
          <span className="ui-icon-tile" aria-hidden="true">📄</span>
          <h2>Uploaded study material</h2>
          <p>Turn your notes, slides or PDFs into a lesson.</p>
          <span className="ui-pill">Coming soon</span>
        </div>
      </div>
    </main>
  );
}

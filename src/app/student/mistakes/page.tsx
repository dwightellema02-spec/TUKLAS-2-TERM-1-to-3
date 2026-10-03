'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { renderWithMath } from '../../../components/math-formula';

type Mistake = {
  id: string;
  submittedAnswer: string;
  correctReference: string | null;
  analysis: string | null;
  resolved: boolean;
  createdAt: string;
  lesson: { id: string; title: string } | null;
};

export default function MistakesPage() {
  const [showResolved, setShowResolved] = useState(false);
  const [mistakes, setMistakes] = useState<Mistake[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');

  useEffect(() => {
    let active = true;
    fetch(`/api/mistakes?resolved=${showResolved}`)
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error ?? 'Your mistakes could not be loaded.');
        if (active) {
          setMistakes(payload.data.mistakes as Mistake[]);
          setError('');
        }
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : 'Your mistakes could not be loaded.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [showResolved]);

  function switchView(next: boolean) {
    if (next === showResolved) return;
    setLoading(true);
    setShowResolved(next);
  }

  async function markUnderstood(id: string) {
    setBusyId(id);
    setError('');
    try {
      const response = await fetch(`/api/mistakes/${encodeURIComponent(id)}/resolve`, { method: 'POST' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? 'Could not update this mistake.');
      setMistakes((current) => current.filter((mistake) => mistake.id !== id));
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'Could not update this mistake.');
    } finally {
      setBusyId('');
    }
  }

  return (
    <main className="practice-page">
      <nav className="app-nav">
        <Link className="brand" href="/">Tuklas<span>V2</span></Link>
        <Link href="/student">Workspace</Link>
      </nav>
      <article className="practice-card">
        <p className="eyebrow">Learn from your mistakes</p>
        <h1>My mistakes</h1>
        <p>
          Every wrong answer from practice is saved here with the reason, so you can understand it and
          try again. Mark a mistake as understood once it makes sense.
        </p>

        <div className="mode-switch" role="group" aria-label="Which mistakes to show">
          <button
            type="button"
            className={!showResolved ? 'active' : ''}
            aria-pressed={!showResolved}
            onClick={() => switchView(false)}
          >
            To review
          </button>
          <button
            type="button"
            className={showResolved ? 'active' : ''}
            aria-pressed={showResolved}
            onClick={() => switchView(true)}
          >
            Understood
          </button>
        </div>

        {error && <p role="alert">{error}</p>}
        {loading && <p role="status">Loading...</p>}

        {!loading && !error && mistakes.length === 0 && (
          <p className="empty-state">
            {showResolved
              ? 'Nothing here yet.'
              : 'No mistakes to review. Do some practice and any wrong answers will show up here.'}
          </p>
        )}

        <ol className="review-list" style={{ marginTop: 16 }}>
          {mistakes.map((mistake) => (
            <li key={mistake.id} className="review-item missed">
              {mistake.lesson && (
                <p style={{ margin: '0 0 6px' }}>
                  <Link href={`/lessons/${mistake.lesson.id}`}>{mistake.lesson.title}</Link>
                </p>
              )}
              <p style={{ margin: '0 0 4px' }}>
                You answered: <strong>{renderWithMath(mistake.submittedAnswer)}</strong>
              </p>
              {mistake.correctReference && (
                <p style={{ margin: '0 0 4px' }}>
                  Correct answer: <strong>{renderWithMath(mistake.correctReference)}</strong>
                </p>
              )}
              {mistake.analysis && <p style={{ margin: '6px 0' }}>{renderWithMath(mistake.analysis)}</p>}
              <div className="action-row">
                {!mistake.resolved && (
                  <button
                    className="quiet-button"
                    onClick={() => markUnderstood(mistake.id)}
                    disabled={busyId === mistake.id}
                  >
                    {busyId === mistake.id ? 'Saving...' : 'I understand this now'}
                  </button>
                )}
                {mistake.lesson && (
                  <Link className="link-button" href={`/lessons/${mistake.lesson.id}`}>
                    Review the lesson
                  </Link>
                )}
              </div>
            </li>
          ))}
        </ol>
      </article>
    </main>
  );
}

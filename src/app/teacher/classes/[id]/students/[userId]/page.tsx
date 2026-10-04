'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { CATEGORY_LABEL, LEVEL_LABEL } from '../../../../../../components/class-insights';

type StudentInsight = {
  student: { id: string; displayName: string; email: string };
  windowDays: number;
  totals: { questionsAnswered: number; accuracy: number | null };
  activity: { date: string; students: number; questions: number }[];
  skills: { name: string; status: keyof typeof LEVEL_LABEL; attempts: number; accuracy: number | null }[];
  unresolvedMistakes: { category: string; count: number }[];
  recentSessions: { id: string; lesson: string | null; startedAt: string; answered: number; correct: number; total: number; finished: boolean }[];
};

const formatDate = (value: string) => new Date(value).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });

/** One student's evidence for their teacher: skills, recent practice and mistakes still to review. */
export default function StudentInsightPage() {
  const { id, userId } = useParams<{ id: string; userId: string }>();
  const [data, setData] = useState<StudentInsight | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    fetch(`/api/classes/${encodeURIComponent(id)}/students/${encodeURIComponent(userId)}`)
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error ?? 'This student could not be loaded.');
        if (active) setData(payload.data as StudentInsight);
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : 'This student could not be loaded.');
      });
    return () => {
      active = false;
    };
  }, [id, userId]);

  const back = <Link href={`/teacher/classes/${id}`}>Back to the class</Link>;

  if (!data) {
    return (
      <main className="practice-page">
        {error ? <p role="alert">{error}</p> : <p role="status">Loading...</p>}
        {back}
      </main>
    );
  }

  const recent = data.activity.reduce((sum, day) => sum + day.questions, 0);

  return (
    <main className="practice-page" style={{ padding: '24px max(20px, calc((100vw - 1000px) / 2))' }}>
      <nav className="app-nav">
        <Link className="brand" href="/">Tuklas<span>V2</span></Link>
        <Link href={`/teacher/classes/${id}`}>Back to the class</Link>
      </nav>

      <article className="practice-card">
        <p className="eyebrow">Student</p>
        <h1>{data.student.displayName}</h1>
        <p style={{ color: '#475569' }}>{data.student.email}</p>

        {data.totals.questionsAnswered === 0 ? (
          <p className="empty-state">This student has not answered any practice questions yet.</p>
        ) : (
          <p>
            {data.totals.questionsAnswered} questions answered
            {data.totals.accuracy === null ? '' : `, ${data.totals.accuracy}% correct`}; {recent} in the last {data.windowDays} days.
          </p>
        )}

        <section aria-labelledby="student-skills" className="skill-panel">
          <h2 id="student-skills" style={{ marginTop: 0 }}>Skills</h2>
          {data.skills.length === 0 ? (
            <p className="empty-state">No skill evidence yet.</p>
          ) : (
            <div className="table-scroll" role="region" aria-label="Skill levels (scrolls sideways on small screens)" tabIndex={0}>
              <table className="roster-table">
                <caption className="sr-only">Skill levels for {data.student.displayName}</caption>
                <thead>
                  <tr>
                    <th scope="col">Skill</th>
                    <th scope="col">Level</th>
                    <th scope="col">Questions</th>
                    <th scope="col">Accuracy</th>
                  </tr>
                </thead>
                <tbody>
                  {data.skills.map((skill) => (
                    <tr key={skill.name}>
                      <th scope="row">{skill.name}</th>
                      <td>{LEVEL_LABEL[skill.status] ?? skill.status}</td>
                      <td>{skill.attempts}</td>
                      <td>{skill.accuracy === null ? 'No answers' : `${skill.accuracy}%`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section aria-labelledby="student-mistakes" className="skill-panel">
          <h2 id="student-mistakes" style={{ marginTop: 0 }}>Mistakes not yet reviewed</h2>
          {data.unresolvedMistakes.length === 0 ? (
            <p className="empty-state">None.</p>
          ) : (
            <ul className="review-list">
              {data.unresolvedMistakes.map((item) => (
                <li key={item.category} className="review-item">
                  {CATEGORY_LABEL[item.category] ?? item.category}: {item.count}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="student-sessions" className="skill-panel">
          <h2 id="student-sessions" style={{ marginTop: 0 }}>Recent practice</h2>
          {data.recentSessions.length === 0 ? (
            <p className="empty-state">No practice sessions yet.</p>
          ) : (
            <ul className="review-list">
              {data.recentSessions.map((session) => (
                <li key={session.id} className="review-item">
                  <strong>{session.lesson ?? 'Practice'}</strong> · {formatDate(session.startedAt)} ·{' '}
                  {session.finished ? `${session.correct} of ${session.total} correct` : `${session.answered} of ${session.total} answered, not finished`}
                </li>
              ))}
            </ul>
          )}
        </section>
      </article>
    </main>
  );
}

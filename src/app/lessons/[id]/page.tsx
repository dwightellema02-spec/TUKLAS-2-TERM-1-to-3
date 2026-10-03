'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { EducationalContent, YouTubeVideoPlayer } from '../../../components/educational-content';
import { renderWithMath } from '../../../components/math-formula';

type LessonDetail = {
  id: string;
  title: string;
  description?: string | null;
  subject: string;
  gradeLevel: string;
  estimatedMinutes: number | null;
  status: string;
  unit: {
    title: string;
    term: {
      title: string;
      curriculum: {
        subject: { name: string };
        gradeLevel: { label: string };
      };
    };
  } | null;
  sections: {
    id: string;
    position: number;
    heading: string;
    type?: string;
    content?: string | null;
    metadata?: unknown;
    sourceExplanation?: string | null;
    aiExplanation?: string | null;
  }[];
  contents: { id: string; position: number; kind: string; heading: string | null; body: string }[];
  sources: { id: string; provider: string; url: string; title: string; description: string | null; videoId?: string | null }[];
  objectives: {
    id: string;
    description: string;
    competency: { title: string; code: string | null; description: string | null } | null;
    skills: { skill: { name: string; code: string | null } }[];
  }[];
  vocabulary: { id: string; term: string; definition: string }[];
  checks: {
    id: string;
    position: number;
    question: string;
    questionType?: string;
    options: string[];
    correctIndex?: number;
    explanation?: string;
  }[];
  quizQuestions: { id: string; question: string; options: string[]; correctIndex?: number; explanation?: string }[];
  assessments: { id: string; title: string; description: string | null }[];
};

export default function LessonPage() {
  const { id } = useParams<{ id: string }>();
  const [lesson, setLesson] = useState<LessonDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [progressMessage, setProgressMessage] = useState('');
  const [student, setStudent] = useState(false);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<string, number>>({});
  const [textAnswers, setTextAnswers] = useState<Record<string, string>>({});
  const [checkResults, setCheckResults] = useState<
    Record<string, { correct: boolean; explanation: string | null } | { error: string }>
  >({});
  const [checkingId, setCheckingId] = useState('');

  useEffect(() => {
    let active = true;
    Promise.all([
      fetch(`/api/lessons/${encodeURIComponent(id)}`),
      fetch('/api/auth/session'),
    ])
      .then(async ([lessonResponse, sessionResponse]) => {
        const payload = await lessonResponse.json();
        if (!lessonResponse.ok) throw new Error(payload.error ?? 'Lesson unavailable.');
        const session = sessionResponse.ok ? await sessionResponse.json() : null;
        if (active) {
          setLesson(payload.data.lesson);
          setStudent(session?.data?.user?.role === 'STUDENT');
        }
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : 'Lesson unavailable.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [id]);

  async function updateProgress(status: 'IN_PROGRESS' | 'COMPLETED') {
    setProgressMessage('');
    try {
      const response = await fetch(`/api/lessons/${encodeURIComponent(id)}/progress`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? 'Progress could not be saved.');
      setProgressMessage(status === 'COMPLETED' ? 'Lesson marked complete.' : 'Progress saved.');
    } catch (cause: unknown) {
      setProgressMessage(cause instanceof Error ? cause.message : 'Progress could not be saved.');
    }
  }

  // The server grades every knowledge check; the browser only reports what was chosen.
  async function submitCheck(check: LessonDetail['checks'][number]) {
    const hasOptions = Array.isArray(check.options) && check.options.length > 0;
    const body = hasOptions
      ? { selectedIndex: selectedAnswers[check.id] }
      : { answer: textAnswers[check.id] ?? '' };
    if (hasOptions && body.selectedIndex === undefined) {
      setCheckResults((prev) => ({ ...prev, [check.id]: { error: 'Choose an answer first.' } }));
      return;
    }
    setCheckingId(check.id);
    try {
      const response = await fetch(
        `/api/lessons/${encodeURIComponent(id)}/checks/${encodeURIComponent(check.id)}/answer`,
        { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) },
      );
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? 'Your answer could not be checked.');
      setCheckResults((prev) => ({
        ...prev,
        [check.id]: { correct: payload.data.correct, explanation: payload.data.explanation },
      }));
    } catch (cause: unknown) {
      setCheckResults((prev) => ({
        ...prev,
        [check.id]: { error: cause instanceof Error ? cause.message : 'Your answer could not be checked.' },
      }));
    } finally {
      setCheckingId('');
    }
  }

  if (loading) return <main className="lesson-page"><p role="status">Loading lesson...</p></main>;
  if (error || !lesson) {
    return <main className="lesson-page"><p role="alert">{error || 'Lesson unavailable.'}</p><Link href="/curriculum">Return to Curriculum Catalog</Link></main>;
  }

  return (
    <main className="lesson-page">
      <nav className="app-nav">
        <Link className="brand" href="/">Tuklas<span>V2</span></Link>
        <Link href="/curriculum">Curriculum</Link>
      </nav>
      <article className="lesson-detail">
        <p className="eyebrow">
          {lesson.unit?.term.curriculum.subject.name ?? lesson.subject}
          {' · '}{lesson.unit?.term.curriculum.gradeLevel.label ?? lesson.gradeLevel}
          {lesson.unit && ` · ${lesson.unit.term.title} · ${lesson.unit.title}`}
        </p>
        <h1>{renderWithMath(lesson.title)}</h1>
        {lesson.description && <p style={{ fontSize: '1.05rem', color: '#475569', lineHeight: 1.6 }}>{renderWithMath(lesson.description)}</p>}
        {lesson.estimatedMinutes && <p style={{ fontSize: '0.85rem', color: '#64748b' }}>Estimated time: {lesson.estimatedMinutes} minutes</p>}

        {/* EDUCATIONAL VIDEO REFERENCES */}
        {lesson.sources && lesson.sources.length > 0 && (
          <section className="lesson-video-section">
            <h2>Video Reference</h2>
            {lesson.sources.map((src) => (
              <div key={src.id} style={{ margin: '16px 0' }}>
                {src.videoId ? (
                  <YouTubeVideoPlayer videoId={src.videoId} title={src.title} />
                ) : (
                  <p><a href={src.url} target="_blank" rel="noreferrer">{src.title}</a></p>
                )}
                {src.description && <p style={{ fontSize: '0.85rem', color: '#64748b' }}>{src.description}</p>}
              </div>
            ))}
          </section>
        )}

        {/* LEARNING OBJECTIVES */}
        {lesson.objectives.length > 0 && (
          <section>
            <h2>Learning Objectives</h2>
            <ul>
              {lesson.objectives.map((objective) => (
                <li key={objective.id}>
                  {objective.description}
                  {objective.competency && <p>Competency: {objective.competency.title}</p>}
                  {objective.skills.length > 0 && <p>Skills: {objective.skills.map(({ skill }) => skill.name).join(', ')}</p>}
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* SECTIONS WITH MATH & WORKED EXAMPLES */}
        {lesson.sections.map((section) => (
          <section className="lesson-content-block" key={section.id}>
            <h2>{renderWithMath(section.heading)}</h2>
            <EducationalContent
              content={section.content ?? section.sourceExplanation ?? null}
              type={section.type}
              metadata={section.metadata}
            />
            {section.aiExplanation && (
              <aside style={{ backgroundColor: '#f0fdf4', padding: '12px', borderRadius: '6px', borderLeft: '4px solid #16a34a', margin: '12px 0' }}>
                <strong style={{ color: '#166534', fontSize: '0.85rem' }}>Study Tip: </strong>
                {renderWithMath(section.aiExplanation)}
              </aside>
            )}
          </section>
        ))}

        {/* VOCABULARY */}
        {lesson.vocabulary.length > 0 && (
          <section>
            <h2>Vocabulary</h2>
            <dl>
              {lesson.vocabulary.map((entry) => (
                <div key={entry.id}>
                  <dt>{entry.term}</dt>
                  <dd>{entry.definition}</dd>
                </div>
              ))}
            </dl>
          </section>
        )}

        {/* FORMATIVE CHECKS (ANTI-CHEATING PROTECTED FOR STUDENTS) */}
        {lesson.checks.length > 0 && (
          <section>
            <h2>Knowledge Checks</h2>
            <ol style={{ paddingLeft: '20px' }}>
              {lesson.checks.map((check) => (
                <li key={check.id} style={{ margin: '16px 0' }}>
                  <p style={{ fontWeight: 600, margin: '0 0 8px' }}>{renderWithMath(check.question)}</p>
                  {Array.isArray(check.options) && check.options.length > 0 && (
                    <ul style={{ listStyle: 'none', paddingLeft: 0 }}>
                      {check.options.map((option, index) => (
                        <li key={`${check.id}-${index}`} style={{ margin: '6px 0' }}>
                          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                            <input
                              type="radio"
                              name={`check-${check.id}`}
                              checked={selectedAnswers[check.id] === index}
                              onChange={() => setSelectedAnswers((prev) => ({ ...prev, [check.id]: index }))}
                            />
                            <span>{renderWithMath(option)}</span>
                          </label>
                        </li>
                      ))}
                    </ul>
                  )}
                  {student && !(Array.isArray(check.options) && check.options.length > 0) && (
                    <input
                      type="text"
                      aria-label="Your answer"
                      value={textAnswers[check.id] ?? ''}
                      onChange={(event) => setTextAnswers((prev) => ({ ...prev, [check.id]: event.target.value }))}
                      maxLength={200}
                    />
                  )}
                  {student && (
                    <button
                      className="quiet-button"
                      onClick={() => submitCheck(check)}
                      disabled={checkingId === check.id}
                    >
                      {checkingId === check.id ? 'Checking...' : 'Check answer'}
                    </button>
                  )}
                  {(() => {
                    const result = checkResults[check.id];
                    if (!result) return null;
                    if ('error' in result) return <p role="alert">{result.error}</p>;
                    return (
                      <p role="status">
                        {result.correct ? 'Correct!' : 'Not quite. Try again.'}
                        {result.correct && result.explanation && <> {renderWithMath(result.explanation)}</>}
                      </p>
                    );
                  })()}
                </li>
              ))}
            </ol>
          </section>
        )}

        {/* ASSESSMENTS */}
        {lesson.assessments.map((assessment) => (
          <section key={assessment.id}>
            <h2>{assessment.title}</h2>
            {assessment.description && <p>{assessment.description}</p>}
          </section>
        ))}

        {/* STUDENT PROGRESS ACTIONS */}
        {student && (
          <section className="progress-actions">
            <h2>Your progress</h2>
            <button className="quiet-button" onClick={() => updateProgress('IN_PROGRESS')}>Save as in progress</button>
            <button className="submit-button" onClick={() => updateProgress('COMPLETED')}>Mark lesson complete</button>
            {progressMessage && <p role="status">{progressMessage}</p>}
          </section>
        )}
      </article>
    </main>
  );
}

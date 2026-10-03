'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { renderWithMath } from '../../../../components/math-formula';
import { SkillProgress } from '../../../../components/skill-progress';
import { TutorPanel } from '../../../../components/tutor-panel';

type Answered = {
  selectedIndex: number;
  correct: boolean;
  correctIndex: number;
  explanation: string | null;
};

type PracticeQuestion = {
  id: string;
  position: number;
  question: string;
  options: string[];
  skill: string | null;
  answered: Answered | null;
};

type PracticeSessionView = {
  id: string;
  lesson: { id: string; title: string } | null;
  topic: string;
  total: number;
  correct: number;
  answeredCount: number;
  completedAt: string | null;
  questions: PracticeQuestion[];
};

export default function PracticeSessionPage() {
  const { id } = useParams<{ id: string }>();
  // Remount per session so selection, feedback and progress never leak between sessions.
  return <PracticeSessionScreen key={id} id={id} />;
}

function PracticeSessionScreen({ id }: { id: string }) {
  const router = useRouter();
  const [session, setSession] = useState<PracticeSessionView | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [result, setResult] = useState<Answered | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [restarting, setRestarting] = useState(false);
  const feedbackRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    fetch(`/api/practice/sessions/${encodeURIComponent(id)}`)
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error ?? 'Practice session unavailable.');
        if (active) {
          setSession(payload.data.session as PracticeSessionView);
          setError('');
        }
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : 'Practice session unavailable.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [id, reloadKey]);

  useEffect(() => {
    if (result) feedbackRef.current?.focus();
  }, [result]);

  if (loading) {
    return (
      <main className="practice-page">
        <p role="status">Loading practice...</p>
      </main>
    );
  }

  if (error || !session) {
    return (
      <main className="practice-page">
        <p role="alert">{error || 'Practice session unavailable.'}</p>
        <Link href="/student">Back to your workspace</Link>
      </main>
    );
  }

  const nextQuestion = session.questions.find((question) => !question.answered);
  const finished = !nextQuestion && !result;
  // `result` is the answer just given, which the loaded session does not include yet.
  const answeredNow = session.answeredCount + (result ? 1 : 0);
  const correctNow = session.correct + (result?.correct ? 1 : 0);
  const progressPercent = Math.round((answeredNow / Math.max(session.total, 1)) * 100);

  async function submitAnswer() {
    if (!nextQuestion || selected === null) {
      setMessage('Choose an answer first.');
      return;
    }
    setSubmitting(true);
    setMessage('');
    try {
      const response = await fetch(
        `/api/practice/sessions/${encodeURIComponent(id)}/answers`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ questionId: nextQuestion.id, selectedIndex: selected }),
        },
      );
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? 'Your answer could not be saved.');
      const answer = payload.data.answer;
      setResult({
        selectedIndex: answer.selectedIndex,
        correct: answer.correct,
        correctIndex: answer.correctIndex,
        explanation: answer.explanation,
      });
    } catch (cause: unknown) {
      setMessage(cause instanceof Error ? cause.message : 'Your answer could not be saved.');
    } finally {
      setSubmitting(false);
    }
  }

  function goNext() {
    setResult(null);
    setSelected(null);
    setMessage('');
    setLoading(true);
    setReloadKey((key) => key + 1);
  }

  async function practiceAgain() {
    if (!session?.lesson) return;
    setRestarting(true);
    setMessage('');
    try {
      const response = await fetch('/api/practice/sessions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ source: 'LESSON_BANK', lessonId: session.lesson.id, total: 10 }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? 'Could not start a new practice session.');
      router.push(`/student/practice/${payload.data.session.id}`);
    } catch (cause: unknown) {
      setMessage(cause instanceof Error ? cause.message : 'Could not start a new practice session.');
      setRestarting(false);
    }
  }

  if (finished) {
    const missed = session.questions.filter((question) => question.answered && !question.answered.correct);
    return (
      <main className="practice-page">
        <nav className="app-nav">
          <Link className="brand" href="/">Tuklas<span>V2</span></Link>
          <Link href="/student">Workspace</Link>
        </nav>
        <article className="practice-card">
          <p className="eyebrow">Practice complete</p>
          <h1>{session.lesson?.title ?? session.topic}</h1>
          <p className="score-banner" role="status">
            {session.correct} of {session.total} correct
          </p>
          <p>
            {missed.length === 0
              ? 'Every answer was correct. Nice work!'
              : `You missed ${missed.length}. They were saved so you can review them and practice again.`}
          </p>

          <h2>Review</h2>
          <ol className="review-list">
            {session.questions.map((question) => {
              const answered = question.answered;
              if (!answered) return null;
              return (
                <li key={question.id} className={`review-item ${answered.correct ? 'got-it' : 'missed'}`}>
                  <p style={{ margin: '0 0 6px', fontWeight: 700 }}>{renderWithMath(question.question)}</p>
                  <p style={{ margin: 0 }}>
                    <strong>{answered.correct ? 'Correct' : 'Not quite'}.</strong> You answered{' '}
                    {renderWithMath(question.options[answered.selectedIndex])}
                    {!answered.correct && (
                      <>
                        ; the correct answer is {renderWithMath(question.options[answered.correctIndex])}
                      </>
                    )}
                    .
                  </p>
                  {!answered.correct && answered.explanation && (
                    <p style={{ margin: '6px 0 0' }}>{renderWithMath(answered.explanation)}</p>
                  )}
                </li>
              );
            })}
          </ol>

          {session.lesson && <SkillProgress lessonId={session.lesson.id} heading="Your skills after this practice" />}

          <div className="action-row">
            {session.lesson && (
              <button className="submit-button" onClick={practiceAgain} disabled={restarting}>
                {restarting ? 'Starting...' : 'Practice again'}
              </button>
            )}
            <Link className="link-button" href="/student/mistakes">Review my mistakes</Link>
            {session.lesson && (
              <Link className="link-button" href={`/lessons/${session.lesson.id}`}>Back to the lesson</Link>
            )}
          </div>
          {message && <p role="alert">{message}</p>}
        </article>
      </main>
    );
  }

  // The question on screen: the one just answered (showing feedback) or the next unanswered one.
  const current = nextQuestion ?? session.questions[session.questions.length - 1];
  const number = session.questions.findIndex((question) => question.id === current.id) + 1;
  const isLast = number === session.total;

  return (
    <main className="practice-page">
      <nav className="app-nav">
        <Link className="brand" href="/">Tuklas<span>V2</span></Link>
        <Link href="/student">Workspace</Link>
      </nav>
      <article className="practice-card">
        <p className="eyebrow">Practice · {session.lesson?.title ?? session.topic}</p>
        <div className="practice-progress">
          <span>Question {number} of {session.total}</span>
          <span>{correctNow} correct so far</span>
        </div>
        <div
          className="progress-track"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={session.total}
          aria-valuenow={answeredNow}
          aria-label="Practice progress"
        >
          <span style={{ width: `${progressPercent}%` }} />
        </div>

        <fieldset className="option-list" disabled={Boolean(result) || submitting}>
          <legend className="practice-question">{renderWithMath(current.question)}</legend>
          {current.options.map((option, index) => {
            const isSelected = selected === index;
            const showCorrect = result && index === result.correctIndex;
            const showWrong = result && index === result.selectedIndex && !result.correct;
            return (
              <label
                key={`${current.id}-${index}`}
                className={`option-choice${isSelected ? ' selected' : ''}${showCorrect ? ' is-correct' : ''}${showWrong ? ' is-wrong' : ''}`}
              >
                <input
                  type="radio"
                  name={`question-${current.id}`}
                  checked={isSelected}
                  onChange={() => setSelected(index)}
                />
                <span>{renderWithMath(option)}</span>
                {showCorrect && <span className="option-tag">Correct answer</span>}
                {showWrong && <span className="option-tag">Your answer</span>}
              </label>
            );
          })}
        </fieldset>

        {result && (
          <div
            ref={feedbackRef}
            tabIndex={-1}
            role="status"
            className={`feedback-panel ${result.correct ? 'correct' : 'incorrect'}`}
          >
            <strong>{result.correct ? 'Correct!' : 'Not quite.'}</strong>
            {result.explanation && <p style={{ margin: '6px 0 0' }}>{renderWithMath(result.explanation)}</p>}
          </div>
        )}

        {message && <p role="alert">{message}</p>}

        <TutorPanel key={current.id} practiceQuestionId={current.id} heading="Help with this question" />

        <div className="action-row">
          {!result ? (
            <button className="submit-button" onClick={submitAnswer} disabled={submitting || selected === null}>
              {submitting ? 'Checking...' : 'Submit answer'}
            </button>
          ) : (
            <button className="submit-button" onClick={goNext}>
              {isLast ? 'See my results' : 'Next question'}
            </button>
          )}
        </div>
      </article>
    </main>
  );
}

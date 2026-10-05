'use client';

import { useEffect, useState } from 'react';

type Level = 'LEARNING' | 'DEVELOPING' | 'PROFICIENT' | 'MASTERED';

type Insights = {
  windowDays: number;
  summary: { studentCount: number; activeStudents: number; questionsAnswered: number; accuracy: number | null };
  activity: { date: string; students: number; questions: number }[];
  skills: {
    name: string;
    studentsWithEvidence: number;
    studentsWithoutEvidence: number;
    levels: Record<Level, number>;
    answers: number;
    accuracy: number | null;
  }[];
  hardestQuestions: {
    question: string;
    skill: string | null;
    attempts: number;
    students: number;
    correctRate: number;
    correctAnswer: string | null;
    commonWrongAnswer: { text: string; count: number } | null;
  }[];
  mistakeCategories: { category: string; count: number; unresolved: number; students: number }[];
  reportedReplies: { total: number; recent: { reason: string; note: string | null; reply: string; at: string }[] };
  lessons: { id: string; title: string; completed: number; inProgress: number; practised: number; studentCount: number }[];
  thresholds: { minAttempts: number; minStudents: number; hardBelowPercent: number };
};

export const LEVEL_LABEL: Record<Level, string> = { LEARNING: 'Learning', DEVELOPING: 'Developing', PROFICIENT: 'Proficient', MASTERED: 'Mastered' };

export const CATEGORY_LABEL: Record<string, string> = {
  SIGN_ERROR: 'Sign errors',
  WRONG_OPERATION: 'Used the wrong operation',
  IGNORED_SIGNS: 'Ignored the signs',
  CALCULATION_ERROR: 'Calculation slips',
  CONCEPTUAL: 'Concept not yet understood',
  UNCLASSIFIED: 'Not classified',
};

const REPORT_LABEL: Record<string, string> = {
  WRONG_MATH: 'The maths was wrong',
  CONFUSING: 'It was confusing',
  UNSAFE: 'It was not appropriate',
  OTHER: 'Another problem',
};

const shortDate = (value: string) => new Date(`${value}T00:00:00`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });

/** Class analytics for the teacher. Every number is computed from the class's own student records. */
export function ClassInsightsPanel({ classId }: { classId: string }) {
  const [data, setData] = useState<Insights | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    fetch(`/api/classes/${encodeURIComponent(classId)}/insights`)
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error ?? 'The class insights could not be loaded.');
        if (active) setData(payload.data as Insights);
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : 'The class insights could not be loaded.');
      });
    return () => {
      active = false;
    };
  }, [classId]);

  if (error) return <p role="alert">{error}</p>;
  if (!data) return <p role="status">Loading class insights...</p>;

  const maxQuestions = Math.max(1, ...data.activity.map((day) => day.questions));
  const hasAnswers = data.skills.length > 0 || data.activity.some((day) => day.questions > 0);

  return (
    <section aria-labelledby="insights-heading" className="skill-panel">
      <h2 id="insights-heading" style={{ marginTop: 0 }}>Class insights</h2>
      {data.summary.studentCount === 0 ? (
        <p className="empty-state">Insights appear once students join this class.</p>
      ) : !hasAnswers ? (
        <p className="empty-state">No practice answers yet. Insights are built only from what students actually answer.</p>
      ) : (
        <>
          <p style={{ color: '#475569' }}>
            Last {data.windowDays} days: {data.summary.activeStudents} of {data.summary.studentCount} students practised, answering{' '}
            {data.summary.questionsAnswered} questions
            {data.summary.accuracy === null ? '.' : ` with ${data.summary.accuracy}% correct.`}
          </p>

          <h3>Practice activity</h3>
          <ol className="insight-days" aria-label={`Questions answered each day for the last ${data.windowDays} days`}>
            {data.activity.map((day) => (
              <li key={day.date}>
                <span className="insight-day-label">{shortDate(day.date)}</span>
                <span className="insight-bar-track" aria-hidden="true">
                  <span className="insight-bar" style={{ width: `${(day.questions / maxQuestions) * 100}%` }} />
                </span>
                <span className="insight-day-value">
                  {day.questions} {day.questions === 1 ? 'question' : 'questions'}
                  {day.students > 0 ? `, ${day.students} ${day.students === 1 ? 'student' : 'students'}` : ''}
                </span>
              </li>
            ))}
          </ol>

          <h3>Skills: weakest first</h3>
          {data.skills.length === 0 ? (
            <p className="empty-state">No skill evidence yet.</p>
          ) : (
            <div className="table-scroll" role="region" aria-label="Class standing by skill (scrolls sideways on small screens)" tabIndex={0}>
              <table className="roster-table">
                <caption className="sr-only">Class standing by skill</caption>
                <thead>
                  <tr>
                    <th scope="col">Skill</th>
                    <th scope="col">Accuracy</th>
                    <th scope="col">Where students are</th>
                  </tr>
                </thead>
                <tbody>
                  {data.skills.map((skill) => (
                    <tr key={skill.name}>
                      <th scope="row">
                        {skill.name}
                        <span className="cell-sub">{skill.answers} {skill.answers === 1 ? 'answer' : 'answers'}</span>
                      </th>
                      <td>{skill.accuracy === null ? 'No answers' : `${skill.accuracy}%`}</td>
                      <td>
                        {(Object.keys(LEVEL_LABEL) as Level[])
                          .filter((level) => skill.levels[level] > 0)
                          .map((level) => `${LEVEL_LABEL[level]} ${skill.levels[level]}`)
                          .join(' · ') || 'No evidence'}
                        {skill.studentsWithoutEvidence > 0 && <span className="cell-sub">{skill.studentsWithoutEvidence} not started</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <h3>Questions students found hard</h3>
          {data.hardestQuestions.length === 0 ? (
            <p className="empty-state">
              None yet. A question is listed when at least {data.thresholds.minStudents} students tried it {data.thresholds.minAttempts}+ times and
              fewer than {data.thresholds.hardBelowPercent}% were correct.
            </p>
          ) : (
            <ul className="review-list">
              {data.hardestQuestions.map((item) => (
                <li key={item.question} className="review-item">
                  <p style={{ margin: 0 }}>
                    <strong>{item.question}</strong>
                  </p>
                  <p style={{ margin: '4px 0 0', color: '#475569' }}>
                    {item.correctRate}% correct · {item.attempts} attempts by {item.students} students
                    {item.skill ? ` · ${item.skill}` : ''}
                  </p>
                  {item.correctAnswer && <p style={{ margin: '4px 0 0' }}>Correct answer: {item.correctAnswer}</p>}
                  {item.commonWrongAnswer && (
                    <p style={{ margin: '4px 0 0' }}>
                      Most chosen wrong answer: {item.commonWrongAnswer.text} ({item.commonWrongAnswer.count}×)
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}

          <h3>Common mistakes</h3>
          {data.mistakeCategories.length === 0 ? (
            <p className="empty-state">No mistakes recorded.</p>
          ) : (
            <ul className="review-list">
              {data.mistakeCategories.map((item) => (
                <li key={item.category} className="review-item">
                  <strong>{CATEGORY_LABEL[item.category] ?? item.category}</strong>: {item.count} {item.count === 1 ? 'mistake' : 'mistakes'} from{' '}
                  {item.students} {item.students === 1 ? 'student' : 'students'}, {item.unresolved} not yet reviewed
                </li>
              ))}
            </ul>
          )}
          <p style={{ color: '#475569', marginTop: 4 }}>
            Mistake types come from a rule-based check written for integer operations; in other lessons most mistakes show as &quot;Concept not yet
            understood&quot; or &quot;Not classified&quot;.
          </p>

          <h3>Tutor replies students reported</h3>
          {data.reportedReplies.total === 0 ? (
            <p className="empty-state">No tutor replies have been reported.</p>
          ) : (
            <>
              <p>
                {data.reportedReplies.total} {data.reportedReplies.total === 1 ? 'reply was' : 'replies were'} reported by students (names are not shown).
                Please read them.
              </p>
              <ul className="review-list">
                {data.reportedReplies.recent.map((item, index) => (
                  <li key={index} className="review-item">
                    <strong>{REPORT_LABEL[item.reason] ?? item.reason}</strong>
                    {item.note ? `: “${item.note}”` : ''}
                    <span className="cell-sub">Tutor said: {item.reply}</span>
                  </li>
                ))}
              </ul>
            </>
          )}

          <h3>Lessons the class has worked on</h3>
          {data.lessons.length === 0 ? (
            <p className="empty-state">No lesson activity yet.</p>
          ) : (
            <ul className="review-list">
              {data.lessons.map((lesson) => (
                <li key={lesson.id} className="review-item">
                  <strong>{lesson.title}</strong>: {lesson.completed} completed, {lesson.inProgress} in progress, {lesson.practised} practised, of{' '}
                  {lesson.studentCount} {lesson.studentCount === 1 ? 'student' : 'students'}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

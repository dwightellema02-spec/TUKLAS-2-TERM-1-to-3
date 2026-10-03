'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { FormEvent, useEffect, useState } from 'react';

type Student = {
  id: string;
  displayName: string;
  email: string;
  lessonsCompleted: number;
  lessonsInProgress: number;
  practiceSessions: number;
  questionsAnswered: number;
  accuracy: number | null;
  unresolvedMistakes: number;
  skills: { name: string; status: string; attempts: number }[];
  lastActive: string | null;
  needsAttention: string[];
};

type Detail = {
  class: { id: string; name: string; joinCode: string | null };
  students: Student[];
  summary: { studentCount: number; activeStudents: number; needingAttention: number };
  assignments: {
    id: string;
    lesson: { id: string; title: string };
    dueAt: string | null;
    completedCount: number;
    memberCount: number;
  }[];
};

type LessonOption = { id: string; title: string; unit: { title: string } | null };

const LEVEL_LABEL: Record<string, string> = {
  NOT_STARTED: 'Not started',
  LEARNING: 'Learning',
  DEVELOPING: 'Developing',
  PROFICIENT: 'Proficient',
  MASTERED: 'Mastered',
};

const formatDate = (value: string | null) =>
  value ? new Date(value).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : null;

export default function ClassDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [lessons, setLessons] = useState<LessonOption[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [email, setEmail] = useState('');
  const [lessonId, setLessonId] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    Promise.all([fetch(`/api/classes/${encodeURIComponent(id)}`), fetch('/api/lessons/published')])
      .then(async ([classResponse, lessonResponse]) => {
        const payload = await classResponse.json();
        if (!classResponse.ok) throw new Error(payload.error ?? 'This class could not be loaded.');
        const lessonPayload = lessonResponse.ok ? await lessonResponse.json() : null;
        if (active) {
          setDetail(payload.data as Detail);
          setLessons((lessonPayload?.data?.lessons as LessonOption[]) ?? []);
          setError('');
        }
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : 'This class could not be loaded.');
      });
    return () => {
      active = false;
    };
  }, [id, reloadKey]);

  async function call(url: string, init: RequestInit, success: string) {
    setError('');
    setNotice('');
    try {
      const response = await fetch(url, { headers: { 'content-type': 'application/json' }, ...init });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? 'That did not work.');
      setNotice(success);
      setReloadKey((key) => key + 1);
      return true;
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'That did not work.');
      return false;
    }
  }

  async function addStudent(event: FormEvent) {
    event.preventDefault();
    if (await call(`/api/classes/${id}/members`, { method: 'POST', body: JSON.stringify({ email }) }, 'Student added.')) {
      setEmail('');
    }
  }

  async function assign(event: FormEvent) {
    event.preventDefault();
    const body = { lessonId, dueAt: dueAt ? new Date(`${dueAt}T23:59:00`).toISOString() : null };
    if (await call(`/api/classes/${id}/assignments`, { method: 'POST', body: JSON.stringify(body) }, 'Lesson assigned.')) {
      setLessonId('');
      setDueAt('');
    }
  }

  if (!detail) {
    return (
      <main className="practice-page">
        {error ? <p role="alert">{error}</p> : <p role="status">Loading...</p>}
        <Link href="/teacher/classes">Back to my classes</Link>
      </main>
    );
  }

  return (
    <main className="practice-page" style={{ padding: '24px max(20px, calc((100vw - 1000px) / 2))' }}>
      <nav className="app-nav">
        <Link className="brand" href="/">Tuklas<span>V2</span></Link>
        <Link href="/teacher/classes">My classes</Link>
      </nav>

      <article className="practice-card">
        <p className="eyebrow">Class</p>
        <h1>{detail.class.name}</h1>
        {notice && <p role="status">{notice}</p>}
        {error && <p role="alert">{error}</p>}

        <section aria-labelledby="code-heading" className="skill-panel" style={{ marginTop: 8 }}>
          <h2 id="code-heading" style={{ marginTop: 0 }}>Join code</h2>
          {detail.class.joinCode ? (
            <p>
              Students enter this code on their workspace: <code className="join-code">{detail.class.joinCode}</code>
            </p>
          ) : (
            <p>Joining is closed. Create a new code to let students join.</p>
          )}
          <div className="action-row" style={{ marginTop: 0 }}>
            <button
              className="quiet-button"
              onClick={() => call(`/api/classes/${id}/join-code`, { method: 'POST' }, 'New join code created. The old one no longer works.')}
            >
              {detail.class.joinCode ? 'Create a new code' : 'Open joining with a new code'}
            </button>
            {detail.class.joinCode && (
              <button
                className="quiet-button"
                onClick={() => call(`/api/classes/${id}/join-code`, { method: 'DELETE' }, 'Joining is closed.')}
              >
                Close joining
              </button>
            )}
          </div>
        </section>

        <section aria-labelledby="roster-heading" className="skill-panel">
          <h2 id="roster-heading" style={{ marginTop: 0 }}>Students</h2>
          <p style={{ color: '#53635a' }}>
            {detail.summary.studentCount} {detail.summary.studentCount === 1 ? 'student' : 'students'} ·{' '}
            {detail.summary.activeStudents} with activity · {detail.summary.needingAttention} needing attention
          </p>

          <form onSubmit={addStudent} className="inline-form" aria-label="Add a student by email">
            <label htmlFor="student-email">Add a student by email</label>
            <input
              id="student-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="student@school.example"
              required
            />
            <button className="quiet-button" type="submit">Add student</button>
          </form>

          {detail.students.length === 0 ? (
            <p className="empty-state">No students yet. Share the join code or add a student by email.</p>
          ) : (
            <div className="table-scroll">
              <table className="roster-table">
                <caption className="sr-only">Students in {detail.class.name}</caption>
                <thead>
                  <tr>
                    <th scope="col">Student</th>
                    <th scope="col">Lessons done</th>
                    <th scope="col">Questions</th>
                    <th scope="col">Accuracy</th>
                    <th scope="col">Mistakes to review</th>
                    <th scope="col">Last active</th>
                    <th scope="col"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {detail.students.map((student) => (
                    <tr key={student.id}>
                      <th scope="row">
                        {student.displayName}
                        <span className="cell-sub">{student.email}</span>
                        {student.skills.length > 0 && (
                          <span className="cell-sub">
                            {student.skills.map((skill) => `${skill.name}: ${LEVEL_LABEL[skill.status]}`).join(' · ')}
                          </span>
                        )}
                        {student.needsAttention.map((reason) => (
                          <span key={reason} className="attention-note">Needs attention: {reason}</span>
                        ))}
                      </th>
                      <td>{student.lessonsCompleted}</td>
                      <td>{student.questionsAnswered}</td>
                      <td>{student.accuracy === null ? 'No answers yet' : `${student.accuracy}%`}</td>
                      <td>{student.unresolvedMistakes}</td>
                      <td>{formatDate(student.lastActive) ?? 'No activity'}</td>
                      <td>
                        <button
                          className="quiet-button"
                          onClick={() =>
                            call(`/api/classes/${id}/members/${student.id}`, { method: 'DELETE' }, `${student.displayName} was removed.`)
                          }
                          aria-label={`Remove ${student.displayName} from the class`}
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section aria-labelledby="assign-heading" className="skill-panel">
          <h2 id="assign-heading" style={{ marginTop: 0 }}>Assignments</h2>
          <form onSubmit={assign} className="inline-form" aria-label="Assign a lesson">
            <label htmlFor="assign-lesson">Lesson</label>
            <select id="assign-lesson" value={lessonId} onChange={(event) => setLessonId(event.target.value)} required>
              <option value="">Choose a lesson</option>
              {lessons.map((lesson) => (
                <option key={lesson.id} value={lesson.id}>
                  {lesson.title}{lesson.unit ? ` (${lesson.unit.title})` : ''}
                </option>
              ))}
            </select>
            <label htmlFor="assign-due">Due date (optional)</label>
            <input id="assign-due" type="date" value={dueAt} onChange={(event) => setDueAt(event.target.value)} />
            <button className="submit-button" type="submit">Assign to class</button>
          </form>

          {detail.assignments.length === 0 ? (
            <p className="empty-state">Nothing assigned yet.</p>
          ) : (
            <ul className="review-list" style={{ marginTop: 12 }}>
              {detail.assignments.map((assignment) => (
                <li key={assignment.id} className="review-item">
                  <p style={{ margin: 0 }}>
                    <strong>{assignment.lesson.title}</strong>
                    {assignment.dueAt && <> · due {formatDate(assignment.dueAt)}</>}
                  </p>
                  <p style={{ margin: '4px 0 0', color: '#53635a' }}>
                    {assignment.completedCount} of {assignment.memberCount} completed
                  </p>
                  <div className="action-row" style={{ marginTop: 8 }}>
                    <button
                      className="quiet-button"
                      onClick={() => call(`/api/classes/${id}/assignments/${assignment.id}`, { method: 'DELETE' }, 'Assignment removed.')}
                      aria-label={`Remove the assignment ${assignment.lesson.title}`}
                    >
                      Remove assignment
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </article>
    </main>
  );
}

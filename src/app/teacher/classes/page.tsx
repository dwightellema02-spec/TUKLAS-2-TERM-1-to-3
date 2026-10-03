'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';

type ClassRow = {
  id: string;
  name: string;
  joinCode: string | null;
  _count: { members: number; assignments: number };
};

export default function TeacherClassesPage() {
  const [classes, setClasses] = useState<ClassRow[] | null>(null);
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    fetch('/api/classes')
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error ?? 'Your classes could not be loaded.');
        if (active) setClasses(payload.data.classes as ClassRow[]);
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : 'Your classes could not be loaded.');
      });
    return () => {
      active = false;
    };
  }, [reloadKey]);

  async function create(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/classes', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? 'The class could not be created.');
      setName('');
      setReloadKey((key) => key + 1);
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'The class could not be created.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="practice-page">
      <nav className="app-nav">
        <Link className="brand" href="/">Tuklas<span>V2</span></Link>
        <Link href="/teacher">Teacher studio</Link>
      </nav>
      <article className="practice-card">
        <p className="eyebrow">Teacher</p>
        <h1>My classes</h1>

        <form onSubmit={create} className="inline-form" aria-label="Create a class">
          <label htmlFor="class-name">Class name</label>
          <input
            id="class-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g. Grade 7 – Sampaguita"
            maxLength={80}
            required
          />
          <button className="submit-button" type="submit" disabled={busy}>
            {busy ? 'Creating...' : 'Create class'}
          </button>
        </form>

        {error && <p role="alert">{error}</p>}
        {!classes && !error && <p role="status">Loading...</p>}
        {classes && classes.length === 0 && (
          <p className="empty-state">No classes yet. Create one, then give students the join code.</p>
        )}

        <ul className="review-list" style={{ marginTop: 16 }}>
          {classes?.map((cls) => (
            <li key={cls.id} className="review-item">
              <p style={{ margin: 0 }}>
                <Link href={`/teacher/classes/${cls.id}`}><strong>{cls.name}</strong></Link>
              </p>
              <p style={{ margin: '4px 0 0', color: '#53635a' }}>
                {cls._count.members} {cls._count.members === 1 ? 'student' : 'students'} ·{' '}
                {cls._count.assignments} {cls._count.assignments === 1 ? 'assignment' : 'assignments'} ·{' '}
                {cls.joinCode ? <>join code <code className="join-code">{cls.joinCode}</code></> : 'joining closed'}
              </p>
            </li>
          ))}
        </ul>
      </article>
    </main>
  );
}

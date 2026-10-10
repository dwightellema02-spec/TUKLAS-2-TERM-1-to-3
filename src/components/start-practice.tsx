'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

/** Creates a practice session from a lesson's own question bank (optionally one skill) and opens it. */
export async function createPracticeSession(input: { lessonId: string; skillId?: string; total: number }): Promise<string> {
  const response = await fetch('/api/practice/sessions', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ source: 'LESSON_BANK', ...input }),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error ?? 'Could not start practice.');
  return payload.data.session.id as string;
}

/** A button that starts targeted practice, for example on the student's weakest skill. */
export function StartPracticeButton({
  lessonId,
  skillId,
  total = 6,
  label = 'Practice now',
  className = 'ui-btn amber',
}: {
  lessonId: string;
  skillId?: string;
  total?: number;
  label?: string;
  className?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function start() {
    setBusy(true);
    setError('');
    try {
      router.push(`/student/practice/${await createPracticeSession({ lessonId, skillId, total })}`);
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'Could not start practice.');
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" className={className} onClick={start} disabled={busy}>
        {busy ? 'Starting…' : label}
      </button>
      {error && <span role="alert" className="ui-warn" style={{ marginLeft: 8, fontSize: '0.85rem' }}>{error}</span>}
    </>
  );
}

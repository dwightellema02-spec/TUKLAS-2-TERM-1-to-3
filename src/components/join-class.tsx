'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';

/** Lets a student join a class with the code their teacher gave them. */
export function JoinClass() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    setError('');
    try {
      const response = await fetch('/api/classes/join', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? 'Could not join the class.');
      const { class: cls, alreadyMember } = payload.data;
      setMessage(alreadyMember ? `You are already in ${cls.name}.` : `You joined ${cls.name} (${cls.teacher}).`);
      setCode('');
      router.refresh();
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'Could not join the class.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="inline-form" aria-label="Join a class">
      <label htmlFor="join-code">Join a class with a code</label>
      <input
        id="join-code"
        value={code}
        onChange={(event) => setCode(event.target.value)}
        placeholder="ABCD-2345"
        autoComplete="off"
        autoCapitalize="characters"
        maxLength={20}
        required
      />
      <button className="submit-button" type="submit" disabled={busy}>
        {busy ? 'Joining...' : 'Join class'}
      </button>
      {message && <p role="status" style={{ flexBasis: '100%', margin: 0 }}>{message}</p>}
      {error && <p role="alert" style={{ flexBasis: '100%', margin: 0 }}>{error}</p>}
    </form>
  );
}

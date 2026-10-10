'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';

/** Lets a signed-in user change their display name (the one change /api/profile allows from this screen). */
export function ProfileForm({ initialName }: { initialName: string }) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [failed, setFailed] = useState(false);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    setFailed(false);
    try {
      const response = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ displayName: name }),
      });
      const payload = await response.json();
      if (!response.ok) {
        setFailed(true);
        setMessage(payload.error ?? 'Unable to update your profile.');
      } else {
        setMessage('Profile updated.');
        router.refresh();
      }
    } catch {
      setFailed(true);
      setMessage('The service is unavailable. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="au-form" style={{ maxWidth: 420 }}>
      <label>
        Display name
        <input value={name} onChange={(event) => setName(event.target.value)} minLength={2} maxLength={80} required />
      </label>
      {message && (
        <p role={failed ? 'alert' : 'status'} className={failed ? 'au-error' : 'ui-note'} style={{ margin: 0 }}>
          {message}
        </p>
      )}
      <button className="ui-btn" type="submit" disabled={busy}>
        {busy ? 'Saving…' : 'Save profile'}
      </button>
    </form>
  );
}

'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';

/** Student privacy controls: see what Tuklas keeps, download it, or delete the account and learning records. */
export default function StudentPrivacyPage() {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [deleted, setDeleted] = useState(false);

  async function deleteAccount(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/account', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password, confirm }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? 'The account could not be deleted.');
      setDeleted(true);
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'The account could not be deleted.');
    } finally {
      setBusy(false);
    }
  }

  if (deleted) {
    return (
      <main className="practice-page">
        <article className="practice-card">
          <h1>Your account was deleted</h1>
          <p role="status">Your account, your practice, your mistakes and your tutor conversations were removed. Thank you for learning with Tuklas.</p>
          <Link href="/">Go to the home page</Link>
        </article>
      </main>
    );
  }

  return (
    <main className="practice-page">
      <nav className="app-nav">
        <Link className="brand" href="/">Tuklas<span>V2</span></Link>
        <Link href="/student">Workspace</Link>
      </nav>
      <article className="practice-card">
        <p className="eyebrow">Your privacy</p>
        <h1>My data</h1>

        <section aria-labelledby="keeps-heading" className="skill-panel">
          <h2 id="keeps-heading" style={{ marginTop: 0 }}>What Tuklas keeps</h2>
          <ul>
            <li>Your name, email and class.</li>
            <li>Your lesson progress, practice answers, mistakes and skill levels.</li>
            <li>What you type to Ask Tuklas, and its replies. Your teacher can see how your class is doing, but the questions you report are shown without your name.</li>
            <li>When you use the AI, your message and some lesson text are sent to the AI service so it can reply. Your name and email are not sent.</li>
            <li>If you use the microphone, your browser&apos;s speech service may process the audio. Tuklas keeps only the words.</li>
          </ul>
        </section>

        <section aria-labelledby="download-heading" className="skill-panel">
          <h2 id="download-heading" style={{ marginTop: 0 }}>Download my data</h2>
          <p>You get one file with everything above.</p>
          <a className="link-button" href="/api/account/export" download="tuklas-my-data.json">
            Download my data
          </a>
        </section>

        <section aria-labelledby="delete-heading" className="skill-panel">
          <h2 id="delete-heading" style={{ marginTop: 0 }}>Delete my account</h2>
          <p>This removes your account and all your learning records. It cannot be undone. Teacher and administrator accounts are closed by an administrator.</p>
          <form onSubmit={deleteAccount} aria-label="Delete my account" className="inline-form">
            <label htmlFor="delete-password">Your password</label>
            <input id="delete-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required />
            <label htmlFor="delete-confirm">Type DELETE to confirm</label>
            <input id="delete-confirm" value={confirm} onChange={(event) => setConfirm(event.target.value)} autoComplete="off" required />
            {error && <p role="alert">{error}</p>}
            <button type="submit" className="submit-button" disabled={busy || confirm !== 'DELETE' || password.length === 0}>
              {busy ? 'Deleting...' : 'Delete my account'}
            </button>
          </form>
        </section>
      </article>
    </main>
  );
}

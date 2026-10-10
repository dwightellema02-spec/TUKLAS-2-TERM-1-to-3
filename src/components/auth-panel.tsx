'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export type AuthMode = 'login' | 'register';

const HOME: Record<string, string> = { ADMIN: '/admin', TEACHER: '/teacher', STUDENT: '/student' };

/** Sign in and create account in one card. The two tabs are links, so each mode has its own address (/login and /login?mode=register). */
export function AuthPanel({ mode, initialRole }: { mode: AuthMode; initialRole: 'STUDENT' | 'TEACHER' }) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'STUDENT' | 'TEACHER'>(initialRole);
  const [inviteCode, setInviteCode] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch(`/api/auth/${mode}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(
          mode === 'login'
            ? { email, password }
            : { email, password, displayName, role, ...(role === 'TEACHER' ? { inviteCode } : {}) },
        ),
      });
      const payload = await response.json();
      if (!response.ok) {
        setMessage(payload.error ?? (mode === 'login' ? 'Invalid email or password.' : 'Unable to create the account.'));
        setBusy(false);
        return;
      }
      router.push(HOME[payload.data?.user?.role] ?? '/student');
      router.refresh();
    } catch {
      setMessage('The service is unavailable. Please try again in a moment.');
      setBusy(false);
    }
  }

  const register = mode === 'register';

  return (
    <div className="au-card">
      <div className="au-tabs" role="group" aria-label="Sign in or create an account">
        <Link href="/login" className={register ? '' : 'active'} aria-current={register ? undefined : 'page'}>Sign in</Link>
        <Link href="/login?mode=register" className={register ? 'active' : ''} aria-current={register ? 'page' : undefined}>Create account</Link>
      </div>
      <h2 className="au-title">{register ? 'Start your learning loop' : 'Welcome back'}</h2>
      <p className="au-note">{register ? 'Create a student or teacher account.' : 'Use your Tuklas account to continue.'}</p>

      <form onSubmit={submit} noValidate={!register} className="au-form">
        {register && (
          <label>
            Display name
            <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} required minLength={2} maxLength={80} autoComplete="name" />
          </label>
        )}
        {register ? (
          <label>
            Email
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
          </label>
        ) : (
          <label htmlFor="login-email">
            Email Address
            <input id="login-email" name="email" type="email" autoComplete="email" required disabled={busy} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
          </label>
        )}
        {register ? (
          <label>
            Password
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={12} autoComplete="new-password" />
            <span className="au-hint">At least 12 characters.</span>
          </label>
        ) : (
          <label htmlFor="login-password">
            Password
            <input id="login-password" name="password" type="password" autoComplete="current-password" required disabled={busy} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter your password" />
          </label>
        )}
        {register && (
          <label>
            I am joining as
            <select value={role} onChange={(e) => setRole(e.target.value as 'STUDENT' | 'TEACHER')}>
              <option value="STUDENT">Student</option>
              <option value="TEACHER">Teacher</option>
            </select>
          </label>
        )}
        {register && role === 'TEACHER' && (
          <label>
            Teacher invitation code
            <input value={inviteCode} onChange={(e) => setInviteCode(e.target.value)} autoComplete="off" required />
            <span className="au-hint">Your school administrator gives you this code.</span>
          </label>
        )}
        {message && (
          <p className="au-error" role="alert">
            {message}
          </p>
        )}
        <button className="au-submit" type="submit" disabled={busy || (!register && (!email.trim() || !password))}>
          {busy ? 'Working…' : register ? 'Create account' : 'Sign In'}
        </button>
      </form>
      <p className="au-foot">
        <Link href="/">← Back to Tuklas overview</Link>
      </p>
    </div>
  );
}

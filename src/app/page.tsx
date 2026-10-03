'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import CurriculumBrowser from './curriculum-browser';

type User = {
  displayName: string;
  email: string;
  role: 'STUDENT' | 'TEACHER' | 'ADMIN';
};

type AuthMode = 'login' | 'register';

export default function Home() {
  const [mode, setMode] = useState<AuthMode>('login');
  const [user, setUser] = useState<User | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [profileName, setProfileName] = useState('');
  const [profileMessage, setProfileMessage] = useState('');
  const [profileBusy, setProfileBusy] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [logoutBusy, setLogoutBusy] = useState(false);
  const [role, setRole] = useState<'STUDENT' | 'TEACHER'>('STUDENT');
  const [inviteCode, setInviteCode] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch('/api/auth/session')
      .then(async (response) => {
        if (!response.ok) return;
        const payload = await response.json();
        if (payload.data?.user) {
          setUser(payload.data.user);
          setProfileName(payload.data.user.displayName);
        }
      })
      .catch(() =>
        setMessage('Unable to check your session. Please try again.'),
      )
      .finally(() => setAuthLoading(false));
  }, []);

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
        setMessage(payload.error ?? 'Unable to authenticate.');
        return;
      }
      setUser(payload.data.user);
      setProfileName(payload.data.user.displayName);
      setPassword('');
      setMessage('');
    } catch {
      setMessage('The service is unavailable. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    setLogoutBusy(true);
    try {
      const response = await fetch('/api/auth/logout', { method: 'POST' });
      if (!response.ok) throw new Error('Logout failed.');
      setUser(null);
      setProfileName('');
      setProfileMessage('');
      setMessage('You have been signed out.');
    } catch {
      setMessage('Unable to sign out right now. Please try again.');
    } finally {
      setLogoutBusy(false);
    }
  }

  if (authLoading) {
    return (
      <main className="auth-page" aria-live="polite">
        <p role="status">Checking your Tuklas session...</p>
      </main>
    );
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setProfileBusy(true);
    setProfileMessage('');

    try {
      const response = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ displayName: profileName }),
      });
      const payload = await response.json();
      if (!response.ok) {
        setProfileMessage(payload.error ?? 'Unable to update your profile.');
        return;
      }
      setUser(payload.data.user);
      setProfileName(payload.data.user.displayName);
      setProfileMessage('Profile updated.');
    } catch {
      setProfileMessage('The service is unavailable. Please try again.');
    } finally {
      setProfileBusy(false);
    }
  }

  if (user) {
    return (
      <main className="app-home">
        <nav className="app-nav">
          <Link className="brand" href="/">
            Tuklas<span>V2</span>
          </Link>
          <button
            className="quiet-button"
            type="button"
            onClick={logout}
            disabled={logoutBusy}
          >
            {logoutBusy ? 'Signing out...' : 'Sign out'}
          </button>
        </nav>
        <section className="welcome-panel">
          <p className="eyebrow">{user.role.toLowerCase()} workspace</p>
          <h1>Welcome back, {user.displayName}.</h1>
          <p className="description">
            Your secure Tuklas session is active. Here is the lesson content
            available to your account.
          </p>
          <section className="profile-panel" aria-labelledby="profile-heading">
            <h2 id="profile-heading">Your profile</h2>
            <p>
              {user.email} ·{' '}
              {user.role === 'TEACHER'
                ? 'Teacher'
                : user.role === 'ADMIN'
                  ? 'Administrator'
                  : 'Student'}
            </p>
            <form onSubmit={saveProfile}>
              <label>
                Display name
                <input
                  value={profileName}
                  onChange={(event) => setProfileName(event.target.value)}
                  minLength={2}
                  maxLength={80}
                  required
                />
              </label>
              {profileMessage && <p role="status">{profileMessage}</p>}
              <button
                className="quiet-button"
                type="submit"
                disabled={profileBusy}
              >
                {profileBusy ? 'Saving...' : 'Save profile'}
              </button>
            </form>
          </section>
          <CurriculumBrowser />
          <div className="workspace-links">
            <a href="/prototype/index.html">
              Open the prototype reference (demo data)
            </a>
            <a href="/api/health">Check service health</a>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="auth-page">
      <section className="auth-intro">
        <Link className="brand" href="/">
          Tuklas<span>V2</span>
        </Link>
        <p className="eyebrow">A calmer way to learn</p>
        <h1>Understand the step before you move on.</h1>
        <p className="description">
          Lessons, practice, feedback, and progress in one learning loop.
        </p>
      </section>
      <section className="auth-card" aria-labelledby="auth-heading">
        <div
          className="mode-switch"
          role="tablist"
          aria-label="Authentication mode"
        >
          <button
            className={mode === 'login' ? 'active' : ''}
            type="button"
            onClick={() => setMode('login')}
          >
            Sign in
          </button>
          <button
            className={mode === 'register' ? 'active' : ''}
            type="button"
            onClick={() => setMode('register')}
          >
            Create account
          </button>
        </div>
        <h2 id="auth-heading">
          {mode === 'login' ? 'Welcome back' : 'Start your learning loop'}
        </h2>
        <p className="form-note">
          {mode === 'login'
            ? 'Use your Tuklas account to continue.'
            : 'Create a student or teacher account.'}
        </p>
        <form onSubmit={submit}>
          {mode === 'register' && (
            <label>
              Display name
              <input
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                required
                minLength={2}
                maxLength={80}
              />
            </label>
          )}
          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              autoComplete="email"
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              minLength={mode === 'register' ? 12 : 1}
              autoComplete={
                mode === 'login' ? 'current-password' : 'new-password'
              }
            />
          </label>
          {mode === 'register' && (
            <label>
              I am joining as
              <select
                value={role}
                onChange={(event) =>
                  setRole(event.target.value as 'STUDENT' | 'TEACHER')
                }
              >
                <option value="STUDENT">Student</option>
                <option value="TEACHER">Teacher</option>
              </select>
            </label>
          )}
          {mode === 'register' && role === 'TEACHER' && (
            <label>
              Teacher invitation code
              <input
                value={inviteCode}
                onChange={(event) => setInviteCode(event.target.value)}
                autoComplete="off"
                required
              />
              <span className="form-note">Your school administrator gives you this code.</span>
            </label>
          )}
          {message && (
            <p className="form-message" role="alert">
              {message}
            </p>
          )}
          <button className="submit-button" type="submit" disabled={busy}>
            {busy
              ? 'Working...'
              : mode === 'login'
                ? 'Sign in'
                : 'Create account'}
          </button>
        </form>
      </section>
    </main>
  );
}

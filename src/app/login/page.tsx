'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage('');
    setIsSubmitting(true);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const payload = await response.json();

      if (!response.ok) {
        setErrorMessage(payload.error ?? 'Invalid email or password.');
        setIsSubmitting(false);
        return;
      }

      // Role-aware redirection
      const userRole = payload.data?.user?.role;
      if (userRole === 'TEACHER') {
        router.push('/teacher');
      } else if (userRole === 'ADMIN') {
        router.push('/admin');
      } else {
        router.push('/student');
      }
    } catch {
      setErrorMessage('The authentication service is temporarily unavailable. Please try again.');
      setIsSubmitting(false);
    }
  }

  return (
    <main className="auth-page">
      <div className="auth-intro">
        <Link href="/" className="brand">
          Tuklas <span>2.0</span>
        </Link>
        <span className="eyebrow">Production Learning Ecosystem</span>
        <h1>Account Login</h1>
        <p className="description">
          Sign in to access your student workspace, teacher studio, or administrative dashboard.
        </p>
      </div>

      <div className="auth-card">
        <form onSubmit={handleSubmit} noValidate>
          {errorMessage && (
            <div
              role="alert"
              style={{
                padding: '12px',
                marginBottom: '20px',
                background: '#fde8e8',
                border: '1px solid #f8b4b4',
                borderRadius: '6px',
                color: '#9b1c1c',
                fontSize: '0.9rem',
              }}
            >
              {errorMessage}
            </div>
          )}

          <div style={{ marginBottom: '18px' }}>
            <label
              htmlFor="login-email"
              style={{ display: 'block', marginBottom: '6px', fontWeight: 600, fontSize: '0.9rem' }}
            >
              Email Address
            </label>
            <input
              id="login-email"
              name="email"
              type="email"
              autoComplete="email"
              required
              disabled={isSubmitting}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="e.g. student-juan@tuklas.local"
              style={{
                width: '100%',
                padding: '10px 12px',
                border: '1px solid #c2cdc2',
                borderRadius: '6px',
                fontSize: '1rem',
              }}
            />
          </div>

          <div style={{ marginBottom: '24px' }}>
            <label
              htmlFor="login-password"
              style={{ display: 'block', marginBottom: '6px', fontWeight: 600, fontSize: '0.9rem' }}
            >
              Password
            </label>
            <input
              id="login-password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              disabled={isSubmitting}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              style={{
                width: '100%',
                padding: '10px 12px',
                border: '1px solid #c2cdc2',
                borderRadius: '6px',
                fontSize: '1rem',
              }}
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting || !email.trim() || !password}
            style={{
              width: '100%',
              padding: '12px',
              backgroundColor: isSubmitting ? '#7da89c' : '#0e3b34',
              color: '#ffffff',
              fontWeight: 700,
              fontSize: '1rem',
              border: 'none',
              borderRadius: '6px',
              cursor: isSubmitting ? 'not-allowed' : 'pointer',
              transition: 'background-color 0.2s',
            }}
          >
            {isSubmitting ? 'Signing in...' : 'Sign In'}
          </button>

          <p style={{ marginTop: '20px', fontSize: '0.85rem', color: '#556', textAlign: 'center' }}>
            Return to <Link href="/">Tuklas Overview</Link>
          </p>
        </form>
      </div>
    </main>
  );
}

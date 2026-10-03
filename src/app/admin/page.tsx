'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';

type UserRow = {
  id: string;
  email: string;
  displayName: string;
  role: 'STUDENT' | 'TEACHER' | 'ADMIN';
  isActive: boolean;
  createdAt: string;
  _count: { ownedClasses: number; classMemberships: number };
};

type AuditEntry = {
  id: string;
  action: string;
  actor: string;
  targetUserId: string | null;
  details: Record<string, string> | null;
  createdAt: string;
};

const ACTION_LABEL: Record<string, string> = {
  USER_CREATED: 'Created account',
  USER_DEACTIVATED: 'Deactivated account',
  USER_REACTIVATED: 'Reactivated account',
  USER_ROLE_CHANGED: 'Changed role',
  PASSWORD_RESET: 'Reset password',
};

export default function AdminConsolePage() {
  const [users, setUsers] = useState<UserRow[] | null>(null);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [roleFilter, setRoleFilter] = useState('');
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [form, setForm] = useState({ email: '', displayName: '', role: 'TEACHER', password: '' });
  const [resetFor, setResetFor] = useState<{ id: string; name: string } | null>(null);
  const [newPassword, setNewPassword] = useState('');

  useEffect(() => {
    let active = true;
    const params = new URLSearchParams();
    if (roleFilter) params.set('role', roleFilter);
    if (query.trim()) params.set('q', query.trim());
    Promise.all([fetch(`/api/admin/users?${params}`), fetch('/api/admin/audit')])
      .then(async ([usersResponse, auditResponse]) => {
        const usersPayload = await usersResponse.json();
        if (!usersResponse.ok) throw new Error(usersPayload.error ?? 'Users could not be loaded.');
        const auditPayload = auditResponse.ok ? await auditResponse.json() : null;
        if (active) {
          setUsers(usersPayload.data.users as UserRow[]);
          setAudit((auditPayload?.data?.entries as AuditEntry[]) ?? []);
        }
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : 'Users could not be loaded.');
      });
    return () => {
      active = false;
    };
  }, [roleFilter, query, reloadKey]);

  async function send(url: string, method: string, body: unknown, success: string) {
    setError('');
    setNotice('');
    try {
      const response = await fetch(url, {
        method,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
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

  async function createAccount(event: FormEvent) {
    event.preventDefault();
    if (await send('/api/admin/users', 'POST', form, `Account created for ${form.email}. Give them the temporary password in person.`)) {
      setForm({ email: '', displayName: '', role: 'TEACHER', password: '' });
    }
  }

  async function submitReset(event: FormEvent) {
    event.preventDefault();
    if (!resetFor) return;
    if (await send(`/api/admin/users/${resetFor.id}/password`, 'POST', { password: newPassword }, `Password reset for ${resetFor.name}. They were signed out everywhere.`)) {
      setResetFor(null);
      setNewPassword('');
    }
  }

  const nameOf = (id: string | null) => users?.find((user) => user.id === id)?.displayName ?? 'a user';

  return (
    <main className="practice-page" style={{ padding: '24px max(20px, calc((100vw - 1100px) / 2))' }}>
      <nav className="app-nav">
        <Link className="brand" href="/">Tuklas<span>V2</span></Link>
        <Link href="/curriculum">Curriculum</Link>
      </nav>

      <article className="practice-card">
        <p className="eyebrow">Administration</p>
        <h1>Admin console</h1>
        {notice && <p role="status">{notice}</p>}
        {error && <p role="alert">{error}</p>}

        <section aria-labelledby="create-heading" className="skill-panel" style={{ marginTop: 8 }}>
          <h2 id="create-heading" style={{ marginTop: 0 }}>Create an account</h2>
          <form onSubmit={createAccount} className="inline-form" aria-label="Create an account">
            <label htmlFor="new-name">Name</label>
            <input id="new-name" value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} required minLength={2} />
            <label htmlFor="new-email">Email</label>
            <input id="new-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
            <label htmlFor="new-role">Role</label>
            <select id="new-role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              <option value="TEACHER">Teacher</option>
              <option value="STUDENT">Student</option>
            </select>
            <label htmlFor="new-password">Temporary password</label>
            <input id="new-password" type="text" autoComplete="off" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
            <button className="submit-button" type="submit">Create account</button>
          </form>
          <p style={{ color: '#53635a', margin: 0 }}>
            At least 8 characters with an uppercase letter, a lowercase letter and a number.
          </p>
        </section>

        <section aria-labelledby="users-heading" className="skill-panel">
          <h2 id="users-heading" style={{ marginTop: 0 }}>Users</h2>
          <div className="inline-form">
            <label htmlFor="user-search">Search</label>
            <input id="user-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="name or email" />
            <label htmlFor="user-role">Role</label>
            <select id="user-role" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
              <option value="">All</option>
              <option value="TEACHER">Teachers</option>
              <option value="STUDENT">Students</option>
              <option value="ADMIN">Administrators</option>
            </select>
          </div>

          {!users ? (
            <p role="status">Loading...</p>
          ) : users.length === 0 ? (
            <p className="empty-state">No users match.</p>
          ) : (
            <div className="table-scroll">
              <table className="roster-table">
                <caption className="sr-only">User accounts</caption>
                <thead>
                  <tr>
                    <th scope="col">User</th>
                    <th scope="col">Role</th>
                    <th scope="col">Status</th>
                    <th scope="col">Classes</th>
                    <th scope="col"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr key={user.id}>
                      <th scope="row">
                        {user.displayName}
                        <span className="cell-sub">{user.email}</span>
                      </th>
                      <td>{user.role === 'ADMIN' ? 'Administrator' : user.role === 'TEACHER' ? 'Teacher' : 'Student'}</td>
                      <td>{user.isActive ? 'Active' : 'Deactivated'}</td>
                      <td>{user.role === 'TEACHER' ? `${user._count.ownedClasses} owned` : user.role === 'STUDENT' ? `${user._count.classMemberships} joined` : '—'}</td>
                      <td>
                        {user.role === 'ADMIN' ? (
                          <span className="cell-sub">Not managed here</span>
                        ) : (
                          <div className="action-row" style={{ marginTop: 0 }}>
                            <button
                              className="quiet-button"
                              onClick={() => send(`/api/admin/users/${user.id}`, 'PATCH', { isActive: !user.isActive }, user.isActive ? `${user.displayName} was deactivated and signed out.` : `${user.displayName} was reactivated.`)}
                              aria-label={`${user.isActive ? 'Deactivate' : 'Reactivate'} ${user.displayName}`}
                            >
                              {user.isActive ? 'Deactivate' : 'Reactivate'}
                            </button>
                            <button
                              className="quiet-button"
                              onClick={() => send(`/api/admin/users/${user.id}`, 'PATCH', { role: user.role === 'TEACHER' ? 'STUDENT' : 'TEACHER' }, `${user.displayName} is now a ${user.role === 'TEACHER' ? 'student' : 'teacher'}.`)}
                              aria-label={`Make ${user.displayName} a ${user.role === 'TEACHER' ? 'student' : 'teacher'}`}
                            >
                              Make {user.role === 'TEACHER' ? 'student' : 'teacher'}
                            </button>
                            <button
                              className="quiet-button"
                              onClick={() => setResetFor({ id: user.id, name: user.displayName })}
                              aria-label={`Reset password for ${user.displayName}`}
                            >
                              Reset password
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {resetFor && (
            <form onSubmit={submitReset} className="inline-form" aria-label={`Reset password for ${resetFor.name}`}>
              <label htmlFor="reset-password">New password for {resetFor.name}</label>
              <input id="reset-password" type="text" autoComplete="off" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required />
              <button className="submit-button" type="submit">Set password</button>
              <button className="quiet-button" type="button" onClick={() => { setResetFor(null); setNewPassword(''); }}>Cancel</button>
            </form>
          )}
        </section>

        <section aria-labelledby="audit-heading" className="skill-panel">
          <h2 id="audit-heading" style={{ marginTop: 0 }}>Recent admin actions</h2>
          {audit.length === 0 ? (
            <p className="empty-state">No admin actions recorded yet.</p>
          ) : (
            <ul className="review-list">
              {audit.slice(0, 15).map((entry) => (
                <li key={entry.id} className="review-item">
                  <strong>{ACTION_LABEL[entry.action] ?? entry.action}</strong>
                  {entry.targetUserId && <> · {nameOf(entry.targetUserId)}</>} · by {entry.actor}
                  <span className="cell-sub">{new Date(entry.createdAt).toLocaleString('en-PH')}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </article>
    </main>
  );
}

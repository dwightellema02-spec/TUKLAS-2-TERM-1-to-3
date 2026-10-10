import type { ReactNode } from 'react';
import Link from 'next/link';
import { ShellNav, type NavItem } from './shell-nav';

export type ShellRole = 'STUDENT' | 'TEACHER' | 'ADMIN';

const STUDENT_NAV: NavItem[] = [
  { href: '/student', label: 'Home', icon: 'home', exact: true },
  { href: '/curriculum', label: 'Discover', icon: 'compass' },
  { href: '/student/learn', label: 'Learn', icon: 'play' },
  { href: '/student/practice', label: 'Practice', icon: 'pencil', exact: true },
  { href: '/student/progress', label: 'Progress', icon: 'chart' },
  { href: '/student/mistakes', label: 'Review mistakes', icon: 'refresh' },
  { href: '/student/ask', label: 'Ask Tuklas', icon: 'sparkle', divider: true },
  { href: '/student/privacy', label: 'My data', icon: 'shield' },
];

const TEACHER_NAV: NavItem[] = [
  { href: '/teacher', label: 'Dashboard', icon: 'grid', exact: true },
  { href: '/teacher/classes', label: 'Classes', icon: 'people' },
  { href: '/teacher/lessons/new', label: 'Create lesson', icon: 'plus' },
  { href: '/curriculum', label: 'Curriculum', icon: 'compass' },
];

const ADMIN_NAV: NavItem[] = [
  { href: '/admin', label: 'Admin console', icon: 'shield', exact: true },
  ...TEACHER_NAV,
];

const NAV: Record<ShellRole, NavItem[]> = { STUDENT: STUDENT_NAV, TEACHER: TEACHER_NAV, ADMIN: ADMIN_NAV };
const ROLE_LABEL: Record<ShellRole, string> = { STUDENT: 'Student', TEACHER: 'Teacher', ADMIN: 'Administrator' };

/**
 * The signed-in frame of the app: a dark sidebar (a top bar on phones) around whatever page the route renders.
 * It deliberately adds no <main>: every page already renders its own, and a page may only have one.
 */
export function AppShell({ role, name, children }: { role: ShellRole; name: string; children: ReactNode }) {
  return (
    <div className="app-shell">
      <aside className="shell-side">
        <Link className="shell-brand" href={role === 'STUDENT' ? '/student' : role === 'ADMIN' ? '/admin' : '/teacher'}>
          <span className="shell-brand-dot" aria-hidden="true" />
          Tuklas
        </Link>
        <ShellNav items={NAV[role]} name={name} roleLabel={ROLE_LABEL[role]} />
      </aside>
      <div className="shell-content">{children}</div>
      {role === 'STUDENT' && (
        <Link className="ask-fab" href="/student/ask">
          <span aria-hidden="true">✦</span> Ask Tuklas
        </Link>
      )}
    </div>
  );
}

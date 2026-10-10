import { ReactNode } from 'react';
import { requireServerUser } from '../../lib/auth/server-guard';
import { AppShell } from '../../components/app-shell';

export default async function TeacherLayout({ children }: { children: ReactNode }) {
  // Enforce server-side role check: TEACHER or ADMIN
  const user = await requireServerUser(['TEACHER', 'ADMIN']);

  return (
    <AppShell role={user.role === 'ADMIN' ? 'ADMIN' : 'TEACHER'} name={user.displayName}>
      {children}
    </AppShell>
  );
}

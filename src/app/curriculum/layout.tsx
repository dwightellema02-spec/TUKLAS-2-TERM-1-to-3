import { ReactNode } from 'react';
import { requireServerUser } from '../../lib/auth/server-guard';
import { AppShell } from '../../components/app-shell';

// These pages are shared by every signed-in role; the pages themselves keep their own role checks.
export default async function SharedLayout({ children }: { children: ReactNode }) {
  const user = await requireServerUser(['STUDENT', 'TEACHER', 'ADMIN']);

  return (
    <AppShell role={user.role === 'ADMIN' ? 'ADMIN' : user.role === 'TEACHER' ? 'TEACHER' : 'STUDENT'} name={user.displayName}>
      {children}
    </AppShell>
  );
}

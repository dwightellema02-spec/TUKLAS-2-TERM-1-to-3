import { ReactNode } from 'react';
import { requireServerUser } from '../../lib/auth/server-guard';
import { AppShell } from '../../components/app-shell';

export default async function StudentLayout({ children }: { children: ReactNode }) {
  // Enforce server-side role check: only STUDENT
  const user = await requireServerUser(['STUDENT']);

  return (
    <AppShell role="STUDENT" name={user.displayName}>
      {children}
    </AppShell>
  );
}

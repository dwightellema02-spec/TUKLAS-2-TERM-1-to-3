import { ReactNode } from 'react';
import { requireServerUser } from '../../lib/auth/server-guard';
import { AppShell } from '../../components/app-shell';

export default async function AdminLayout({ children }: { children: ReactNode }) {
  // Enforce server-side role check: only ADMIN
  const user = await requireServerUser(['ADMIN']);

  return (
    <AppShell role="ADMIN" name={user.displayName}>
      {children}
    </AppShell>
  );
}

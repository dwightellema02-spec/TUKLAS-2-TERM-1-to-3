import { ReactNode } from 'react';
import { requireServerUser } from '../../lib/auth/server-guard';

export default async function AdminLayout({ children }: { children: ReactNode }) {
  // Enforce server-side role check: only ADMIN
  await requireServerUser(['ADMIN']);

  return <>{children}</>;
}

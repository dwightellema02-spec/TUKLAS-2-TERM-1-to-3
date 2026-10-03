import { ReactNode } from 'react';
import { requireServerUser } from '../../lib/auth/server-guard';

export default async function StudentLayout({ children }: { children: ReactNode }) {
  // Enforce server-side role check: only STUDENT
  await requireServerUser(['STUDENT']);

  return <>{children}</>;
}

import { ReactNode } from 'react';
import { requireServerUser } from '../../lib/auth/server-guard';

export default async function TeacherLayout({ children }: { children: ReactNode }) {
  // Enforce server-side role check: TEACHER or ADMIN
  await requireServerUser(['TEACHER', 'ADMIN']);

  return <>{children}</>;
}

import { requireServerUser } from '../../lib/auth/server-guard';
import CurriculumBrowser from '../curriculum-browser';

export default async function CurriculumPage({ searchParams }: { searchParams: Promise<{ q?: string | string[] }> }) {
  const user = await requireServerUser(['STUDENT', 'TEACHER', 'ADMIN']);
  const { q } = await searchParams;
  const initialQuery = (Array.isArray(q) ? q[0] : q)?.slice(0, 100) ?? '';

  return (
    <main>
      <header className="ui-head">
        <div>
          <span className="eyebrow">Philippine K-12 curriculum</span>
          <h1>Discover</h1>
          <p className="ui-sub">
            Find lessons by subject, term and unit, or search by topic. Signed in as {user.displayName} ({user.role.toLowerCase()}).
          </p>
        </div>
      </header>

      <CurriculumBrowser initialQuery={initialQuery} canAuthor={user.role !== 'STUDENT'} />
    </main>
  );
}

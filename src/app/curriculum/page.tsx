import Link from 'next/link';
import { requireServerUser } from '../../lib/auth/server-guard';
import CurriculumBrowser from '../curriculum-browser';

export default async function CurriculumPage() {
  const user = await requireServerUser(['STUDENT', 'TEACHER', 'ADMIN']);

  const dashboardHref =
    user.role === 'ADMIN'
      ? '/admin'
      : user.role === 'TEACHER'
        ? '/teacher'
        : '/student';

  return (
    <main style={{ maxWidth: '1080px', margin: '40px auto', padding: '0 24px' }}>
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '32px',
          borderBottom: '1px solid #d4ded4',
          paddingBottom: '20px',
        }}
      >
        <div>
          <span className="eyebrow" style={{ color: '#2f7a5d', textTransform: 'uppercase' }}>
            Philippine K-12 Curriculum
          </span>
          <h1 style={{ margin: '8px 0', fontSize: '2.4rem', color: '#0e3b34' }}>
            Curriculum Catalog
          </h1>
          <p style={{ color: '#556', margin: 0 }}>
            Signed in as {user.displayName} ({user.role})
          </p>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <Link
            href={dashboardHref}
            style={{
              padding: '10px 16px',
              backgroundColor: '#e2eae1',
              color: '#0e3b34',
              borderRadius: '6px',
              textDecoration: 'none',
              fontWeight: 600,
            }}
          >
            ← My Dashboard
          </Link>
          <Link
            href="/"
            style={{
              padding: '10px 16px',
              backgroundColor: '#f5f7f5',
              color: '#0e3b34',
              borderRadius: '6px',
              textDecoration: 'none',
              fontWeight: 600,
            }}
          >
            Home
          </Link>
        </div>
      </header>

      <CurriculumBrowser />
    </main>
  );
}

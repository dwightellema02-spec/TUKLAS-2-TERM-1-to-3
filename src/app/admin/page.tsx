import Link from 'next/link';
import { requireServerUser } from '../../lib/auth/server-guard';

export default async function AdminDashboardPage() {
  const user = await requireServerUser(['ADMIN']);

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
          <span className="eyebrow" style={{ color: '#c87832', textTransform: 'uppercase' }}>
            System Administration
          </span>
          <h1 style={{ margin: '8px 0', fontSize: '2.4rem', color: '#0e3b34' }}>
            Admin Console
          </h1>
          <p style={{ color: '#556', margin: 0 }}>
            Administrator: {user.displayName} ({user.email})
          </p>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <Link
            href="/curriculum"
            style={{
              padding: '10px 16px',
              backgroundColor: '#0e3b34',
              color: '#ffffff',
              borderRadius: '6px',
              textDecoration: 'none',
              fontWeight: 600,
            }}
          >
            Curriculum Catalog
          </Link>
          <Link
            href="/"
            style={{
              padding: '10px 16px',
              backgroundColor: '#e2eae1',
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

      <section
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: '24px',
          marginBottom: '40px',
        }}
      >
        <div
          style={{
            background: '#ffffff',
            padding: '24px',
            borderRadius: '8px',
            border: '1px solid #d4ded4',
            boxShadow: '0 4px 12px rgba(0,0,0,0.04)',
          }}
        >
          <h2 style={{ fontSize: '1.25rem', color: '#0e3b34', marginTop: 0 }}>Curriculum Hierarchy Governance</h2>
          <p style={{ color: '#556', fontSize: '0.95rem' }}>
            Manage subjects, grade levels, units, and ordering across the Philippine K-12 learning hierarchy.
          </p>
          <div style={{ marginTop: '16px' }}>
            <Link
              href="/curriculum"
              style={{
                display: 'inline-block',
                padding: '8px 14px',
                backgroundColor: '#0e3b34',
                color: '#ffffff',
                borderRadius: '6px',
                textDecoration: 'none',
                fontSize: '0.9rem',
                fontWeight: 600,
              }}
            >
              Inspect Curriculum Tree
            </Link>
          </div>
          <span style={{ fontSize: '0.85rem', color: '#c87832', fontWeight: 600, display: 'block', marginTop: '12px' }}>
            Curriculum Authoritative Source
          </span>
        </div>
        <div
          style={{
            background: '#ffffff',
            padding: '24px',
            borderRadius: '8px',
            border: '1px solid #d4ded4',
            boxShadow: '0 4px 12px rgba(0,0,0,0.04)',
          }}
        >
          <h2 style={{ fontSize: '1.25rem', color: '#0e3b34', marginTop: 0 }}>School & Account Governance</h2>
          <p style={{ color: '#556', fontSize: '0.95rem' }}>
            Manage teacher and student accounts, deactivate accounts, and oversee school rosters.
          </p>
          <span style={{ fontSize: '0.85rem', color: '#c87832', fontWeight: 600 }}>
            Root System Permissions Active
          </span>
        </div>

        <div
          style={{
            background: '#ffffff',
            padding: '24px',
            borderRadius: '8px',
            border: '1px solid #d4ded4',
            boxShadow: '0 4px 12px rgba(0,0,0,0.04)',
          }}
        >
          <h2 style={{ fontSize: '1.25rem', color: '#0e3b34', marginTop: 0 }}>Security & Audit</h2>
          <p style={{ color: '#556', fontSize: '0.95rem' }}>
            Review session lifecycle, manage database sessions, and monitor authentication audit logs.
          </p>
          <span style={{ fontSize: '0.85rem', color: '#2f7a5d', fontWeight: 600 }}>
            HMAC-SHA256 Session Guard
          </span>
        </div>
      </section>
    </main>
  );
}

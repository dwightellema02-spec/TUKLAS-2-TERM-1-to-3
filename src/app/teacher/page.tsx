import Link from 'next/link';
import { requireServerUser } from '../../lib/auth/server-guard';
import { ClassService } from '../../services/class.service';

export const dynamic = 'force-dynamic';

export default async function TeacherStudioPage() {
  const user = await requireServerUser(['TEACHER', 'ADMIN']);
  const classes = await ClassService.listClasses({ id: user.id, role: user.role });
  const students = classes.reduce((sum, cls) => sum + cls._count.members, 0);
  const assignments = classes.reduce((sum, cls) => sum + cls._count.assignments, 0);

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
            Teacher Studio
          </span>
          <h1 style={{ margin: '8px 0', fontSize: '2.4rem', color: '#0e3b34' }}>
            Welcome, {user.displayName}!
          </h1>
          <p style={{ color: '#556', margin: 0 }}>Role: {user.role} | Account: {user.email}</p>
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
          <h2 style={{ fontSize: '1.25rem', color: '#0e3b34', marginTop: 0 }}>Curriculum & Lesson Studio</h2>
          <p style={{ color: '#556', fontSize: '0.95rem' }}>
            Draft, edit, and publish multi-section lessons with video references, formative checks, and assessments.
          </p>
          <div style={{ marginTop: '16px', display: 'flex', gap: '10px' }}>
            <Link
              href="/teacher/lessons/new"
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
              + Create New Lesson
            </Link>
            <Link
              href="/curriculum"
              style={{
                display: 'inline-block',
                padding: '8px 14px',
                backgroundColor: '#e2eae1',
                color: '#0e3b34',
                borderRadius: '6px',
                textDecoration: 'none',
                fontSize: '0.9rem',
                fontWeight: 600,
              }}
            >
              Curriculum Catalog
            </Link>
          </div>
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
          <h2 style={{ fontSize: '1.25rem', color: '#0e3b34', marginTop: 0 }}>Classes</h2>
          <p style={{ color: '#556', fontSize: '0.95rem' }}>
            {classes.length === 0
              ? 'You have no classes yet. Create one and give students its join code.'
              : `${classes.length} ${classes.length === 1 ? 'class' : 'classes'} · ${students} ${students === 1 ? 'student' : 'students'} · ${assignments} active ${assignments === 1 ? 'assignment' : 'assignments'}`}
          </p>
          <div style={{ marginTop: '16px' }}>
            <Link
              href="/teacher/classes"
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
              {classes.length === 0 ? 'Create a class' : 'Manage classes'}
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}

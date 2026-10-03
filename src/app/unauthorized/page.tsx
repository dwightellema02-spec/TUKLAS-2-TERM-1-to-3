import Link from 'next/link';

export default function UnauthorizedPage() {
  return (
    <main
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        padding: '24px',
        textAlign: 'center',
        backgroundColor: '#edf2eb',
      }}
    >
      <div
        style={{
          maxWidth: '540px',
          background: '#ffffff',
          padding: '36px',
          borderRadius: '10px',
          border: '1px solid #d4ded4',
          boxShadow: '0 12px 30px rgba(0,0,0,0.06)',
        }}
      >
        <span
          style={{
            fontSize: '0.85rem',
            fontWeight: 700,
            color: '#b91c1c',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
          }}
        >
          403 Forbidden
        </span>
        <h1 style={{ fontSize: '2rem', margin: '12px 0', color: '#0e3b34' }}>
          Access Restricted
        </h1>
        <p style={{ color: '#4b5750', lineHeight: 1.6, marginBottom: '24px' }}>
          Your account role does not have authorization to view this area. Please switch to your
          designated workspace or log in with an authorized account.
        </p>
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
          <Link
            href="/login"
            style={{
              padding: '10px 18px',
              backgroundColor: '#0e3b34',
              color: '#ffffff',
              borderRadius: '6px',
              textDecoration: 'none',
              fontWeight: 600,
            }}
          >
            Switch Account
          </Link>
          <Link
            href="/"
            style={{
              padding: '10px 18px',
              backgroundColor: '#e2eae1',
              color: '#0e3b34',
              borderRadius: '6px',
              textDecoration: 'none',
              fontWeight: 600,
            }}
          >
            Home Overview
          </Link>
        </div>
      </div>
    </main>
  );
}

import Link from 'next/link';
import { AuthPanel } from '../../components/auth-panel';

const LOOP = ['Discover', 'Learn', 'Understand', 'Practice', 'Assess', 'Analyze', 'Review', 'Master'];

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ mode?: string | string[]; role?: string | string[] }> }) {
  const params = await searchParams;
  const mode = (Array.isArray(params.mode) ? params.mode[0] : params.mode) === 'register' ? 'register' : 'login';
  const role = (Array.isArray(params.role) ? params.role[0] : params.role) === 'teacher' ? 'TEACHER' : 'STUDENT';

  return (
    <main className="au-page">
      <section className="au-hero" aria-label="About Tuklas">
        <Link className="lp-brand au-brand" href="/">
          <span className="lp-brand-mark" aria-hidden="true" />
          Tuklas
        </Link>
        <p className="au-eyebrow">A calmer way to learn</p>
        <h1>Understand the step before you move on.</h1>
        <p className="au-lede">Lessons, practice, feedback and progress in one learning loop.</p>
        <ol className="au-loop" aria-label="The Tuklas learning loop">
          {LOOP.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </section>
      <section className="au-side" aria-label={mode === 'register' ? 'Create an account' : 'Sign in'}>
        <AuthPanel mode={mode} initialRole={role} />
      </section>
    </main>
  );
}

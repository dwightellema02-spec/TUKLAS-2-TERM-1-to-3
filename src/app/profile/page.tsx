import { requireServerUser } from '../../lib/auth/server-guard';
import { ProfileForm } from '../../components/profile-form';

const ROLE_LABEL = { STUDENT: 'Student', TEACHER: 'Teacher', ADMIN: 'Administrator' } as const;

export default async function ProfilePage() {
  const user = await requireServerUser(['STUDENT', 'TEACHER', 'ADMIN']);

  return (
    <main>
      <header className="ui-head">
        <div>
          <span className="eyebrow">Your account</span>
          <h1>Your profile</h1>
          <p className="ui-sub">
            {user.email} · {ROLE_LABEL[user.role]}
          </p>
        </div>
      </header>
      <section className="ui-card" aria-labelledby="profile-heading">
        <h2 id="profile-heading">Display name</h2>
        <ProfileForm initialName={user.displayName} />
      </section>
    </main>
  );
}

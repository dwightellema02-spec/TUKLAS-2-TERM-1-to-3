import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getOptionalServerUser, homePathFor } from '../lib/auth/server-guard';

export const dynamic = 'force-dynamic';

const LOOP = [
  { name: 'Discover', text: 'Find lessons and practice that match what a student needs next.' },
  { name: 'Learn', text: 'A teacher’s lesson becomes an interactive lesson with video, notes and worked examples.' },
  { name: 'Understand', text: 'Short checks after each idea confirm it actually landed.' },
  { name: 'Practice', text: 'Adaptive questions that get easier or harder based on real performance.' },
  { name: 'Assess', text: 'Lesson quizzes with more than just a score.' },
  { name: 'Analyze', text: 'Every wrong answer is diagnosed, not just marked incorrect.' },
  { name: 'Review', text: 'Weak skills come back for review until they are solid.' },
  { name: 'Master', text: 'A mastery record built from repeated performance, not one quiz.' },
];

const FAQ = [
  {
    q: 'Is this just ChatGPT with a school skin?',
    a: 'No. Ask Tuklas is one part of a full loop (discover, learn, practice, assess, analyze, review, master). It is grounded in the actual lesson, tracked over time, and built for teachers to supervise.',
  },
  {
    q: 'Does the AI replace the teacher?',
    a: 'No. Teachers write and review every lesson before it reaches students, see how their class is doing, and see any tutor reply a student reports.',
  },
  {
    q: 'Where does lesson content come from?',
    a: 'From the teacher’s own lesson and the notes, documents and video captions they attach. The tutor is told to use that material first, and it says so when it does not have what a student asks about.',
  },
  {
    q: 'What happens to a student’s data?',
    a: 'Students can see what Tuklas keeps, download it, and delete their account. Audio is never recorded by Tuklas. Please do not type personal details into the tutor.',
  },
];

export default async function LandingPage() {
  // Signed-in people go straight to their own home; the landing page is for visitors.
  const user = await getOptionalServerUser();
  if (user) redirect(homePathFor(user.role));

  return (
    <div className="lp">
      <header className="lp-top">
        <Link className="lp-brand" href="/">
          <span className="lp-brand-mark" aria-hidden="true" />
          Tuklas
        </Link>
        <nav aria-label="Sections" className="lp-nav">
          <a href="#how">How it works</a>
          <a href="#loop">The loop</a>
          <a href="#audience">Students &amp; teachers</a>
          <a href="#faq">FAQ</a>
        </nav>
        <div className="lp-actions">
          <Link className="lp-btn ghost" href="/login?mode=register&role=teacher">I’m a teacher</Link>
          <Link className="lp-btn dark" href="/login?mode=register">Start learning</Link>
        </div>
      </header>

      <main>
        <section className="lp-hero" aria-labelledby="hero-heading">
          <div className="lp-hero-copy">
            <h1 id="hero-heading">Learn smarter. Understand deeper. Master more.</h1>
            <p>
              Tuklas turns a teacher’s lesson into an interactive learning experience, then guides each student through practice, feedback and
              mastery. Not a chatbot. Not a summarizer. A learning ecosystem.
            </p>
            <div className="lp-cta">
              <Link className="lp-btn amber" href="/login?mode=register">Start learning</Link>
              <Link className="lp-btn ghost" href="/login?mode=register&role=teacher">I’m a teacher</Link>
            </div>
            <p className="lp-signin">
              Already have an account? <Link href="/login">Sign in</Link>
            </p>
          </div>
          <div className="lp-loop-card" id="loop">
            <p className="lp-loop-title">The Tuklas learning loop</p>
            <ol>
              {LOOP.map((step, index) => (
                <li key={step.name} className={index === 1 ? 'on' : ''}>
                  <span aria-hidden="true">{index + 1}</span>
                  {step.name}
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section id="how" className="lp-section" aria-labelledby="how-heading">
          <p className="lp-kicker">How Tuklas works</p>
          <h2 id="how-heading">The teacher provides the lesson. Tuklas makes it interactive.</h2>
          <p className="lp-lede">
            AI guides the student, practice builds skill, assessment finds the gaps, and feedback closes them, while every score turns into a
            mastery record the student and teacher can both see.
          </p>
          <div className="lp-steps">
            {LOOP.map((step, index) => (
              <article key={step.name} className="lp-step">
                <h3>
                  {index + 1}. {step.name}
                </h3>
                <p>{step.text}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="audience" className="lp-audience" aria-label="For students and teachers">
          <article className="lp-aud students">
            <h2>For students</h2>
            <p className="lp-aud-sub">One place to learn, ask, practice and know exactly what to study next.</p>
            <ul>
              <li>Open lessons your teacher published, with checks along the way</li>
              <li>Ask Tuklas when a step does not make sense. It explains, it does not just answer</li>
              <li>Practice adapts to you: harder when you are ready, gentler when you are not</li>
              <li>See your level for each skill, built from real performance over time</li>
            </ul>
            <Link className="lp-btn dark small" href="/login?mode=register">Start learning</Link>
          </article>
          <article className="lp-aud teachers">
            <h2>For teachers</h2>
            <p className="lp-aud-sub">Build faster. Review everything. Publish with confidence.</p>
            <ul>
              <li>Write lessons with sections, checks, a video and your own practice questions</li>
              <li>Attach notes, documents and video captions so the tutor uses your material</li>
              <li>See class activity, the skills that are hardest, and who needs support this week</li>
              <li>Read every tutor reply a student reports, without student names</li>
            </ul>
            <Link className="lp-btn dark small" href="/login?mode=register&role=teacher">Open teacher view</Link>
          </article>
        </section>

        <section id="faq" className="lp-section" aria-labelledby="faq-heading">
          <p className="lp-kicker">Good to know</p>
          <h2 id="faq-heading">Frequently asked</h2>
          <div className="lp-faq">
            {FAQ.map((item) => (
              <details key={item.q}>
                <summary>{item.q}</summary>
                <p>{item.a}</p>
              </details>
            ))}
          </div>
        </section>
      </main>

      <footer className="lp-foot">
        <p>© Tuklas. A learning ecosystem, not a homework solver.</p>
        <p>Discover · Learn · Understand · Practice · Assess · Analyze · Review · Master</p>
      </footer>
    </div>
  );
}

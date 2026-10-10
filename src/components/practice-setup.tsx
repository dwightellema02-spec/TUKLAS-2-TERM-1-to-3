'use client';

import { FormEvent, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createPracticeSession } from './start-practice';

export type SetupLesson = {
  id: string;
  title: string;
  unitTitle: string | null;
  skills: Array<{ id: string; name: string }>;
};

const COUNTS = [5, 8, 12];

/**
 * Choose what to practise: a lesson, optionally one skill of it, and how many questions.
 * The questions come from the lesson's own bank and the difficulty adapts to the answers, so there is no difficulty picker.
 */
export function PracticeSetup({ lessons, initialLessonId }: { lessons: SetupLesson[]; initialLessonId?: string }) {
  const router = useRouter();
  const first = lessons.find((lesson) => lesson.id === initialLessonId) ?? lessons[0];
  const [lessonId, setLessonId] = useState(first?.id ?? '');
  const [skillId, setSkillId] = useState('');
  const [total, setTotal] = useState(8);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const lesson = useMemo(() => lessons.find((item) => item.id === lessonId), [lessons, lessonId]);
  const units = useMemo(() => {
    const groups = new Map<string, SetupLesson[]>();
    for (const item of lessons) groups.set(item.unitTitle ?? 'Lessons', [...(groups.get(item.unitTitle ?? 'Lessons') ?? []), item]);
    return [...groups.entries()];
  }, [lessons]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!lesson) return;
    setBusy(true);
    setError('');
    try {
      router.push(`/student/practice/${await createPracticeSession({ lessonId: lesson.id, skillId: skillId || undefined, total })}`);
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'Could not start practice.');
      setBusy(false);
    }
  }

  if (lessons.length === 0) {
    return <p className="ui-note">No lessons with practice questions are published yet. Check back soon.</p>;
  }

  return (
    <form onSubmit={submit} aria-label="Start a practice session">
      <fieldset className="ui-field">
        <legend>Lesson</legend>
        {units.map(([unit, items]) => (
          <div key={unit} style={{ marginBottom: 12 }}>
            <p style={{ margin: '0 0 6px', color: 'var(--ink-soft)', fontSize: '0.82rem' }}>{unit}</p>
            <div className="ui-choices">
              {items.map((item) => (
                <label key={item.id} className="ui-choice">
                  <input
                    type="radio"
                    name="lesson"
                    value={item.id}
                    checked={item.id === lessonId}
                    onChange={() => {
                      setLessonId(item.id);
                      setSkillId('');
                    }}
                  />
                  <span>{item.title}</span>
                </label>
              ))}
            </div>
          </div>
        ))}
      </fieldset>

      {lesson && lesson.skills.length > 0 && (
        <fieldset className="ui-field">
          <legend>Focus</legend>
          <div className="ui-choices">
            <label className="ui-choice">
              <input type="radio" name="skill" value="" checked={skillId === ''} onChange={() => setSkillId('')} />
              <span>All skills (mixed)</span>
            </label>
            {lesson.skills.map((skill) => (
              <label key={skill.id} className="ui-choice">
                <input type="radio" name="skill" value={skill.id} checked={skillId === skill.id} onChange={() => setSkillId(skill.id)} />
                <span>{skill.name}</span>
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <fieldset className="ui-field">
        <legend>Number of questions</legend>
        <div className="ui-choices">
          {COUNTS.map((count) => (
            <label key={count} className="ui-choice">
              <input type="radio" name="total" value={count} checked={total === count} onChange={() => setTotal(count)} />
              <span>{count}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <p className="ui-sub" style={{ margin: '0 0 16px' }}>
        Questions come from the lesson. The difficulty adapts: it gets harder when you are ready and gentler when you are not.
      </p>
      {error && <p role="alert" className="ui-note warn" style={{ marginBottom: 12 }}>{error}</p>}
      <button type="submit" className="ui-btn amber" disabled={busy || !lesson}>
        {busy ? 'Starting…' : 'Start practice →'}
      </button>
    </form>
  );
}

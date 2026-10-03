'use client';

import { useEffect, useState } from 'react';

type Level = 'NOT_STARTED' | 'LEARNING' | 'DEVELOPING' | 'PROFICIENT' | 'MASTERED';

type SkillItem = {
  skill: { id: string; name: string };
  status: Level;
  attemptCount: number;
  accuracy: number;
  explanation: { summary: string; why: string; nextStep: string; encouragement: string };
};

type Picture = {
  skills: SkillItem[];
  recommendation: { action: string; message: string; skillName: string | null };
};

const LEVELS: Level[] = ['NOT_STARTED', 'LEARNING', 'DEVELOPING', 'PROFICIENT', 'MASTERED'];
const LABEL: Record<Level, string> = {
  NOT_STARTED: 'Not started',
  LEARNING: 'Learning',
  DEVELOPING: 'Developing',
  PROFICIENT: 'Proficient',
  MASTERED: 'Mastered',
};

/**
 * The student's evidence-based skill levels for a lesson, why each level was given, and the
 * recommended next step. Everything shown comes from /api/mastery (computed on the server).
 */
export function SkillProgress({ lessonId, heading = 'Your skills' }: { lessonId: string; heading?: string }) {
  const [picture, setPicture] = useState<Picture | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    fetch(`/api/mastery?lessonId=${encodeURIComponent(lessonId)}`)
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error ?? 'Your skills could not be loaded.');
        if (active) setPicture(payload.data as Picture);
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : 'Your skills could not be loaded.');
      });
    return () => {
      active = false;
    };
  }, [lessonId]);

  if (error) return <p role="alert">{error}</p>;
  if (!picture) return <p role="status">Loading your skills...</p>;
  if (picture.skills.length === 0) return null;

  return (
    <section aria-labelledby={`skills-${lessonId}`} className="skill-panel">
      <h2 id={`skills-${lessonId}`} style={{ marginTop: 0, color: '#0e3b34' }}>{heading}</h2>

      <p className="feedback-panel" style={{ marginTop: 0 }}>
        <strong>Next step:</strong> {picture.recommendation.message}
      </p>

      <ul className="review-list">
        {picture.skills.map((item) => {
          const step = LEVELS.indexOf(item.status);
          return (
            <li key={item.skill.id} className="review-item">
              <p style={{ margin: 0 }}>
                <strong>{item.skill.name}</strong>{' '}
                <span className={`status-chip level-${item.status.toLowerCase()}`}>{LABEL[item.status]}</span>
              </p>
              <div
                className="level-track"
                role="img"
                aria-label={`${LABEL[item.status]}: level ${step} of ${LEVELS.length - 1}`}
              >
                {LEVELS.slice(1).map((level, index) => (
                  <span key={level} className={index < step ? 'filled' : ''} />
                ))}
              </div>
              <p style={{ margin: '4px 0 0' }}>{item.explanation.why}</p>
              <p style={{ margin: '4px 0 0', color: '#53635a' }}>{item.explanation.nextStep}</p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

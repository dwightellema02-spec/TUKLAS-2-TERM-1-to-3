'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

type LessonSummary = {
  id: string;
  title: string;
  description?: string | null;
  subject: string;
  gradeLevel: string;
  estimatedMinutes: number | null;
  position?: number;
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
};

type Unit = {
  id: string;
  title: string;
  description: string | null;
  position?: number;
  isDemo: boolean;
  lessons: LessonSummary[];
};

type Term = { id: string; number: number; title: string; units: Unit[] };
type Curriculum = {
  id: string;
  gradeLevel: { id: string; level: number; label: string };
  terms: Term[];
};
type Subject = { id: string; code: string; name: string; curricula: Curriculum[] };

export default function CurriculumBrowser() {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [subjectId, setSubjectId] = useState('');
  const [curriculumId, setCurriculumId] = useState('');
  const [termId, setTermId] = useState('');
  const [unitId, setUnitId] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    fetch('/api/curriculum')
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload.error ?? 'Unable to load curriculum.');
        }
        if (active) {
          const available = payload.data?.subjects as Subject[];
          setSubjects(available ?? []);
          if (available && available.length > 0 && !subjectId) {
            setSubjectId(available[0].id);
          }
        }
      })
      .catch(() => {
        if (active) setError('Curriculum could not be loaded. Please refresh or try again.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [reloadKey, subjectId]);

  const handleRetry = () => {
    setLoading(true);
    setError('');
    setReloadKey((k) => k + 1);
  };

  const activeSubjectId = subjectId || subjects[0]?.id || '';
  const subject = subjects.find((entry) => entry.id === activeSubjectId);
  const curricula = subject?.curricula ?? [];

  const activeCurriculumId = curricula.some((c) => c.id === curriculumId)
    ? curriculumId
    : curricula[0]?.id || '';
  const curriculum = curricula.find((entry) => entry.id === activeCurriculumId);
  const terms = curriculum?.terms ?? [];

  const activeTermId = terms.some((t) => t.id === termId)
    ? termId
    : terms[0]?.id || '';
  const term = terms.find((entry) => entry.id === activeTermId);
  const units = term?.units ?? [];

  const activeUnitId = units.some((u) => u.id === unitId)
    ? unitId
    : units[0]?.id || '';
  const unit = units.find((entry) => entry.id === activeUnitId);
  const allLessons = unit?.lessons ?? [];

  const filteredLessons = searchQuery.trim()
    ? allLessons.filter(
        (lesson) =>
          lesson.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          lesson.description?.toLowerCase().includes(searchQuery.toLowerCase()),
      )
    : allLessons;

  if (loading) {
    return (
      <section className="curriculum-browser" aria-labelledby="curriculum-heading">
        <div className="section-heading">
          <h2 id="curriculum-heading">Explore curriculum</h2>
        </div>
        <p className="empty-state" role="status">
          Loading curriculum catalog...
        </p>
      </section>
    );
  }

  if (error) {
    return (
      <section className="curriculum-browser" aria-labelledby="curriculum-heading">
        <div className="section-heading">
          <h2 id="curriculum-heading">Explore curriculum</h2>
        </div>
        <div className="empty-state" role="alert" style={{ textAlign: 'center' }}>
          <p>{error}</p>
          <button
            type="button"
            onClick={handleRetry}
            style={{
              marginTop: '12px',
              padding: '8px 16px',
              background: '#0e3b34',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
            }}
          >
            Retry
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="curriculum-browser" aria-labelledby="curriculum-heading">
      <div className="section-heading" style={{ marginBottom: '16px' }}>
        <h2 id="curriculum-heading">Explore curriculum</h2>
        <p style={{ color: '#556', margin: '4px 0 0 0' }}>
          Database-authoritative Philippine K-12 learning hierarchy
        </p>
      </div>

      {subjects.length === 0 ? (
        <p className="empty-state">No curriculum catalog is available yet.</p>
      ) : (
        <>
          <div className="curriculum-filters">
            <label>
              Subject
              <select
                value={activeSubjectId}
                onChange={(event) => {
                  setSubjectId(event.target.value);
                  setCurriculumId('');
                  setTermId('');
                  setUnitId('');
                }}
              >
                {subjects.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Grade
              <select
                value={activeCurriculumId}
                onChange={(event) => {
                  setCurriculumId(event.target.value);
                  setTermId('');
                  setUnitId('');
                }}
              >
                {curricula.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.gradeLevel.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Term
              <select
                value={activeTermId}
                onChange={(event) => {
                  setTermId(event.target.value);
                  setUnitId('');
                }}
              >
                {terms.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.title}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Unit
              <select
                value={activeUnitId}
                onChange={(event) => setUnitId(event.target.value)}
              >
                {units.map((entry, idx) => (
                  <option key={entry.id} value={entry.id}>
                    Unit {entry.position !== undefined ? entry.position + 1 : idx + 1}: {entry.title}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div style={{ margin: '16px 0' }}>
            <input
              type="search"
              placeholder="Search lessons by title or keyword..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Filter lessons by keyword"
              style={{
                width: '100%',
                maxWidth: '480px',
                padding: '10px 14px',
                borderRadius: '6px',
                border: '1px solid #c8d6c8',
                fontSize: '0.95rem',
              }}
            />
          </div>

          {unit?.isDemo && (
            <p className="demo-notice">
              Development demo content — not official curriculum.
            </p>
          )}

          {unit?.description && (
            <p style={{ color: '#445', fontStyle: 'italic', margin: '8px 0 16px 0' }}>
              {unit.description}
            </p>
          )}

          {unit && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>
              <Link
                href={`/teacher/lessons/new?unitId=${unit.id}`}
                style={{
                  padding: '6px 14px',
                  backgroundColor: '#0e3b34',
                  color: '#ffffff',
                  borderRadius: '6px',
                  textDecoration: 'none',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  display: 'inline-block',
                }}
              >
                + Create Lesson in this Unit
              </Link>
            </div>
          )}

          {!unit ? (
            <p className="empty-state">No units are listed for this term yet.</p>
          ) : filteredLessons.length === 0 ? (
            <p className="empty-state">
              {searchQuery
                ? `No lessons matching "${searchQuery}" in this unit.`
                : 'No lessons are available in this unit yet.'}
            </p>
          ) : (
            <div className="lesson-grid">
              {filteredLessons.map((lesson) => (
                <article className="lesson-card" key={lesson.id}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <p className="lesson-subject" style={{ margin: 0 }}>
                      {lesson.subject} · {lesson.gradeLevel}
                    </p>
                    {lesson.status !== 'PUBLISHED' && (
                      <span
                        style={{
                          fontSize: '0.75rem',
                          padding: '2px 8px',
                          borderRadius: '4px',
                          backgroundColor: lesson.status === 'DRAFT' ? '#fff3cd' : '#e2e3e5',
                          color: lesson.status === 'DRAFT' ? '#856404' : '#383d41',
                          fontWeight: 600,
                        }}
                      >
                        {lesson.status}
                      </span>
                    )}
                  </div>
                  <h3>{lesson.title}</h3>
                  {lesson.description && (
                    <p style={{ fontSize: '0.85rem', color: '#556', margin: '4px 0 8px 0' }}>
                      {lesson.description}
                    </p>
                  )}
                  {lesson.estimatedMinutes && (
                    <p style={{ fontSize: '0.85rem', color: '#667' }}>
                      ⏱ {lesson.estimatedMinutes} min
                    </p>
                  )}
                  <div style={{ display: 'flex', gap: '8px', marginTop: 'auto' }}>
                    <Link href={`/lessons/${lesson.id}`} style={{ flex: 1, textAlign: 'center' }}>
                      Open lesson
                    </Link>
                    <Link
                      href={`/teacher/lessons/${lesson.id}/studio`}
                      style={{
                        padding: '6px 10px',
                        backgroundColor: '#e2eae1',
                        color: '#0e3b34',
                        borderRadius: '6px',
                        fontSize: '0.85rem',
                        fontWeight: 600,
                        textDecoration: 'none',
                        display: 'flex',
                        alignItems: 'center',
                      }}
                      title="Edit in Lesson Studio"
                    >
                      Studio
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}

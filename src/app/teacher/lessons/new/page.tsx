'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';

interface CurriculumHierarchySubject {
  id: string;
  code: string;
  name: string;
  curricula: Array<{
    id: string;
    gradeLevel: { id: string; level: number; label: string };
    terms: Array<{
      id: string;
      number: number;
      title: string;
      units: Array<{
        id: string;
        title: string;
        description: string | null;
        position: number;
      }>;
    }>;
  }>;
}

export default function NewLessonPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialUnitId = searchParams.get('unitId') || '';

  const [subjects, setSubjects] = useState<CurriculumHierarchySubject[]>([]);
  const [selectedUnitId, setSelectedUnitId] = useState(initialUnitId);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [estimatedMinutes, setEstimatedMinutes] = useState(30);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    fetch('/api/curriculum')
      .then(async (res) => {
        if (!res.ok) throw new Error('Could not load curriculum hierarchy.');
        const data = await res.json();
        if (active) {
          const list: CurriculumHierarchySubject[] = data.data?.subjects || [];
          setSubjects(list);

          // If no initial unitId was provided, pre-select the first available unit
          if (!initialUnitId && list.length > 0) {
            const firstUnit = list[0]?.curricula[0]?.terms[0]?.units[0];
            if (firstUnit) setSelectedUnitId(firstUnit.id);
          }
        }
      })
      .catch((err: unknown) => {
        if (active) setError(err instanceof Error ? err.message : 'Error loading curriculum.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [initialUnitId]);

  // Flatten units for easy selection
  const unitOptions: Array<{
    id: string;
    label: string;
    subjectName: string;
    gradeLabel: string;
  }> = [];

  for (const s of subjects) {
    for (const c of s.curricula) {
      for (const t of c.terms) {
        for (const u of t.units) {
          unitOptions.push({
            id: u.id,
            label: `${s.name} - ${c.gradeLevel.label} (Term ${t.number}): ${u.title}`,
            subjectName: s.name,
            gradeLabel: c.gradeLevel.label,
          });
        }
      }
    }
  }

  const selectedOption = unitOptions.find((o) => o.id === selectedUnitId);

  async function handleCreateLesson(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setError('Please provide a lesson title.');
      return;
    }
    if (!selectedUnitId) {
      setError('Please select a curriculum unit for this lesson.');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      const response = await fetch('/api/lessons', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || null,
          unitId: selectedUnitId,
          subject: selectedOption?.subjectName || '',
          gradeLevel: selectedOption?.gradeLabel || '',
          estimatedMinutes: Number(estimatedMinutes) || 30,
          status: 'DRAFT',
          sections: [
            {
              position: 0,
              heading: '1. Introduction',
              type: 'TEXT',
              content: 'Welcome to this lesson! In this section, we explore core concepts.',
            },
          ],
        }),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || 'Failed to create lesson draft.');
      }

      const lessonId = payload.data.lesson.id;
      router.push(`/teacher/lessons/${lessonId}/studio`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An error occurred while creating the lesson.');
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <main style={{ maxWidth: '720px', margin: '60px auto', padding: '0 20px' }}>
        <p role="status" style={{ color: '#0e3b34' }}>Loading curriculum hierarchy...</p>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: '720px', margin: '40px auto', padding: '0 20px', fontFamily: 'inherit' }}>
      <header style={{ marginBottom: '24px', borderBottom: '1px solid #d4ded4', paddingBottom: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#2f7a5d', textTransform: 'uppercase' }}>
              Lesson Studio
            </span>
            <h1 style={{ margin: '4px 0 0', fontSize: '1.8rem', color: '#0e3b34' }}>Create New Lesson</h1>
          </div>
          <Link
            href="/curriculum"
            style={{
              padding: '6px 12px',
              backgroundColor: '#e2eae1',
              color: '#0e3b34',
              borderRadius: '6px',
              textDecoration: 'none',
              fontSize: '0.85rem',
              fontWeight: 600,
            }}
          >
            Cancel
          </Link>
        </div>
      </header>

      {error && (
        <div
          role="alert"
          style={{
            padding: '12px 16px',
            backgroundColor: '#fef2f2',
            color: '#b91c1c',
            border: '1px solid #fecaca',
            borderRadius: '6px',
            marginBottom: '20px',
            fontSize: '0.9rem',
          }}
        >
          {error}
        </div>
      )}

      <form
        onSubmit={handleCreateLesson}
        style={{
          background: '#ffffff',
          border: '1px solid #d4ded4',
          borderRadius: '8px',
          padding: '24px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.03)',
        }}
      >
        <div style={{ marginBottom: '20px' }}>
          <label htmlFor="curriculum-unit" style={{ display: 'block', fontWeight: 600, color: '#0e3b34', marginBottom: '6px' }}>
            Curriculum Unit <span style={{ color: '#dc2626' }}>*</span>
          </label>
          <select
            id="curriculum-unit"
            value={selectedUnitId}
            onChange={(e) => setSelectedUnitId(e.target.value)}
            required
            style={{
              width: '100%',
              padding: '10px 12px',
              border: '1px solid #cce3de',
              borderRadius: '6px',
              fontSize: '0.95rem',
              backgroundColor: '#fff',
            }}
          >
            {unitOptions.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.label}
              </option>
            ))}
          </select>
          <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: '#64748b' }}>
            Lessons are created as DRAFT under your chosen curriculum unit and remain private until published.
          </p>
        </div>

        <div style={{ marginBottom: '20px' }}>
          <label htmlFor="lesson-title" style={{ display: 'block', fontWeight: 600, color: '#0e3b34', marginBottom: '6px' }}>
            Lesson Title <span style={{ color: '#dc2626' }}>*</span>
          </label>
          <input
            id="lesson-title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Operations on Integers: Addition & Subtraction"
            required
            style={{
              width: '100%',
              padding: '10px 12px',
              border: '1px solid #cce3de',
              borderRadius: '6px',
              fontSize: '1rem',
            }}
          />
        </div>

        <div style={{ marginBottom: '20px' }}>
          <label htmlFor="lesson-description" style={{ display: 'block', fontWeight: 600, color: '#0e3b34', marginBottom: '6px' }}>
            Description (Optional)
          </label>
          <textarea
            id="lesson-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="A brief overview of the key concepts and student learning targets for this lesson..."
            rows={3}
            style={{
              width: '100%',
              padding: '10px 12px',
              border: '1px solid #cce3de',
              borderRadius: '6px',
              fontSize: '0.95rem',
            }}
          />
        </div>

        <div style={{ marginBottom: '24px' }}>
          <label htmlFor="lesson-minutes" style={{ display: 'block', fontWeight: 600, color: '#0e3b34', marginBottom: '6px' }}>
            Estimated Completion Time (minutes)
          </label>
          <input
            id="lesson-minutes"
            type="number"
            min={5}
            max={300}
            value={estimatedMinutes}
            onChange={(e) => setEstimatedMinutes(Number(e.target.value))}
            style={{
              width: '120px',
              padding: '8px 12px',
              border: '1px solid #cce3de',
              borderRadius: '6px',
              fontSize: '0.95rem',
            }}
          />
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
          <Link
            href="/curriculum"
            style={{
              padding: '10px 18px',
              backgroundColor: '#f1f5f9',
              color: '#334155',
              borderRadius: '6px',
              textDecoration: 'none',
              fontWeight: 600,
            }}
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={submitting}
            style={{
              padding: '10px 20px',
              backgroundColor: '#0e3b34',
              color: '#ffffff',
              border: 'none',
              borderRadius: '6px',
              fontWeight: 600,
              cursor: submitting ? 'not-allowed' : 'pointer',
              opacity: submitting ? 0.7 : 1,
            }}
          >
            {submitting ? 'Creating Draft...' : 'Open in Lesson Studio →'}
          </button>
        </div>
      </form>
    </main>
  );
}

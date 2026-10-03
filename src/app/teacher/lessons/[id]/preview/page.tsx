'use client';

import React, { useEffect, useState, use } from 'react';
import Link from 'next/link';
import { EducationalContent, YouTubeVideoPlayer } from '../../../../../components/educational-content';
import { renderWithMath } from '../../../../../components/math-formula';

interface PreviewLesson {
  id: string;
  title: string;
  description: string | null;
  subject: string;
  gradeLevel: string;
  estimatedMinutes: number | null;
  status: string;
  unit: {
    title: string;
    term: {
      number: number;
      curriculum: {
        subject: { name: string };
        gradeLevel: { label: string };
      };
    };
  } | null;
  sections: Array<{
    id: string;
    position: number;
    heading: string;
    type: string;
    content: string | null;
    metadata: unknown;
    sourceExplanation: string | null;
    aiExplanation: string | null;
  }>;
  sources: Array<{
    id: string;
    provider: string;
    url: string;
    title: string;
    videoId: string | null;
  }>;
  checks: Array<{
    id: string;
    position: number;
    question: string;
    questionType: string;
    options: string[];
    correctIndex: number;
    correctAnswer: string | null;
    explanation: string;
    points: number;
  }>;
}

export default function TeacherLessonPreviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const lessonId = resolvedParams.id;

  const [lesson, setLesson] = useState<PreviewLesson | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAnswerKeys, setShowAnswerKeys] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [publishMessage, setPublishMessage] = useState('');

  useEffect(() => {
    let active = true;
    fetch(`/api/lessons/${lessonId}/preview`)
      .then(async (res) => {
        const payload = await res.json();
        if (!res.ok) throw new Error(payload.error || 'Failed to load preview.');
        if (active) setLesson(payload.data.lesson);
      })
      .catch((err: unknown) => {
        if (active) setError(err instanceof Error ? err.message : 'Preview unavailable.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [lessonId]);

  const handlePublish = async () => {
    setPublishing(true);
    setPublishMessage('');
    try {
      const res = await fetch(`/api/lessons/${lessonId}/publish`, {
        method: 'POST',
      });
      const payload = await res.json();
      if (!res.ok) {
        throw new Error(payload.error || 'Publish failed.');
      }
      setPublishMessage('Lesson published successfully! It is now visible to students.');
      setLesson((prev) => (prev ? { ...prev, status: 'PUBLISHED' } : null));
    } catch (err: unknown) {
      setPublishMessage(err instanceof Error ? err.message : 'Error publishing lesson.');
    } finally {
      setPublishing(false);
    }
  };

  if (loading) {
    return (
      <main style={{ maxWidth: '860px', margin: '60px auto', padding: '0 20px' }}>
        <p role="status" style={{ color: '#0e3b34' }}>Loading teacher preview...</p>
      </main>
    );
  }

  if (error || !lesson) {
    return (
      <main style={{ maxWidth: '860px', margin: '60px auto', padding: '0 20px' }}>
        <p role="alert" style={{ color: '#b91c1c' }}>{error || 'Lesson preview unavailable.'}</p>
        <Link href="/curriculum">Return to Curriculum Catalog</Link>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: '900px', margin: '24px auto', padding: '0 20px', fontFamily: 'inherit' }}>
      {/* TEACHER PREVIEW BANNER */}
      <aside
        aria-label="Teacher preview controls"
        style={{
          background: '#f0fdf4',
          border: '1px solid #86efac',
          borderRadius: '8px',
          padding: '14px 20px',
          marginBottom: '24px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        <div>
          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#166534', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Teacher Preview Mode
          </span>
          <p style={{ margin: '2px 0 0', fontSize: '0.85rem', color: '#1e293b' }}>
            Status: <strong>{lesson.status}</strong> · You are previewing how students experience this lesson.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', cursor: 'pointer', color: '#0e3b34', fontWeight: 600 }}>
            <input
              type="checkbox"
              checked={showAnswerKeys}
              onChange={(e) => setShowAnswerKeys(e.target.checked)}
            />
            Reveal Answer Keys
          </label>

          <Link
            href={`/teacher/lessons/${lessonId}/studio`}
            style={{
              padding: '6px 14px',
              backgroundColor: '#ffffff',
              color: '#0e3b34',
              border: '1px solid #cbd5e1',
              borderRadius: '6px',
              textDecoration: 'none',
              fontSize: '0.85rem',
              fontWeight: 600,
            }}
          >
            ← Edit in Studio
          </Link>

          {lesson.status !== 'PUBLISHED' && (
            <button
              onClick={handlePublish}
              disabled={publishing}
              style={{
                padding: '6px 14px',
                backgroundColor: '#0e3b34',
                color: '#ffffff',
                border: 'none',
                borderRadius: '6px',
                fontSize: '0.85rem',
                fontWeight: 600,
                cursor: publishing ? 'not-allowed' : 'pointer',
              }}
            >
              {publishing ? 'Publishing...' : 'Publish Lesson'}
            </button>
          )}
        </div>
      </aside>

      {publishMessage && (
        <div
          role="status"
          style={{
            padding: '10px 16px',
            borderRadius: '6px',
            marginBottom: '20px',
            backgroundColor: publishMessage.includes('successfully') ? '#ecfdf5' : '#fef2f2',
            color: publishMessage.includes('successfully') ? '#065f46' : '#991b1b',
            border: `1px solid ${publishMessage.includes('successfully') ? '#a7f3d0' : '#fecaca'}`,
            fontSize: '0.9rem',
          }}
        >
          {publishMessage}
        </div>
      )}

      {/* STUDENT-FACING PREVIEW CONTAINER */}
      <article
        style={{
          background: '#ffffff',
          border: '1px solid #d4ded4',
          borderRadius: '10px',
          padding: '36px',
          boxShadow: '0 4px 16px rgba(0,0,0,0.03)',
        }}
      >
        <p style={{ margin: '0 0 6px', fontSize: '0.85rem', fontWeight: 600, color: '#2f7a5d', textTransform: 'uppercase' }}>
          {lesson.unit?.term.curriculum.subject.name || lesson.subject} · {lesson.unit?.term.curriculum.gradeLevel.label || lesson.gradeLevel}
        </p>

        <h1 style={{ margin: '0 0 12px', fontSize: '2.2rem', color: '#0e3b34', lineHeight: 1.2 }}>
          {lesson.title}
        </h1>

        {lesson.description && (
          <p style={{ fontSize: '1.05rem', color: '#475569', lineHeight: 1.6, marginBottom: '24px' }}>
            {lesson.description}
          </p>
        )}

        {/* ATTACHED VIDEOS */}
        {lesson.sources && lesson.sources.length > 0 && (
          <div style={{ marginBottom: '32px' }}>
            <h2 style={{ fontSize: '1.3rem', color: '#0e3b34', marginBottom: '12px' }}>
              Lesson Video Reference
            </h2>
            {lesson.sources.map((src) => (
              <div key={src.id}>
                {src.videoId && <YouTubeVideoPlayer videoId={src.videoId} title={src.title} />}
                <p style={{ fontSize: '0.85rem', color: '#64748b', margin: '4px 0 0' }}>
                  Source: {src.title}
                </p>
              </div>
            ))}
          </div>
        )}

        {/* SECTIONS */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '28px', marginBottom: '40px' }}>
          {lesson.sections.map((sec) => (
            <section key={sec.id} style={{ borderBottom: '1px solid #f1f5f9', paddingBottom: '20px' }}>
              <h2 style={{ fontSize: '1.4rem', color: '#0e3b34', marginBottom: '12px' }}>
                {sec.heading}
              </h2>
              <EducationalContent
                content={sec.content || sec.sourceExplanation}
                type={sec.type}
                metadata={sec.metadata}
              />
            </section>
          ))}
        </div>

        {/* FORMATIVE CHECKS */}
        {lesson.checks && lesson.checks.length > 0 && (
          <div style={{ marginTop: '36px', borderTop: '2px solid #e2e8f0', paddingTop: '28px' }}>
            <h2 style={{ fontSize: '1.5rem', color: '#0e3b34', marginBottom: '16px' }}>
              Formative Comprehension Checks
            </h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {lesson.checks.map((chk, idx) => (
                <div
                  key={chk.id}
                  style={{
                    background: '#f8fafc',
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                    padding: '20px',
                  }}
                >
                  <p style={{ fontWeight: 600, fontSize: '1.05rem', color: '#0e3b34', margin: '0 0 12px' }}>
                    {idx + 1}. {renderWithMath(chk.question)}
                  </p>

                  {/* Options */}
                  {Array.isArray(chk.options) && chk.options.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '12px' }}>
                      {chk.options.map((opt, optIdx) => {
                        const isCorrect = optIdx === chk.correctIndex;
                        return (
                          <div
                            key={optIdx}
                            style={{
                              padding: '10px 14px',
                              borderRadius: '6px',
                              border: showAnswerKeys && isCorrect ? '2px solid #16a34a' : '1px solid #cbd5e1',
                              backgroundColor: showAnswerKeys && isCorrect ? '#f0fdf4' : '#ffffff',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                            }}
                          >
                            <span>{renderWithMath(opt)}</span>
                            {showAnswerKeys && isCorrect && (
                              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#15803d', textTransform: 'uppercase' }}>
                                Correct Answer
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Correct Answer Display for Short Answer / Numeric */}
                  {chk.correctAnswer && (
                    <div
                      style={{
                        padding: '10px 14px',
                        borderRadius: '6px',
                        border: showAnswerKeys ? '2px solid #16a34a' : '1px solid #cbd5e1',
                        backgroundColor: showAnswerKeys ? '#f0fdf4' : '#ffffff',
                        marginBottom: '12px',
                      }}
                    >
                      <span style={{ color: '#64748b', fontSize: '0.85rem' }}>Expected Answer: </span>
                      <strong style={{ color: showAnswerKeys ? '#15803d' : '#0e3b34' }}>
                        {showAnswerKeys ? chk.correctAnswer : '•••••••• (Hidden for students)'}
                      </strong>
                    </div>
                  )}

                  {/* Teacher Explanation */}
                  {showAnswerKeys && chk.explanation && (
                    <div
                      style={{
                        marginTop: '10px',
                        padding: '10px 14px',
                        backgroundColor: '#ecfdf5',
                        borderLeft: '4px solid #10b981',
                        borderRadius: '4px',
                        fontSize: '0.9rem',
                        color: '#064e3b',
                      }}
                    >
                      <strong>Teacher Explanation: </strong>
                      {renderWithMath(chk.explanation)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </article>
    </main>
  );
}

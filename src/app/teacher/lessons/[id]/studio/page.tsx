'use client';

import React, { useEffect, useState, use } from 'react';
import Link from 'next/link';
import { parseYouTubeUrl } from '../../../../../lib/youtube';
import { WorkedExampleMetadata } from '../../../../../types/domain';

interface StudioSection {
  id?: string;
  position: number;
  heading: string;
  type: string;
  content: string | null;
  metadata?: WorkedExampleMetadata | Record<string, unknown> | null;
  sourceExplanation?: string | null;
}

interface StudioCheck {
  id?: string;
  position: number;
  question: string;
  questionType: 'MULTIPLE_CHOICE' | 'TRUE_FALSE' | 'SHORT_ANSWER' | 'NUMERIC';
  options: string[];
  correctIndex: number;
  correctAnswer?: string | null;
  explanation: string;
  points?: number;
}

interface StudioVideo {
  id?: string;
  url: string;
  videoId?: string | null;
  thumbnailUrl?: string | null;
  title: string;
  description?: string | null;
  position?: number;
}

interface LessonStudioData {
  id: string;
  title: string;
  description: string | null;
  subject: string;
  gradeLevel: string;
  estimatedMinutes: number | null;
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  publishedAt: string | null;
  unit: {
    id: string;
    title: string;
    term: {
      number: number;
      curriculum: {
        subject: { name: string };
        gradeLevel: { label: string };
      };
    };
  } | null;
  sections: StudioSection[];
  checks: StudioCheck[];
  sources: StudioVideo[];
  author: {
    id: string;
    displayName: string;
  };
}

export default function LessonStudioPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const lessonId = resolvedParams.id;

  const [lesson, setLesson] = useState<LessonStudioData | null>(null);
  const [sections, setSections] = useState<StudioSection[]>([]);
  const [checks, setChecks] = useState<StudioCheck[]>([]);
  const [videos, setVideos] = useState<StudioVideo[]>([]);
  const [lessonTitle, setLessonTitle] = useState('');
  const [lessonDescription, setLessonDescription] = useState('');

  const [activeTab, setActiveTab] = useState<'sections' | 'checks' | 'videos'>('sections');
  const [loading, setLoading] = useState(true);
  const [isDirty, setIsDirty] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [statusMessage, setStatusMessage] = useState('');

  // Video attachment draft
  const [newVideoUrl, setNewVideoUrl] = useState('');
  const [videoError, setVideoError] = useState('');

  useEffect(() => {
    let active = true;
    fetch(`/api/lessons/${lessonId}/preview`)
      .then(async (res) => {
        if (!res.ok) {
          const errPayload = await res.json();
          throw new Error(errPayload.error || 'Failed to load lesson in studio.');
        }
        const data = await res.json();
        if (active) {
          const l: LessonStudioData = data.data.lesson;
          setLesson(l);
          setLessonTitle(l.title);
          setLessonDescription(l.description || '');
          setSections(l.sections || []);
          setChecks(
            (l.checks || []).map((c) => ({
              ...c,
              options: Array.isArray(c.options) ? (c.options as string[]) : [],
              questionType: c.questionType || 'MULTIPLE_CHOICE',
            })),
          );
          setVideos(l.sources || []);
          setIsDirty(false);
        }
      })
      .catch((err: unknown) => {
        if (active) {
          setStatusMessage(err instanceof Error ? err.message : 'Error loading lesson.');
          setSaveStatus('error');
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [lessonId]);

  // Protect against accidental navigation with unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  /* ---------------- SAVE / PUBLISH ACTIONS ---------------- */

  const handleSaveDraft = async () => {
    setSaveStatus('saving');
    setStatusMessage('Saving draft to Neon PostgreSQL...');
    try {
      const res = await fetch(`/api/lessons/${lessonId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title: lessonTitle.trim(),
          description: lessonDescription.trim() || null,
          sections: sections.map((s, idx) => ({
            position: idx,
            heading: s.heading.trim(),
            type: s.type || 'TEXT',
            content: s.content || null,
            metadata: s.metadata || null,
          })),
          checks: checks.map((c, idx) => ({
            position: idx,
            question: c.question.trim(),
            questionType: c.questionType,
            options: c.options,
            correctIndex: c.correctIndex,
            correctAnswer: c.correctAnswer || null,
            explanation: c.explanation.trim(),
            points: c.points || 1,
          })),
          videos: videos.map((v, idx) => ({
            url: v.url,
            title: v.title || 'Educational Video',
            description: v.description || null,
            position: idx,
          })),
        }),
      });

      const payload = await res.json();
      if (!res.ok) {
        throw new Error(payload.error || 'Failed to save lesson.');
      }

      setIsDirty(false);
      setSaveStatus('saved');
      setStatusMessage('Draft saved successfully.');
      setTimeout(() => setStatusMessage(''), 4000);
    } catch (err: unknown) {
      setSaveStatus('error');
      setStatusMessage(err instanceof Error ? err.message : 'Error saving draft.');
    }
  };

  const handlePublish = async () => {
    if (isDirty) {
      await handleSaveDraft();
    }
    setSaveStatus('saving');
    setStatusMessage('Validating content and publishing...');
    try {
      const res = await fetch(`/api/lessons/${lessonId}/publish`, {
        method: 'POST',
      });
      const payload = await res.json();
      if (!res.ok) {
        throw new Error(payload.error || 'Validation failed. Complete required content before publishing.');
      }
      setIsDirty(false);
      setSaveStatus('saved');
      setStatusMessage('Lesson successfully published to students!');
      setLesson((prev) => (prev ? { ...prev, status: 'PUBLISHED', publishedAt: new Date().toISOString() } : null));
      setTimeout(() => setStatusMessage(''), 4000);
    } catch (err: unknown) {
      setSaveStatus('error');
      setStatusMessage(err instanceof Error ? err.message : 'Publish error.');
    }
  };

  /* ---------------- SECTION MANAGEMENT ---------------- */

  const addSection = (type: string = 'TEXT') => {
    const newSec: StudioSection = {
      position: sections.length,
      heading: `${sections.length + 1}. ${type === 'EXAMPLE' ? 'Worked Example' : type === 'SUMMARY' ? 'Summary' : 'New Section'}`,
      type,
      content: type === 'EXAMPLE' ? '' : 'Enter lesson explanation and concepts here.',
      metadata:
        type === 'EXAMPLE'
          ? {
              problem: 'Solve for x: 2x + 3 = 11',
              steps: [
                { step: 1, action: 'Subtract 3 from both sides: 2x = 8', explanation: 'Isolating the variable term.' },
                { step: 2, action: 'Divide both sides by 2: x = 4', explanation: 'Final simplification.' },
              ],
              finalAnswer: 'x = 4',
            }
          : null,
    };
    setSections([...sections, newSec]);
    setIsDirty(true);
  };

  const updateSection = (index: number, patch: Partial<StudioSection>) => {
    const updated = [...sections];
    updated[index] = { ...updated[index], ...patch };
    setSections(updated);
    setIsDirty(true);
  };

  const removeSection = (index: number) => {
    const updated = sections.filter((_, i) => i !== index).map((s, i) => ({ ...s, position: i }));
    setSections(updated);
    setIsDirty(true);
  };

  const moveSection = (index: number, direction: 'up' | 'down') => {
    if ((direction === 'up' && index === 0) || (direction === 'down' && index === sections.length - 1)) {
      return;
    }
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    const updated = [...sections];
    const [moved] = updated.splice(index, 1);
    updated.splice(targetIndex, 0, moved);
    setSections(updated.map((s, i) => ({ ...s, position: i })));
    setIsDirty(true);
  };

  /* ---------------- FORMATIVE CHECKS MANAGEMENT ---------------- */

  const addCheck = () => {
    const newCheck: StudioCheck = {
      position: checks.length,
      question: 'What is the correct solution to the problem?',
      questionType: 'MULTIPLE_CHOICE',
      options: ['Option A', 'Option B', 'Option C', 'Option D'],
      correctIndex: 0,
      correctAnswer: null,
      explanation: 'Detailed explanation of why this answer is correct.',
      points: 1,
    };
    setChecks([...checks, newCheck]);
    setIsDirty(true);
  };

  const updateCheck = (index: number, patch: Partial<StudioCheck>) => {
    const updated = [...checks];
    updated[index] = { ...updated[index], ...patch };
    setChecks(updated);
    setIsDirty(true);
  };

  const removeCheck = (index: number) => {
    const updated = checks.filter((_, i) => i !== index).map((c, i) => ({ ...c, position: i }));
    setChecks(updated);
    setIsDirty(true);
  };

  /* ---------------- VIDEO MANAGEMENT ---------------- */

  const handleAttachVideo = () => {
    setVideoError('');
    const parsed = parseYouTubeUrl(newVideoUrl);
    if (!parsed.isValid || !parsed.videoId) {
      setVideoError(parsed.error || 'Please provide a valid YouTube URL (e.g. https://www.youtube.com/watch?v=...)');
      return;
    }

    const newVid: StudioVideo = {
      url: parsed.canonicalUrl || newVideoUrl.trim(),
      videoId: parsed.videoId,
      thumbnailUrl: parsed.thumbnailUrl,
      title: 'Educational Video',
      description: null,
      position: videos.length,
    };

    setVideos([...videos, newVid]);
    setNewVideoUrl('');
    setIsDirty(true);
  };

  const removeVideo = (index: number) => {
    setVideos(videos.filter((_, i) => i !== index));
    setIsDirty(true);
  };

  if (loading) {
    return (
      <main style={{ maxWidth: '1080px', margin: '60px auto', padding: '0 20px' }}>
        <p role="status" style={{ color: '#0e3b34' }}>Loading Lesson Studio...</p>
      </main>
    );
  }

  if (!lesson) {
    return (
      <main style={{ maxWidth: '1080px', margin: '60px auto', padding: '0 20px' }}>
        <p role="alert" style={{ color: '#b91c1c' }}>{statusMessage || 'Lesson not found or unauthorized.'}</p>
        <Link href="/curriculum">Return to Curriculum Catalog</Link>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: '1140px', margin: '24px auto', padding: '0 24px', fontFamily: 'inherit' }}>
      {/* HEADER & ACTION BAR */}
      <header
        style={{
          borderBottom: '1px solid #d4ded4',
          paddingBottom: '16px',
          marginBottom: '24px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          gap: '16px',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span
              style={{
                backgroundColor: lesson.status === 'PUBLISHED' ? '#dcfce7' : '#fef3c7',
                color: lesson.status === 'PUBLISHED' ? '#15803d' : '#b45309',
                padding: '3px 8px',
                borderRadius: '4px',
                fontSize: '0.75rem',
                fontWeight: 700,
                textTransform: 'uppercase',
              }}
            >
              {lesson.status}
            </span>
            <span style={{ fontSize: '0.85rem', color: '#64748b' }}>
              {lesson.unit?.term.curriculum.subject.name} · {lesson.unit?.term.curriculum.gradeLevel.label} · Unit: {lesson.unit?.title}
            </span>
          </div>
          <input
            type="text"
            value={lessonTitle}
            onChange={(e) => {
              setLessonTitle(e.target.value);
              setIsDirty(true);
            }}
            placeholder="Lesson Title"
            style={{
              fontSize: '1.8rem',
              fontWeight: 700,
              color: '#0e3b34',
              border: 'none',
              borderBottom: '2px solid transparent',
              outline: 'none',
              width: '100%',
              marginTop: '4px',
              backgroundColor: 'transparent',
            }}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {isDirty && (
            <span style={{ fontSize: '0.8rem', color: '#d97706', fontWeight: 600 }}>
              ● Unsaved changes
            </span>
          )}
          {saveStatus === 'saved' && (
            <span style={{ fontSize: '0.8rem', color: '#16a34a', fontWeight: 600 }}>
              ✓ Saved
            </span>
          )}
          {saveStatus === 'saving' && (
            <span style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600 }}>
              Saving...
            </span>
          )}

          <button
            onClick={handleSaveDraft}
            disabled={saveStatus === 'saving'}
            style={{
              padding: '8px 16px',
              backgroundColor: '#e2eae1',
              color: '#0e3b34',
              border: '1px solid #cce3de',
              borderRadius: '6px',
              fontWeight: 600,
              fontSize: '0.9rem',
              cursor: 'pointer',
            }}
          >
            Save Draft
          </button>

          <Link
            href={`/teacher/lessons/${lessonId}/preview`}
            style={{
              padding: '8px 16px',
              backgroundColor: '#ffffff',
              color: '#0e3b34',
              border: '1px solid #0e3b34',
              borderRadius: '6px',
              textDecoration: 'none',
              fontWeight: 600,
              fontSize: '0.9rem',
            }}
          >
            Preview
          </Link>

          <button
            onClick={handlePublish}
            disabled={saveStatus === 'saving'}
            style={{
              padding: '8px 18px',
              backgroundColor: '#0e3b34',
              color: '#ffffff',
              border: 'none',
              borderRadius: '6px',
              fontWeight: 600,
              fontSize: '0.9rem',
              cursor: 'pointer',
            }}
          >
            {lesson.status === 'PUBLISHED' ? 'Update & Publish' : 'Publish Lesson'}
          </button>
        </div>
      </header>

      {/* STATUS BANNER */}
      {statusMessage && (
        <div
          role="status"
          style={{
            padding: '10px 16px',
            borderRadius: '6px',
            marginBottom: '16px',
            backgroundColor: saveStatus === 'error' ? '#fef2f2' : '#f0fdf4',
            color: saveStatus === 'error' ? '#b91c1c' : '#15803d',
            border: `1px solid ${saveStatus === 'error' ? '#fecaca' : '#bbf7d0'}`,
            fontSize: '0.9rem',
          }}
        >
          {statusMessage}
        </div>
      )}

      {/* STUDIO TABS */}
      <nav
        style={{
          display: 'flex',
          gap: '8px',
          borderBottom: '2px solid #e2e8f0',
          marginBottom: '24px',
        }}
      >
        <button
          onClick={() => setActiveTab('sections')}
          style={{
            padding: '10px 20px',
            background: 'none',
            border: 'none',
            borderBottom: activeTab === 'sections' ? '3px solid #0e3b34' : '3px solid transparent',
            color: activeTab === 'sections' ? '#0e3b34' : '#64748b',
            fontWeight: 700,
            fontSize: '0.95rem',
            cursor: 'pointer',
          }}
        >
          1. Multi-Section Content ({sections.length})
        </button>
        <button
          onClick={() => setActiveTab('checks')}
          style={{
            padding: '10px 20px',
            background: 'none',
            border: 'none',
            borderBottom: activeTab === 'checks' ? '3px solid #0e3b34' : '3px solid transparent',
            color: activeTab === 'checks' ? '#0e3b34' : '#64748b',
            fontWeight: 700,
            fontSize: '0.95rem',
            cursor: 'pointer',
          }}
        >
          2. Formative Checks ({checks.length})
        </button>
        <button
          onClick={() => setActiveTab('videos')}
          style={{
            padding: '10px 20px',
            background: 'none',
            border: 'none',
            borderBottom: activeTab === 'videos' ? '3px solid #0e3b34' : '3px solid transparent',
            color: activeTab === 'videos' ? '#0e3b34' : '#64748b',
            fontWeight: 700,
            fontSize: '0.95rem',
            cursor: 'pointer',
          }}
        >
          3. Educational Videos ({videos.length})
        </button>
      </nav>

      {/* TAB 1: MULTI-SECTION CONTENT */}
      {activeTab === 'sections' && (
        <section>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <p style={{ margin: 0, color: '#475569', fontSize: '0.9rem' }}>
              Create ordered educational sections. Use <code>$x + 5 = 12$</code> for inline math or <code>$$...$$</code> for formula blocks.
            </p>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={() => addSection('TEXT')}
                style={{
                  padding: '6px 12px',
                  backgroundColor: '#0e3b34',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '4px',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                + Text Section
              </button>
              <button
                onClick={() => addSection('EXAMPLE')}
                style={{
                  padding: '6px 12px',
                  backgroundColor: '#2f7a5d',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '4px',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                + Worked Example
              </button>
              <button
                onClick={() => addSection('SUMMARY')}
                style={{
                  padding: '6px 12px',
                  backgroundColor: '#f1f5f9',
                  color: '#0e3b34',
                  border: '1px solid #cbd5e1',
                  borderRadius: '4px',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                + Summary
              </button>
            </div>
          </div>

          {sections.length === 0 ? (
            <div style={{ padding: '32px', textAlign: 'center', background: '#f8fafc', borderRadius: '8px', border: '1px dashed #cbd5e1' }}>
              <p style={{ color: '#64748b' }}>No sections added yet. Click &ldquo;+ Text Section&rdquo; or &ldquo;+ Worked Example&rdquo; above to begin.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {sections.map((sec, idx) => (
                <article
                  key={idx}
                  style={{
                    background: '#ffffff',
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                    padding: '20px',
                    boxShadow: '0 2px 6px rgba(0,0,0,0.02)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span
                        style={{
                          backgroundColor: '#e2eae1',
                          color: '#0e3b34',
                          fontWeight: 700,
                          fontSize: '0.75rem',
                          padding: '3px 8px',
                          borderRadius: '4px',
                        }}
                      >
                        Section {idx + 1} ({sec.type})
                      </span>
                      <select
                        value={sec.type}
                        onChange={(e) => updateSection(idx, { type: e.target.value })}
                        style={{
                          padding: '4px 8px',
                          border: '1px solid #cbd5e1',
                          borderRadius: '4px',
                          fontSize: '0.8rem',
                        }}
                      >
                        <option value="TEXT">Text Explanation</option>
                        <option value="EXAMPLE">Worked Example</option>
                        <option value="VIDEO">Video Section</option>
                        <option value="ACTIVITY">Guided Activity</option>
                        <option value="SUMMARY">Key Summary</option>
                      </select>
                    </div>

                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button
                        onClick={() => moveSection(idx, 'up')}
                        disabled={idx === 0}
                        title="Move Up"
                        style={{
                          padding: '4px 8px',
                          background: '#f1f5f9',
                          border: '1px solid #cbd5e1',
                          borderRadius: '4px',
                          cursor: idx === 0 ? 'not-allowed' : 'pointer',
                          opacity: idx === 0 ? 0.4 : 1,
                        }}
                      >
                        ▲
                      </button>
                      <button
                        onClick={() => moveSection(idx, 'down')}
                        disabled={idx === sections.length - 1}
                        title="Move Down"
                        style={{
                          padding: '4px 8px',
                          background: '#f1f5f9',
                          border: '1px solid #cbd5e1',
                          borderRadius: '4px',
                          cursor: idx === sections.length - 1 ? 'not-allowed' : 'pointer',
                          opacity: idx === sections.length - 1 ? 0.4 : 1,
                        }}
                      >
                        ▼
                      </button>
                      <button
                        onClick={() => removeSection(idx)}
                        title="Delete Section"
                        style={{
                          padding: '4px 8px',
                          background: '#fee2e2',
                          color: '#b91c1c',
                          border: '1px solid #fecaca',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontWeight: 700,
                        }}
                      >
                        ✕
                      </button>
                    </div>
                  </div>

                  <input
                    type="text"
                    value={sec.heading}
                    onChange={(e) => updateSection(idx, { heading: e.target.value })}
                    placeholder="Section Heading (e.g. 1. What Are Integers?)"
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      border: '1px solid #cbd5e1',
                      borderRadius: '6px',
                      fontSize: '1.05rem',
                      fontWeight: 600,
                      color: '#0e3b34',
                      marginBottom: '12px',
                    }}
                  />

                  {sec.type === 'EXAMPLE' ? (
                    /* WORKED EXAMPLE AUTHORING */
                    <div style={{ backgroundColor: '#f8fafc', padding: '16px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                      <label style={{ display: 'block', fontWeight: 600, fontSize: '0.85rem', color: '#0e3b34', marginBottom: '4px' }}>
                        Problem Statement (Supports $math$):
                      </label>
                      <input
                        type="text"
                        value={((sec.metadata as WorkedExampleMetadata)?.problem) || ''}
                        onChange={(e) => {
                          const meta: WorkedExampleMetadata = (sec.metadata as WorkedExampleMetadata) || { problem: '', steps: [], finalAnswer: '' };
                          updateSection(idx, { metadata: { ...meta, problem: e.target.value } });
                        }}
                        placeholder="e.g. Solve for x: 2x + 3 = 11"
                        style={{ width: '100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '4px', marginBottom: '12px' }}
                      />

                      <div style={{ marginBottom: '12px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                          <span style={{ fontWeight: 600, fontSize: '0.85rem', color: '#0e3b34' }}>Steps:</span>
                          <button
                            type="button"
                            onClick={() => {
                              const meta: WorkedExampleMetadata = (sec.metadata as WorkedExampleMetadata) || { problem: '', steps: [], finalAnswer: '' };
                              const steps = [...(meta.steps || [])];
                              steps.push({ step: steps.length + 1, action: '', explanation: '' });
                              updateSection(idx, { metadata: { ...meta, steps } });
                            }}
                            style={{ padding: '3px 8px', fontSize: '0.75rem', background: '#e2eae1', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 600 }}
                          >
                            + Add Step
                          </button>
                        </div>
                        {((sec.metadata as WorkedExampleMetadata)?.steps || []).map((st, stepIdx) => (
                          <div key={stepIdx} style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                            <span style={{ fontSize: '0.85rem', fontWeight: 700, padding: '8px 0', color: '#64748b' }}>
                              {stepIdx + 1}.
                            </span>
                            <input
                              type="text"
                              value={st.action}
                              onChange={(e) => {
                                const meta = (sec.metadata as WorkedExampleMetadata);
                                const steps = [...meta.steps];
                                steps[stepIdx] = { ...steps[stepIdx], action: e.target.value };
                                updateSection(idx, { metadata: { ...meta, steps } });
                              }}
                              placeholder="Action (e.g. Subtract 3 from both sides)"
                              style={{ flex: 1, padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '0.9rem' }}
                            />
                            <input
                              type="text"
                              value={st.explanation}
                              onChange={(e) => {
                                const meta = (sec.metadata as WorkedExampleMetadata);
                                const steps = [...meta.steps];
                                steps[stepIdx] = { ...steps[stepIdx], explanation: e.target.value };
                                updateSection(idx, { metadata: { ...meta, steps } });
                              }}
                              placeholder="Pedagogical explanation (e.g. 2x = 8)"
                              style={{ flex: 1, padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '0.9rem' }}
                            />
                            <button
                              type="button"
                              onClick={() => {
                                const meta = (sec.metadata as WorkedExampleMetadata);
                                const steps = meta.steps.filter((_, si) => si !== stepIdx).map((s, si) => ({ ...s, step: si + 1 }));
                                updateSection(idx, { metadata: { ...meta, steps } });
                              }}
                              style={{ padding: '0 8px', background: '#fee2e2', border: 'none', borderRadius: '4px', color: '#b91c1c', cursor: 'pointer' }}
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                      </div>

                      <label style={{ display: 'block', fontWeight: 600, fontSize: '0.85rem', color: '#0e3b34', marginBottom: '4px' }}>
                        Final Answer:
                      </label>
                      <input
                        type="text"
                        value={((sec.metadata as WorkedExampleMetadata)?.finalAnswer) || ''}
                        onChange={(e) => {
                          const meta = (sec.metadata as WorkedExampleMetadata);
                          updateSection(idx, { metadata: { ...meta, finalAnswer: e.target.value } });
                        }}
                        placeholder="e.g. x = 4"
                        style={{ width: '100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '4px' }}
                      />
                    </div>
                  ) : (
                    /* STANDARD CONTENT EDITOR */
                    <div>
                      <textarea
                        value={sec.content || ''}
                        onChange={(e) => updateSection(idx, { content: e.target.value })}
                        placeholder="Enter instructional text, worked steps, or bullet points. Use $math$ for equations."
                        rows={5}
                        style={{
                          width: '100%',
                          padding: '10px 12px',
                          border: '1px solid #cbd5e1',
                          borderRadius: '6px',
                          fontSize: '0.95rem',
                          fontFamily: 'inherit',
                          lineHeight: 1.5,
                        }}
                      />
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      {/* TAB 2: FORMATIVE CHECKS */}
      {activeTab === 'checks' && (
        <section>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <p style={{ margin: 0, color: '#475569', fontSize: '0.9rem' }}>
              Add formative checks for student self-testing. Answer keys and explanations are securely stripped for students until submitted.
            </p>
            <button
              onClick={addCheck}
              style={{
                padding: '6px 14px',
                backgroundColor: '#0e3b34',
                color: '#fff',
                border: 'none',
                borderRadius: '4px',
                fontSize: '0.85rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              + Add Formative Check
            </button>
          </div>

          {checks.length === 0 ? (
            <div style={{ padding: '32px', textAlign: 'center', background: '#f8fafc', borderRadius: '8px', border: '1px dashed #cbd5e1' }}>
              <p style={{ color: '#64748b' }}>No formative checks yet. Add a question to verify student comprehension.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {checks.map((chk, idx) => (
                <article
                  key={idx}
                  style={{
                    background: '#ffffff',
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                    padding: '20px',
                    boxShadow: '0 2px 6px rgba(0,0,0,0.02)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span
                        style={{
                          backgroundColor: '#fef3c7',
                          color: '#b45309',
                          fontWeight: 700,
                          fontSize: '0.75rem',
                          padding: '3px 8px',
                          borderRadius: '4px',
                        }}
                      >
                        Check {idx + 1}
                      </span>
                      <select
                        value={chk.questionType}
                        onChange={(e) => {
                          const t = e.target.value as StudioCheck['questionType'];
                          updateCheck(idx, {
                            questionType: t,
                            options: t === 'TRUE_FALSE' ? ['True', 'False'] : t === 'MULTIPLE_CHOICE' ? ['A', 'B', 'C', 'D'] : [],
                            correctIndex: 0,
                          });
                        }}
                        style={{ padding: '4px 8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '0.8rem' }}
                      >
                        <option value="MULTIPLE_CHOICE">Multiple Choice</option>
                        <option value="TRUE_FALSE">True / False</option>
                        <option value="SHORT_ANSWER">Short Answer</option>
                        <option value="NUMERIC">Numeric Answer</option>
                      </select>
                    </div>

                    <button
                      onClick={() => removeCheck(idx)}
                      style={{
                        padding: '4px 8px',
                        background: '#fee2e2',
                        color: '#b91c1c',
                        border: '1px solid #fecaca',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontWeight: 700,
                      }}
                    >
                      ✕
                    </button>
                  </div>

                  <label style={{ display: 'block', fontWeight: 600, fontSize: '0.85rem', color: '#0e3b34', marginBottom: '4px' }}>
                    Question:
                  </label>
                  <input
                    type="text"
                    value={chk.question}
                    onChange={(e) => updateCheck(idx, { question: e.target.value })}
                    placeholder="e.g. What is the value of (-8) + 15?"
                    style={{ width: '100%', padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: '6px', marginBottom: '12px' }}
                  />

                  {/* OPTIONS OR ANSWER INPUT */}
                  {chk.questionType === 'MULTIPLE_CHOICE' || chk.questionType === 'TRUE_FALSE' ? (
                    <div style={{ marginBottom: '12px' }}>
                      <span style={{ display: 'block', fontWeight: 600, fontSize: '0.85rem', color: '#0e3b34', marginBottom: '6px' }}>
                        Choices (Select the correct answer):
                      </span>
                      {chk.options.map((opt, optIdx) => (
                        <div key={optIdx} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                          <input
                            type="radio"
                            name={`check-correct-${idx}`}
                            checked={chk.correctIndex === optIdx}
                            onChange={() => updateCheck(idx, { correctIndex: optIdx })}
                            style={{ cursor: 'pointer' }}
                          />
                          <input
                            type="text"
                            value={opt}
                            disabled={chk.questionType === 'TRUE_FALSE'}
                            onChange={(e) => {
                              const newOpts = [...chk.options];
                              newOpts[optIdx] = e.target.value;
                              updateCheck(idx, { options: newOpts });
                            }}
                            style={{ flex: 1, padding: '6px 10px', border: '1px solid #cbd5e1', borderRadius: '4px' }}
                          />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ marginBottom: '12px' }}>
                      <label style={{ display: 'block', fontWeight: 600, fontSize: '0.85rem', color: '#0e3b34', marginBottom: '4px' }}>
                        Correct Answer ({chk.questionType === 'NUMERIC' ? 'Number' : 'Text'}):
                      </label>
                      <input
                        type={chk.questionType === 'NUMERIC' ? 'number' : 'text'}
                        value={chk.correctAnswer || ''}
                        onChange={(e) => updateCheck(idx, { correctAnswer: e.target.value })}
                        placeholder={chk.questionType === 'NUMERIC' ? 'e.g. 7' : 'e.g. integer'}
                        style={{ width: '100%', padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: '6px' }}
                      />
                    </div>
                  )}

                  <label style={{ display: 'block', fontWeight: 600, fontSize: '0.85rem', color: '#0e3b34', marginBottom: '4px' }}>
                    Pedagogical Explanation:
                  </label>
                  <textarea
                    value={chk.explanation}
                    onChange={(e) => updateCheck(idx, { explanation: e.target.value })}
                    placeholder="Explain why this answer is correct and address potential student misconceptions."
                    rows={2}
                    style={{ width: '100%', padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '0.9rem' }}
                  />
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      {/* TAB 3: EDUCATIONAL VIDEOS */}
      {activeTab === 'videos' && (
        <section>
          <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '20px', marginBottom: '20px' }}>
            <h3 style={{ margin: '0 0 8px', fontSize: '1.1rem', color: '#0e3b34' }}>Attach Educational YouTube Video</h3>
            <p style={{ margin: '0 0 12px', color: '#64748b', fontSize: '0.85rem' }}>
              Paste a YouTube link (e.g. <code>https://www.youtube.com/watch?v=kYJv8y-9q5U</code> or <code>https://youtu.be/kYJv8y-9q5U</code>).
            </p>
            {videoError && (
              <p role="alert" style={{ color: '#b91c1c', fontSize: '0.85rem', margin: '0 0 8px' }}>
                {videoError}
              </p>
            )}
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                value={newVideoUrl}
                onChange={(e) => setNewVideoUrl(e.target.value)}
                placeholder="https://www.youtube.com/watch?v=..."
                style={{ flex: 1, padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: '6px' }}
              />
              <button
                type="button"
                onClick={handleAttachVideo}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#0e3b34',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '6px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Attach Video
              </button>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
            {videos.map((vid, idx) => (
              <div
                key={idx}
                style={{
                  background: '#ffffff',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  overflow: 'hidden',
                  boxShadow: '0 2px 6px rgba(0,0,0,0.02)',
                }}
              >
                {vid.thumbnailUrl && (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={vid.thumbnailUrl}
                    alt={vid.title}
                    style={{ width: '100%', height: '160px', objectFit: 'cover' }}
                  />
                )}
                <div style={{ padding: '12px' }}>
                  <input
                    type="text"
                    value={vid.title}
                    onChange={(e) => {
                      const updated = [...videos];
                      updated[idx].title = e.target.value;
                      setVideos(updated);
                      setIsDirty(true);
                    }}
                    placeholder="Video Title"
                    style={{
                      width: '100%',
                      fontWeight: 600,
                      color: '#0e3b34',
                      border: '1px solid #cbd5e1',
                      borderRadius: '4px',
                      padding: '4px 8px',
                      marginBottom: '8px',
                    }}
                  />
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Video ID: {vid.videoId}</span>
                    <button
                      type="button"
                      onClick={() => removeVideo(idx)}
                      style={{
                        padding: '4px 8px',
                        background: '#fee2e2',
                        color: '#b91c1c',
                        border: 'none',
                        borderRadius: '4px',
                        fontSize: '0.75rem',
                        cursor: 'pointer',
                        fontWeight: 600,
                      }}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}

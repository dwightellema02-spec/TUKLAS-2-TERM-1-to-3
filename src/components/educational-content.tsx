'use client';

import React, { useState } from 'react';
import { renderWithMath } from './math-formula';
import { WorkedExampleMetadata, WorkedExampleStep } from '../types/domain';

interface EducationalContentProps {
  content: string | null;
  type?: string;
  metadata?: unknown;
  className?: string;
}

/**
 * Renders teacher-authored educational content safely with math notation and structured elements.
 */
export function EducationalContent({
  content,
  type = 'TEXT',
  metadata,
  className = '',
}: EducationalContentProps) {
  if (type === 'EXAMPLE' && metadata && typeof metadata === 'object') {
    const example = metadata as WorkedExampleMetadata;
    return <WorkedExampleView example={example} fallbackText={content} />;
  }

  if (!content) return null;

  // Split by double line breaks into paragraphs or lists
  const lines = content.split('\n');
  const blocks: React.ReactNode[] = [];
  let currentList: string[] = [];

  const flushList = (keyPrefix: number) => {
    if (currentList.length > 0) {
      blocks.push(
        <ul key={`list-${keyPrefix}`} style={{ paddingLeft: '24px', margin: '8px 0' }}>
          {currentList.map((item, idx) => (
            <li key={idx} style={{ marginBottom: '4px' }}>
              {renderWithMath(item)}
            </li>
          ))}
        </ul>,
      );
      currentList = [];
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (!line) {
      flushList(i);
      continue;
    }

    if (line.startsWith('- ') || line.startsWith('* ') || line.startsWith('• ')) {
      currentList.push(line.replace(/^[-*•]\s*/, ''));
    } else {
      flushList(i);

      if (line.startsWith('### ')) {
        blocks.push(
          <h4 key={i} style={{ margin: '16px 0 8px', fontSize: '1.1rem', color: '#0e3b34' }}>
            {renderWithMath(line.replace(/^###\s*/, ''))}
          </h4>,
        );
      } else if (line.startsWith('## ')) {
        blocks.push(
          <h3 key={i} style={{ margin: '20px 0 10px', fontSize: '1.25rem', color: '#0e3b34' }}>
            {renderWithMath(line.replace(/^##\s*/, ''))}
          </h3>,
        );
      } else if (line.startsWith('# ')) {
        blocks.push(
          <h2 key={i} style={{ margin: '24px 0 12px', fontSize: '1.4rem', color: '#0e3b34' }}>
            {renderWithMath(line.replace(/^#\s*/, ''))}
          </h2>,
        );
      } else {
        blocks.push(
          <p key={i} style={{ margin: '8px 0', lineHeight: 1.6, color: '#2d3748' }}>
            {renderWithMath(line)}
          </p>,
        );
      }
    }
  }

  flushList(lines.length);

  return <div className={`educational-content ${className}`}>{blocks}</div>;
}

/**
 * Structured Worked Example viewer with step-by-step breakdown.
 */
export function WorkedExampleView({
  example,
  fallbackText,
}: {
  example: WorkedExampleMetadata;
  fallbackText?: string | null;
}) {
  const [activeStep, setActiveStep] = useState<number | null>(null);

  if (!example || (!example.problem && (!example.steps || example.steps.length === 0))) {
    return fallbackText ? <EducationalContent content={fallbackText} /> : null;
  }

  return (
    <div
      className="worked-example-card"
      style={{
        background: '#ffffff',
        border: '1px solid #cce3de',
        borderLeft: '5px solid #2f7a5d',
        borderRadius: '8px',
        padding: '20px',
        margin: '16px 0',
        boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
        <span
          style={{
            backgroundColor: '#e6f4ea',
            color: '#137333',
            fontSize: '0.75rem',
            fontWeight: 700,
            padding: '3px 8px',
            borderRadius: '4px',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          }}
        >
          Worked Example
        </span>
      </div>

      {example.problem && (
        <div style={{ marginBottom: '16px' }}>
          <strong style={{ color: '#0e3b34', display: 'block', marginBottom: '4px' }}>
            Problem:
          </strong>
          <div style={{ fontSize: '1.05rem', color: '#1a202c', fontWeight: 500 }}>
            {renderWithMath(example.problem)}
          </div>
        </div>
      )}

      {example.steps && example.steps.length > 0 && (
        <div style={{ marginTop: '12px', borderTop: '1px solid #eef2f6', paddingTop: '12px' }}>
          <strong style={{ color: '#0e3b34', fontSize: '0.9rem', textTransform: 'uppercase' }}>
            Step-by-Step Solution:
          </strong>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '8px' }}>
            {example.steps.map((st: WorkedExampleStep, idx: number) => {
              const isSelected = activeStep === idx;
              return (
                <div
                  key={idx}
                  onClick={() => setActiveStep(isSelected ? null : idx)}
                  style={{
                    padding: '10px 14px',
                    borderRadius: '6px',
                    backgroundColor: isSelected ? '#f0fdf4' : '#f8fafc',
                    border: isSelected ? '1px solid #86efac' : '1px solid #e2e8f0',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontWeight: 600, color: '#0e3b34' }}>
                      Step {st.step}: {renderWithMath(st.action)}
                    </div>
                    <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
                      {isSelected ? '▲ Hide' : '▼ View explanation'}
                    </span>
                  </div>
                  {isSelected && st.explanation && (
                    <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px dashed #cbd5e1', color: '#334155', fontSize: '0.95rem' }}>
                      {renderWithMath(st.explanation)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {example.finalAnswer && (
        <div
          style={{
            marginTop: '16px',
            padding: '10px 14px',
            backgroundColor: '#eefcf6',
            border: '1px solid #a7f3d0',
            borderRadius: '6px',
          }}
        >
          <strong style={{ color: '#0e3b34' }}>Final Answer: </strong>
          <span style={{ fontWeight: 600, color: '#065f46' }}>
            {renderWithMath(example.finalAnswer)}
          </span>
        </div>
      )}
    </div>
  );
}

/**
 * Accessible, responsive YouTube video player component.
 */
export function YouTubeVideoPlayer({
  videoId,
  title,
}: {
  videoId: string;
  title?: string;
}) {
  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        paddingBottom: '56.25%',
        height: 0,
        overflow: 'hidden',
        borderRadius: '8px',
        margin: '16px 0',
        backgroundColor: '#000000',
      }}
    >
      <iframe
        src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}?rel=0`}
        title={title || 'Educational Lesson Video'}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          border: 'none',
        }}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
      />
    </div>
  );
}

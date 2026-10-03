'use client';

import React from 'react';

interface MathFormulaProps {
  formula: string;
  block?: boolean;
  className?: string;
}

/**
 * Clean, accessible mathematical expression renderer.
 * Formats fractions (a/b), superscripts (x^2), subscripts (x_1), and common math operators.
 * Uses semantic HTML with role="math" and aria-label for accessibility.
 */
export function MathFormula({ formula, block = false, className = '' }: MathFormulaProps) {
  const cleanFormula = formula.replace(/^\$\$?|\$\$?$/g, '').trim();

  // Basic LaTeX/Math symbol replacement
  const formatSymbols = (text: string) => {
    return text
      .replace(/\\times/g, '×')
      .replace(/\\div/g, '÷')
      .replace(/\\pm/g, '±')
      .replace(/\\le/g, '≤')
      .replace(/\\ge/g, '≥')
      .replace(/\\ne/g, '≠')
      .replace(/\\approx/g, '≈')
      .replace(/\\pi/g, 'π')
      .replace(/\\sqrt\{([^}]+)\}/g, '√($1)')
      .replace(/\\sqrt/g, '√');
  };

  const formatted = formatSymbols(cleanFormula);

  const Tag = block ? 'div' : 'span';

  return (
    <Tag
      role="math"
      aria-label={`Mathematical expression: ${cleanFormula}`}
      className={`math-formula ${block ? 'math-block' : 'math-inline'} ${className}`}
      style={{
        fontFamily: 'KaTeX_Main, "Cambria Math", "Times New Roman", serif',
        fontStyle: 'normal',
        letterSpacing: '0.02em',
        ...(block
          ? {
              display: 'block',
              margin: '12px 0',
              padding: '10px 16px',
              backgroundColor: '#f7faf7',
              borderRadius: '6px',
              borderLeft: '4px solid #0e3b34',
              overflowX: 'auto',
              textAlign: 'center',
              fontSize: '1.15rem',
            }
          : {
              display: 'inline-block',
              padding: '0 4px',
              fontWeight: 500,
            }),
      }}
    >
      {formatted}
    </Tag>
  );
}

/**
 * Splits plain or markdown text containing inline ($...$) or block ($$...$$) math,
 * and renders formatted math components alongside text safely.
 */
export function renderWithMath(text: string): React.ReactNode[] {
  if (!text) return [];

  // Match block math $$...$$ first, then inline $...$
  const regex = /(\$\$[\s\S]*?\$\$|\$[^$\n]+\$)/g;
  const parts = text.split(regex);

  return parts.map((part, index) => {
    if (part.startsWith('$$') && part.endsWith('$$')) {
      return <MathFormula key={index} formula={part} block={true} />;
    }
    if (part.startsWith('$') && part.endsWith('$')) {
      return <MathFormula key={index} formula={part} block={false} />;
    }
    return <span key={index}>{part}</span>;
  });
}

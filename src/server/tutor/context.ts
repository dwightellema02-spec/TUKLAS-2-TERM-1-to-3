/**
 * Tuklas 2.0 — Chooses WHICH parts of a lesson the tutor is shown (master plan §6, owner phase E).
 *
 * Before: the first six sections, whatever the student asked. A question about the tenth section never reached the
 * model. Now: the sections that match the student's message and question come first (deterministic lexical retrieval,
 * the same scorer used for teacher documents), the lesson's opening is always kept for orientation, the result is kept
 * in lesson order and inside a size budget, and the rest are named by heading only so the tutor knows they exist.
 * Teacher-authored worked examples (stored as problem, steps and final answer) are turned into text, which the tutor
 * could not see before.
 */

import { findRelevantChunks, tokenize } from '../documents/retrieve';
import type { PromptLesson } from './prompt';

export const LESSON_CONTEXT = {
  /** Characters of section text sent to the model per request. */
  budgetChars: 2_400,
  perSectionChars: 450,
  maxSections: 6,
  /** Sections always kept from the start of the lesson when nothing else matches. */
  orientationSections: 2,
  maxVocabulary: 10,
  maxOtherHeadings: 8,
} as const;

export type LessonSectionInput = {
  heading: string;
  type: string | null;
  sourceExplanation: string | null;
  content: string | null;
  metadata: unknown;
};

type WorkedExample = { problem?: unknown; steps?: unknown; finalAnswer?: unknown };

const clean = (text: string) => text.replace(/\s+/g, ' ').trim();

/** The text of one section, including a teacher-authored worked example. */
export function sectionToText(section: LessonSectionInput): string {
  const parts = [section.sourceExplanation, section.content].filter((part): part is string => Boolean(part));
  if (section.type === 'EXAMPLE' && section.metadata && typeof section.metadata === 'object') {
    const example = section.metadata as WorkedExample;
    const steps = Array.isArray(example.steps)
      ? (example.steps as Array<{ action?: unknown; explanation?: unknown }>)
          .map((step, index) => `Step ${index + 1}: ${[step.action, step.explanation].filter((v) => typeof v === 'string' && v).join(' (')}${step.action && step.explanation ? ')' : ''}`)
          .filter((line) => line.length > 8)
      : [];
    if (typeof example.problem === 'string' && example.problem.trim()) {
      parts.push(`Worked example. Problem: ${example.problem}.${steps.length ? ` ${steps.join('. ')}.` : ''}${typeof example.finalAnswer === 'string' && example.finalAnswer ? ` Result: ${example.finalAnswer}.` : ''}`);
    }
  }
  return clean(parts.join(' '));
}

const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);

/**
 * @param query what the student is asking about (their message plus the open question, if any)
 */
export function selectLessonContext(
  lesson: { title: string; objectives: string[]; sections: LessonSectionInput[]; vocabulary: { term: string; definition: string }[] },
  query: string,
): PromptLesson & { otherSections: string[] } {
  const all = lesson.sections
    .map((section, position) => ({ id: String(position), position, heading: section.heading, content: sectionToText(section) }))
    .filter((section) => section.content.length > 0);

  // 1. relevance to the question; 2. orientation (the opening) when little matched; 3. back into lesson order.
  const relevant = findRelevantChunks(query, all, LESSON_CONTEXT.maxSections);
  const chosen = new Map(relevant.map((section) => [section.id, section]));
  if (chosen.size < 3) {
    for (const section of all) {
      if (chosen.size >= Math.max(3, LESSON_CONTEXT.orientationSections) || chosen.size >= LESSON_CONTEXT.maxSections) break;
      chosen.set(section.id, section);
    }
  }
  const ordered = [...chosen.values()].sort((a, b) => a.position - b.position);

  // Keep inside the budget: most relevant first, each clipped; stop when the budget is spent.
  let remaining: number = LESSON_CONTEXT.budgetChars;
  const kept = new Set<string>();
  const sections: { heading: string; text: string }[] = [];
  const rank = new Map([...relevant, ...ordered].map((section, index) => [section.id, index]));
  for (const section of [...ordered].sort((a, b) => (rank.get(a.id) ?? 99) - (rank.get(b.id) ?? 99))) {
    if (remaining <= 80) break;
    const text = clip(section.content, Math.min(LESSON_CONTEXT.perSectionChars, remaining));
    remaining -= text.length;
    kept.add(section.id);
    sections.push({ heading: section.heading, text });
  }
  // The order shown to the model is the lesson's own order.
  const position = new Map(all.map((section) => [section.heading, section.position]));
  sections.sort((a, b) => (position.get(a.heading) ?? 0) - (position.get(b.heading) ?? 0));

  // Vocabulary the student asked about or the chosen text uses comes first.
  const shown = new Set(tokenize(`${query} ${sections.map((s) => `${s.heading} ${s.text}`).join(' ')}`));
  const used = lesson.vocabulary.filter((entry) => tokenize(entry.term).some((word) => shown.has(word)));
  const vocabulary = (used.length > 0 ? used : lesson.vocabulary).slice(0, LESSON_CONTEXT.maxVocabulary);

  return {
    title: lesson.title,
    objectives: lesson.objectives,
    sections,
    vocabulary,
    otherSections: all.filter((section) => !kept.has(section.id)).map((section) => section.heading).slice(0, LESSON_CONTEXT.maxOtherHeadings),
  };
}

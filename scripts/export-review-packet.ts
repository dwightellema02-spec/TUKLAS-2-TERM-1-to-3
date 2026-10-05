/**
 * Writes docs/TEACHER_REVIEW_PACKET.md: every Term 1 lesson, check and practice question in one printable document with the
 * answer marked, so a teacher can review and sign off without opening the app.   npx tsx scripts/export-review-packet.ts
 */

import { writeFileSync } from 'node:fs';
import { buildTerm1Lessons, TERM1_SOURCE } from '../prisma/content/term1-lessons';

const letters = ['A', 'B', 'C', 'D'];
const out: string[] = [];

out.push('# Tuklas AI: Teacher review packet (Grade 7 Mathematics, Term 1)', '');
out.push(`Source of the competencies: ${TERM1_SOURCE}.`);
out.push('', '**The lesson text and the questions were drafted by an AI assistant and have NOT been reviewed by a teacher.** Every practice answer was');
out.push('computed by program and re-derived independently, so arithmetic errors are unlikely, but wording, difficulty, examples and fit to your');
out.push('class are exactly what only you can judge.', '');
out.push('## How to review', '');
out.push('1. Read each lesson. Mark anything wrong, unclear, too hard or too easy. Suggest Filipino-friendly examples (pesos, local places).');
out.push('2. For each question check: the marked answer (★) is right; the other three choices are plausible mistakes; the explanation is clear.');
out.push('3. Tick the box and sign the lesson at its end. Return this document to the developer, or make the edits yourself in the Lesson Studio.', '');
out.push('Not covered yet (so you can say what is missing): drawing polygons with a ruler and protractor; graded practice for the financial plan;');
out.push('operations on fractions (practice is decimals only); ordering rational numbers on a number line (taught, not practised).', '');

let total = 0;
for (const lesson of buildTerm1Lessons()) {
  out.push('---', '', `## ${lesson.title}`, '');
  out.push(`${lesson.description} (about ${lesson.estimatedMinutes} minutes)`, '');
  out.push(`**Competency:** ${lesson.competency.title}`, '');
  out.push('**Objectives:**', ...lesson.objectives.map((o) => `- ${o.description}`), '');
  for (const section of lesson.sections) {
    out.push(`### ${section.heading}`, '', section.sourceExplanation, '', `*Tip shown to the student:* ${section.aiExplanation}`, '');
  }
  out.push('### Vocabulary', ...lesson.vocabulary.map((v) => `- **${v.term}**: ${v.definition}`), '');
  out.push('### Knowledge checks (answered during the lesson)', '');
  lesson.checks.forEach((check, i) => {
    out.push(`${i + 1}. ${check.question}`);
    check.options.forEach((option, j) => out.push(`   - ${letters[j]}. ${option}${j === check.correctIndex ? ' ★' : ''}`));
    out.push(`   - Explanation: ${check.explanation}`, '');
  });

  out.push(`### Practice questions (${lesson.bank.length})`, '');
  for (const skill of lesson.skills) {
    const items = lesson.bank.filter((q) => q.skillCode === skill.code);
    out.push(`#### Skill: ${skill.name} (${items.length} questions)`, '');
    items.forEach((q, i) => {
      total += 1;
      out.push(`${i + 1}. [${q.difficulty}] ${q.question}`);
      q.options.forEach((option, j) => out.push(`   - ${letters[j]}. ${option}${j === q.correctIndex ? ' ★' : ''}`));
      out.push(`   - Explanation: ${q.explanation}`, '');
    });
  }
  out.push('**Review of this lesson**', '', '- [ ] Content correct and clear   - [ ] Questions correct   - [ ] Difficulty fair   - [ ] Examples suitable', '');
  out.push('Changes needed: ______________________________________________', '');
  out.push('Reviewed by: ____________________  Date: ____________  Signature: ____________________', '');
}
out.push('---', '', `Total practice questions in this packet: ${total}.`, '');

writeFileSync('docs/TEACHER_REVIEW_PACKET.md', out.join('\n'));
console.log(`Wrote docs/TEACHER_REVIEW_PACKET.md (${total} practice questions).`);

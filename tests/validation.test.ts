import { describe, expect, it } from 'vitest';
import { lessonInputSchema } from '../src/server/validation';

describe('lessonInputSchema', () => {
  it('accepts lesson metadata and nested learning content', () => {
    const result = lessonInputSchema.safeParse({
      title: 'Adding Integers',
      subject: 'Mathematics',
      gradeLevel: 'Grade 7',
      sections: [{ position: 0, heading: 'Integer Rules' }],
      checks: [
        {
          position: 0,
          question: 'What is -2 + 3?',
          options: ['1', '-1'],
          correctIndex: 0,
          explanation: 'Move three units right from -2.',
        },
      ],
    });

    expect(result.success).toBe(true);
  });

  it('rejects a question whose correct index is outside its options', () => {
    const result = lessonInputSchema.safeParse({
      title: 'Invalid lesson',
      subject: 'Mathematics',
      gradeLevel: 'Grade 7',
      quizQuestions: [
        {
          position: 0,
          question: 'Which answer is correct?',
          options: ['A', 'B'],
          correctIndex: 2,
          explanation: 'The answer must be one of the options.',
        },
      ],
    });

    expect(result.success).toBe(false);
  });
});

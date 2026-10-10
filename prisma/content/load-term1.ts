/**
 * Loads the Grade 7 Term 1 curriculum (units, lessons, objectives, vocabulary, checks and the computed practice banks)
 * into a database. Used by the development seed AND by `npm run content:load` for a real deployment, so there is exactly
 * one definition of this content and one way to load it. Idempotent: running it again updates the same rows.
 *
 * It creates the Mathematics / Grade 7 / Term 1 catalog entries it needs if they are missing. It never creates accounts.
 */

import type { PrismaClient } from '@prisma/client';
import { buildTerm1Lessons, TERM1_SOURCE, TERM1_UNITS } from './term1-lessons';
import { buildTerm1WeeklyLessons, WEEKLY_UNIT } from './term1-weekly';

export type LoadSummary = { units: number; lessons: number; practiceQuestions: number };

export async function loadTerm1Curriculum(prisma: PrismaClient, authorId: string, publishedAt = new Date()): Promise<LoadSummary> {
  const mathSubject = await prisma.subject.upsert({
    where: { code: 'MATHEMATICS' },
    update: {},
    create: { code: 'MATHEMATICS', name: 'Mathematics', description: 'DepEd K-12 Mathematics Curriculum' },
  });
  const grade7 = await prisma.gradeLevel.upsert({ where: { level: 7 }, update: {}, create: { level: 7, label: 'Grade 7' } });
  const curriculum = await prisma.curriculum.upsert({
    where: { subjectId_gradeLevelId: { subjectId: mathSubject.id, gradeLevelId: grade7.id } },
    update: {},
    create: { subjectId: mathSubject.id, gradeLevelId: grade7.id },
  });
  const term1 = await prisma.term.upsert({
    where: { curriculumId_number: { curriculumId: curriculum.id, number: 1 } },
    update: {},
    create: { curriculumId: curriculum.id, number: 1, title: 'Term 1' },
  });

  const allUnits = [...Object.values(TERM1_UNITS), WEEKLY_UNIT];
  for (const unit of allUnits) {
    await prisma.unit.upsert({
      where: { id: unit.id },
      update: { position: unit.position, title: unit.title, description: unit.description },
      create: { id: unit.id, termId: term1.id, title: unit.title, description: unit.description, position: unit.position, isDemo: false },
    });
  }

  let practiceQuestions = 0;
  const lessons = [...buildTerm1Lessons(), ...buildTerm1WeeklyLessons()];
  for (const lesson of lessons) {
    const unitId = lesson.unit === 'weekly' ? WEEKLY_UNIT.id : TERM1_UNITS[lesson.unit].id;
    const record = await prisma.lesson.upsert({
      where: { id: lesson.id },
      update: {
        unitId,
        title: lesson.title,
        description: lesson.description,
        estimatedMinutes: lesson.estimatedMinutes,
        position: lesson.position,
        status: 'PUBLISHED',
        publishedAt,
      },
      create: {
        id: lesson.id,
        authorId,
        unitId,
        title: lesson.title,
        description: lesson.description,
        subject: mathSubject.name,
        gradeLevel: grade7.label,
        estimatedMinutes: lesson.estimatedMinutes,
        position: lesson.position,
        status: 'PUBLISHED',
        publishedAt,
      },
    });

    const competency = await prisma.competency.upsert({
      where: { code: lesson.competency.code },
      update: { title: lesson.competency.title, source: TERM1_SOURCE },
      create: {
        code: lesson.competency.code,
        title: lesson.competency.title,
        description: 'Tuklas identifier (not an official DepEd code).',
        source: TERM1_SOURCE,
      },
    });

    const skillIds = new Map<string, string>();
    for (const skill of lesson.skills) {
      const skillRecord = await prisma.skill.upsert({
        where: { code: skill.code },
        update: { name: skill.name, description: skill.description },
        create: { code: skill.code, name: skill.name, description: skill.description },
      });
      skillIds.set(skill.code, skillRecord.id);
    }

    // Everything below is keyed by its natural identity and UPDATED in place, never deleted and recreated: re-running the
    // loader on a live database must not churn ids that student records point at.
    const objectiveBySkill = new Map<string, string>();
    for (const [position, objective] of lesson.objectives.entries()) {
      const saved = await prisma.learningObjective.upsert({
        where: { lessonId_position: { lessonId: record.id, position } },
        update: { competencyId: competency.id, description: objective.description },
        create: { lessonId: record.id, competencyId: competency.id, description: objective.description, position },
      });
      for (const code of objective.skillCodes) {
        await prisma.objectiveSkill.upsert({
          where: { objectiveId_skillId: { objectiveId: saved.id, skillId: skillIds.get(code)! } },
          update: {},
          create: { objectiveId: saved.id, skillId: skillIds.get(code)! },
        });
        objectiveBySkill.set(code, saved.id);
      }
    }
    await prisma.learningObjective.deleteMany({ where: { lessonId: record.id, position: { gte: lesson.objectives.length } } });

    for (const [position, section] of lesson.sections.entries()) {
      await prisma.lessonSection.upsert({
        where: { lessonId_position: { lessonId: record.id, position } },
        update: section,
        create: { lessonId: record.id, position, ...section },
      });
    }
    await prisma.lessonSection.deleteMany({ where: { lessonId: record.id, position: { gte: lesson.sections.length } } });

    for (const entry of lesson.vocabulary) {
      await prisma.lessonVocabulary.upsert({
        where: { lessonId_term: { lessonId: record.id, term: entry.term } },
        update: { definition: entry.definition },
        create: { lessonId: record.id, ...entry },
      });
    }
    await prisma.lessonVocabulary.deleteMany({ where: { lessonId: record.id, term: { notIn: lesson.vocabulary.map((entry) => entry.term) } } });

    for (const [position, item] of lesson.checks.entries()) {
      await prisma.lessonCheck.upsert({
        where: { lessonId_position: { lessonId: record.id, position } },
        update: item,
        create: { lessonId: record.id, position, ...item },
      });
    }
    await prisma.lessonCheck.deleteMany({ where: { lessonId: record.id, position: { gte: lesson.checks.length } } });

    for (const q of lesson.bank) {
      const data = {
        lessonId: record.id,
        assessmentId: null,
        skillId: skillIds.get(q.skillCode) ?? null,
        learningObjectiveId: objectiveBySkill.get(q.skillCode) ?? null,
        position: q.position,
        question: q.question,
        options: q.options,
        correctIndex: q.correctIndex,
        explanation: q.explanation,
        skill: q.skill,
        purpose: 'REINFORCEMENT' as const,
        questionType: 'MULTIPLE_CHOICE' as const,
        difficulty: q.difficulty,
      };
      await prisma.quizQuestion.upsert({ where: { id: q.id }, update: data, create: { id: q.id, ...data } });
      practiceQuestions += 1;
    }
  }

  return { units: allUnits.length, lessons: lessons.length, practiceQuestions };
}

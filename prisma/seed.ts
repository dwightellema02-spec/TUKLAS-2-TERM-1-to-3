import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../src/server/auth';
import { buildIntegerPracticeBank, INTEGER_SKILLS } from './content/integer-practice';

dotenv.config({ path: '.env.local', override: true });

if (process.env.DB_TARGET === 'test') {
  if (!process.env.TEST_DATABASE_URL) throw new Error('DB_TARGET=test requires TEST_DATABASE_URL.');
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}

const prisma = new PrismaClient();

async function main() {
  if (process.env.ALLOW_DEMO_SEED !== 'true') {
    throw new Error('Set ALLOW_DEMO_SEED=true to create clearly labeled demo data.');
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Demo curriculum seed data is disabled in production.');
  }

  console.log('Seeding Tuklas 2.0 Phase 2 database...');

  // 1. Seed Demo Accounts: 1 Admin, 1 Teacher, 2 Students
  const defaultPassword = 'DemoPassword123!';
  const hashedPassword = await hashPassword(defaultPassword);

  // 1a. Admin
  const admin = await prisma.user.upsert({
    where: { id: 'demo-admin-account' },
    update: {
      email: 'admin-demo@tuklas.local',
      displayName: 'Tuklas Demo Administrator',
      role: 'ADMIN',
      isActive: true,
      passwordHash: hashedPassword,
    },
    create: {
      id: 'demo-admin-account',
      email: 'admin-demo@tuklas.local',
      displayName: 'Tuklas Demo Administrator',
      role: 'ADMIN',
      isActive: true,
      passwordHash: hashedPassword,
    },
  });

  // 1b. Teacher
  const teacher = await prisma.user.upsert({
    where: { id: 'demo-curriculum-author' },
    update: {
      email: 'teacher-demo@tuklas.local',
      displayName: 'Teacher Maria Santos',
      role: 'TEACHER',
      isActive: true,
      passwordHash: hashedPassword,
    },
    create: {
      id: 'demo-curriculum-author',
      email: 'teacher-demo@tuklas.local',
      displayName: 'Teacher Maria Santos',
      role: 'TEACHER',
      isActive: true,
      passwordHash: hashedPassword,
    },
  });

  await prisma.teacherProfile.upsert({
    where: { userId: teacher.id },
    update: {
      department: 'Science & Mathematics',
      title: 'Master Teacher I',
      specialization: 'Junior High School Mathematics',
      schoolName: 'Rizal National High School',
    },
    create: {
      userId: teacher.id,
      department: 'Science & Mathematics',
      title: 'Master Teacher I',
      specialization: 'Junior High School Mathematics',
      schoolName: 'Rizal National High School',
      bio: 'Junior high school math educator passionate about mastery-based learning.',
    },
  });

  // 1c. Student 1: Juan
  const student1 = await prisma.user.upsert({
    where: { id: 'demo-student-juan' },
    update: {
      email: 'student-juan@tuklas.local',
      displayName: 'Juan Dela Cruz',
      role: 'STUDENT',
      isActive: true,
      passwordHash: hashedPassword,
    },
    create: {
      id: 'demo-student-juan',
      email: 'student-juan@tuklas.local',
      displayName: 'Juan Dela Cruz',
      role: 'STUDENT',
      isActive: true,
      passwordHash: hashedPassword,
    },
  });

  await prisma.studentProfile.upsert({
    where: { userId: student1.id },
    update: {
      studentNumber: 'STU-2026-001',
      gradeLevel: 'Grade 7',
      section: 'Sampaguita',
      schoolName: 'Rizal National High School',
    },
    create: {
      userId: student1.id,
      studentNumber: 'STU-2026-001',
      gradeLevel: 'Grade 7',
      section: 'Sampaguita',
      schoolName: 'Rizal National High School',
      bio: 'Enthusiastic Grade 7 learner interested in science and math.',
    },
  });

  // 1d. Student 2: Maria
  const student2 = await prisma.user.upsert({
    where: { id: 'demo-student-maria' },
    update: {
      email: 'student-maria@tuklas.local',
      displayName: 'Maria Clara',
      role: 'STUDENT',
      isActive: true,
      passwordHash: hashedPassword,
    },
    create: {
      id: 'demo-student-maria',
      email: 'student-maria@tuklas.local',
      displayName: 'Maria Clara',
      role: 'STUDENT',
      isActive: true,
      passwordHash: hashedPassword,
    },
  });

  await prisma.studentProfile.upsert({
    where: { userId: student2.id },
    update: {
      studentNumber: 'STU-2026-002',
      gradeLevel: 'Grade 7',
      section: 'Sampaguita',
      schoolName: 'Rizal National High School',
    },
    create: {
      userId: student2.id,
      studentNumber: 'STU-2026-002',
      gradeLevel: 'Grade 7',
      section: 'Sampaguita',
      schoolName: 'Rizal National High School',
      bio: 'Grade 7 student preparing for national assessments.',
    },
  });

  console.log(`Seeded accounts: Admin (${admin.email}), Teacher (${teacher.email}), Students (${student1.email}, ${student2.email})`);

  // 2. Curriculum Catalog
  const subjects = [
    { code: 'MATHEMATICS', name: 'Mathematics', description: 'DepEd K-12 Mathematics Curriculum' },
    { code: 'SCIENCE', name: 'Science', description: 'DepEd K-12 Integrated Science Curriculum' },
    { code: 'ENGLISH', name: 'English', description: 'DepEd K-12 English Language Arts' },
  ];
  const grades = [7, 8, 9, 10];

  for (const subjectData of subjects) {
    const subject = await prisma.subject.upsert({
      where: { code: subjectData.code },
      update: { name: subjectData.name, description: subjectData.description },
      create: subjectData,
    });

    for (const level of grades) {
      const gradeLevel = await prisma.gradeLevel.upsert({
        where: { level },
        update: { label: `Grade ${level}` },
        create: { level, label: `Grade ${level}` },
      });
      const curriculum = await prisma.curriculum.upsert({
        where: {
          subjectId_gradeLevelId: {
            subjectId: subject.id,
            gradeLevelId: gradeLevel.id,
          },
        },
        update: {},
        create: { subjectId: subject.id, gradeLevelId: gradeLevel.id },
      });

      for (const number of [1, 2, 3]) {
        await prisma.term.upsert({
          where: { curriculumId_number: { curriculumId: curriculum.id, number } },
          update: { title: `Term ${number}` },
          create: {
            curriculumId: curriculum.id,
            number,
            title: `Term ${number}`,
          },
        });
      }
    }
  }

  // 3. Foundation Demo Data (Required by existing test suite)
  const mathSubject = await prisma.subject.findUniqueOrThrow({
    where: { code: 'MATHEMATICS' },
  });
  const grade7 = await prisma.gradeLevel.findUniqueOrThrow({
    where: { level: 7 },
  });
  const mathCurriculum = await prisma.curriculum.findUniqueOrThrow({
    where: {
      subjectId_gradeLevelId: {
        subjectId: mathSubject.id,
        gradeLevelId: grade7.id,
      },
    },
  });
  const term1 = await prisma.term.findUniqueOrThrow({
    where: { curriculumId_number: { curriculumId: mathCurriculum.id, number: 1 } },
  });

  const demoUnit = await prisma.unit.upsert({
    where: { id: 'demo-unit-curriculum-foundation' },
    update: { position: 0 },
    create: {
      id: 'demo-unit-curriculum-foundation',
      termId: term1.id,
      title: 'DEMO ONLY — Curriculum structure sample (not official)',
      description:
        'A clearly labeled development record showing how Tuklas links curriculum data.',
      position: 0,
      isDemo: true,
    },
  });

  const demoLesson = await prisma.lesson.upsert({
    where: { id: 'demo-lesson-curriculum-foundation' },
    update: {
      unitId: demoUnit.id,
      status: 'PUBLISHED',
      publishedAt: new Date('2026-01-01T00:00:00.000Z'),
    },
    create: {
      id: 'demo-lesson-curriculum-foundation',
      authorId: teacher.id,
      unitId: demoUnit.id,
      title: 'DEMO ONLY — How lesson data connects',
      subject: mathSubject.name,
      gradeLevel: grade7.label,
      status: 'PUBLISHED',
      publishedAt: new Date('2026-01-01T00:00:00.000Z'),
    },
  });

  const demoCompetency = await prisma.competency.upsert({
    where: { code: 'DEMO-CURRICULUM-LINK' },
    update: {},
    create: {
      code: 'DEMO-CURRICULUM-LINK',
      title: 'DEMO ONLY — Example competency link',
      description: 'Demonstrates the data relationship; not an official competency.',
      source: 'Tuklas development sample',
    },
  });

  const demoObjective = await prisma.learningObjective.upsert({
    where: { id: 'demo-objective-curriculum-foundation' },
    update: { lessonId: demoLesson.id, competencyId: demoCompetency.id },
    create: {
      id: 'demo-objective-curriculum-foundation',
      lessonId: demoLesson.id,
      competencyId: demoCompetency.id,
      description: 'DEMO ONLY — Identify how a question links to a lesson target.',
      position: 0,
    },
  });

  const demoSkill = await prisma.skill.upsert({
    where: { code: 'DEMO-TRACEABILITY' },
    update: {},
    create: {
      code: 'DEMO-TRACEABILITY',
      name: 'DEMO ONLY — Learning data traceability',
      description: 'Development sample only; not an official curriculum skill.',
    },
  });

  await prisma.objectiveSkill.upsert({
    where: {
      objectiveId_skillId: { objectiveId: demoObjective.id, skillId: demoSkill.id },
    },
    update: {},
    create: { objectiveId: demoObjective.id, skillId: demoSkill.id },
  });

  await prisma.lessonContent.upsert({
    where: {
      lessonId_position: { lessonId: demoLesson.id, position: 0 },
    },
    update: {},
    create: {
      lessonId: demoLesson.id,
      position: 0,
      kind: 'EXPLANATION',
      heading: 'Development sample',
      body: 'This demo record illustrates structured content linked to a learning objective.',
    },
  });

  const demoAssessment = await prisma.assessment.upsert({
    where: { id: 'demo-assessment-curriculum-foundation' },
    update: {},
    create: {
      id: 'demo-assessment-curriculum-foundation',
      lessonId: demoLesson.id,
      title: 'DEMO ONLY — Traceability sample',
      description: 'A development example, not an instructional assessment.',
      passingScore: 70.0,
      status: 'PUBLISHED',
    },
  });

  await prisma.quizQuestion.upsert({
    where: { id: 'demo-question-curriculum-foundation' },
    update: {
      learningObjectiveId: demoObjective.id,
      skillId: demoSkill.id,
      assessmentId: demoAssessment.id,
      questionType: 'MULTIPLE_CHOICE',
      difficulty: 'MEDIUM',
    },
    create: {
      id: 'demo-question-curriculum-foundation',
      lessonId: demoLesson.id,
      assessmentId: demoAssessment.id,
      learningObjectiveId: demoObjective.id,
      skillId: demoSkill.id,
      position: 0,
      question: 'DEMO ONLY — Which record identifies the target this question checks?',
      options: ['Learning objective', 'User session', 'Source URL', 'Unit position'],
      correctIndex: 0,
      explanation: 'Demo only: the question points to a learning objective.',
      purpose: 'DIAGNOSTIC',
      questionType: 'MULTIPLE_CHOICE',
      difficulty: 'MEDIUM',
    },
  });

  // 4. Seed Real Curriculum Unit: Number and Number Sense (Unit 2, position: 2)
  const numbersUnit = await prisma.unit.upsert({
    where: { id: 'unit-math-7-term1-numbers' },
    update: { position: 2 },
    create: {
      id: 'unit-math-7-term1-numbers',
      termId: term1.id,
      title: 'Number and Number Sense',
      description: 'Operations on integers, rational numbers, and real-world mathematical problem solving.',
      position: 2,
      isDemo: false,
    },
  });

  const integersLesson = await prisma.lesson.upsert({
    where: { id: 'lesson-math-7-integers' },
    update: {
      unitId: numbersUnit.id,
      status: 'PUBLISHED',
      publishedAt: new Date('2026-02-01T00:00:00.000Z'),
    },
    create: {
      id: 'lesson-math-7-integers',
      authorId: teacher.id,
      unitId: numbersUnit.id,
      title: 'Operations on Integers',
      description: 'Master addition, subtraction, multiplication, and division of positive and negative integers.',
      subject: mathSubject.name,
      gradeLevel: grade7.label,
      estimatedMinutes: 45,
      position: 0,
      status: 'PUBLISHED',
      publishedAt: new Date('2026-02-01T00:00:00.000Z'),
    },
  });

  // Add YouTube Educational Video Reference
  await prisma.lessonSource.deleteMany({ where: { lessonId: integersLesson.id } });
  await prisma.lessonSource.create({
    data: {
      lessonId: integersLesson.id,
      provider: 'youtube',
      url: 'https://www.youtube.com/watch?v=kYJv8y-9q5U',
      title: 'DepEd TV: Grade 7 Mathematics - Operations on Integers',
      description: 'Official DepEd TV broadcast covering real-world applications of integer operations.',
      videoId: 'kYJv8y-9q5U',
      thumbnailUrl: 'https://img.youtube.com/vi/kYJv8y-9q5U/hqdefault.jpg',
      channelTitle: 'DepEd Philippines Official',
      position: 0,
      isActive: true,
    },
  });

  // Add Lesson Content Sections
  await prisma.lessonSection.deleteMany({ where: { lessonId: integersLesson.id } });
  await prisma.lessonSection.createMany({
    data: [
      {
        lessonId: integersLesson.id,
        position: 0,
        heading: '1. What Are Integers?',
        sourceExplanation: 'Integers are the set of whole numbers and their opposites, including zero: {..., -3, -2, -1, 0, 1, 2, 3, ...}.',
        aiExplanation: 'Think of integers as points on a horizontal line. Positive numbers move to the right (gain/elevation), negative numbers move to the left (loss/depth).',
      },
      {
        lessonId: integersLesson.id,
        position: 1,
        heading: '2. Addition and Subtraction Rules',
        sourceExplanation: 'When adding integers with the same sign, add absolute values and keep the sign. For opposite signs, subtract the smaller absolute value from the larger and take the sign of the larger.',
        aiExplanation: 'Pro tip: Subtracting a negative is the exact same as adding a positive! E.g., 5 - (-3) = 5 + 3 = 8.',
      },
    ],
  });

  // Add Vocabulary
  await prisma.lessonVocabulary.deleteMany({ where: { lessonId: integersLesson.id } });
  await prisma.lessonVocabulary.createMany({
    data: [
      {
        lessonId: integersLesson.id,
        term: 'Integer',
        definition: 'A whole number from the set of positive, negative, or zero numbers.',
      },
      {
        lessonId: integersLesson.id,
        term: 'Absolute Value',
        definition: 'The distance of a number from zero on a number line, denoted by |x| and always non-negative.',
      },
    ],
  });

  // Add Formative Comprehension Checks
  await prisma.lessonCheck.deleteMany({ where: { lessonId: integersLesson.id } });
  await prisma.lessonCheck.createMany({
    data: [
      {
        lessonId: integersLesson.id,
        position: 0,
        question: 'What is the value of (-8) + 15?',
        options: ['-23', '7', '-7', '23'],
        correctIndex: 1,
        explanation: 'Different signs: subtract absolute values (15 - 8 = 7) and keep the sign of the larger magnitude (positive 7).',
        purpose: 'INITIAL',
      },
      {
        lessonId: integersLesson.id,
        position: 1,
        question: 'What is (-6) * (-4)?',
        options: ['-24', '24', '-10', '10'],
        correctIndex: 1,
        explanation: 'Multiplying two negative numbers always yields a positive product: (-6) * (-4) = +24.',
        purpose: 'REINFORCEMENT',
      },
    ],
  });

  // Add Persistent Assessment with Questions
  const integersAssessment = await prisma.assessment.upsert({
    where: { id: 'assessment-math-7-integers' },
    update: {
      passingScore: 75.0,
      status: 'PUBLISHED',
    },
    create: {
      id: 'assessment-math-7-integers',
      lessonId: integersLesson.id,
      title: 'Integers & Real Numbers Assessment',
      description: 'Demonstrate competency in integer arithmetic and absolute value interpretation.',
      passingScore: 75.0,
      timeLimitMinutes: 30,
      status: 'PUBLISHED',
    },
  });

  const integerQuestions = [
    {
      id: 'quiz-q-integers-1',
      lessonId: integersLesson.id,
      assessmentId: integersAssessment.id,
      position: 0,
      question: 'Simplify: (-14) - (-9)',
      options: ['-23', '-5', '5', '23'],
      correctIndex: 1,
      explanation: '(-14) - (-9) = -14 + 9 = -5.',
      purpose: 'MASTERY' as const,
      questionType: 'MULTIPLE_CHOICE' as const,
      difficulty: 'MEDIUM' as const,
    },
    {
      id: 'quiz-q-integers-2',
      lessonId: integersLesson.id,
      assessmentId: integersAssessment.id,
      position: 1,
      question: 'What is the absolute value of -38?',
      options: ['-38', '38', '0', '1'],
      correctIndex: 1,
      explanation: 'The absolute value represents distance from 0, so |-38| = 38.',
      purpose: 'MASTERY' as const,
      questionType: 'MULTIPLE_CHOICE' as const,
      difficulty: 'EASY' as const,
    },
    {
      id: 'quiz-q-integers-3',
      lessonId: integersLesson.id,
      assessmentId: integersAssessment.id,
      position: 2,
      question: 'Calculate: (-4) * 6 + (-5)',
      options: ['-29', '-19', '19', '29'],
      correctIndex: 0,
      explanation: 'Follow order of operations (PEMDAS): (-4) * 6 = -24. Then -24 + (-5) = -29.',
      purpose: 'APPLICATION' as const,
      questionType: 'MULTIPLE_CHOICE' as const,
      difficulty: 'HARD' as const,
    },
    {
      id: 'quiz-q-integers-4',
      lessonId: integersLesson.id,
      assessmentId: integersAssessment.id,
      position: 3,
      question: 'Which of the following is true about zero?',
      options: [
        'It is a positive integer',
        'It is a negative integer',
        'It is neither positive nor negative',
        'It is not an integer',
      ],
      correctIndex: 2,
      explanation: 'Zero is an integer, but it is neutral (neither positive nor negative).',
      purpose: 'INITIAL' as const,
      questionType: 'MULTIPLE_CHOICE' as const,
      difficulty: 'EASY' as const,
    },
  ];

  for (const q of integerQuestions) {
    await prisma.quizQuestion.upsert({
      where: { id: q.id },
      update: {
        lessonId: q.lessonId,
        assessmentId: q.assessmentId,
        position: q.position,
        question: q.question,
        options: q.options,
        correctIndex: q.correctIndex,
        explanation: q.explanation,
        purpose: q.purpose,
        questionType: q.questionType,
        difficulty: q.difficulty,
      },
      create: q,
    });
  }

  // Practice bank: verified integer questions NOT attached to any assessment, so practice
  // never reuses (or leaks) assessment items. Answers are computed, see integer-practice.ts.
  const skillIdByCode = new Map<string, string>();
  for (const skill of Object.values(INTEGER_SKILLS)) {
    const record = await prisma.skill.upsert({
      where: { code: skill.code },
      update: { name: skill.name, description: skill.description },
      create: { code: skill.code, name: skill.name, description: skill.description },
    });
    skillIdByCode.set(skill.code, record.id);
  }

  for (const q of buildIntegerPracticeBank()) {
    const data = {
      lessonId: integersLesson.id,
      assessmentId: null,
      skillId: skillIdByCode.get(q.skillCode) ?? null,
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
    await prisma.quizQuestion.upsert({
      where: { id: q.id },
      update: data,
      create: { id: q.id, ...data },
    });
  }

  console.log('Phase 2 seed completed successfully with real curriculum, lesson, and assessment data.');
}

main()
  .catch((error) => {
    console.error('Curriculum seed failed.');
    console.error(error instanceof Error ? error.message : 'Unknown error');
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

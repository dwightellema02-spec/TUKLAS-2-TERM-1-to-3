/**
 * Tuklas 2.0 — Shared Domain Type Definitions
 *
 * Core entities for the learning ecosystem supporting Students, Teachers,
 * Curriculum, Lessons, Practice, Assessments, Progress, Mastery, Mistakes, and AI.
 */

export type UserRole = 'STUDENT' | 'TEACHER' | 'ADMIN';

export type PublicUser = {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
  isActive?: boolean;
  createdAt?: Date | string;
};

export type StudentProfile = {
  id: string;
  userId: string;
  studentNumber: string | null;
  gradeLevel: string | null;
  section: string | null;
  schoolName: string | null;
  bio: string | null;
  createdAt?: Date | string;
  updatedAt?: Date | string;
};

export type TeacherProfile = {
  id: string;
  userId: string;
  department: string | null;
  title: string | null;
  specialization: string | null;
  schoolName: string | null;
  bio: string | null;
  createdAt?: Date | string;
  updatedAt?: Date | string;
};

export type UserWithProfile = PublicUser & {
  studentProfile?: StudentProfile | null;
  teacherProfile?: TeacherProfile | null;
};

/* ---------------- Curriculum Hierarchy ---------------- */

export type Subject = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
};

export type GradeLevel = {
  id: string;
  level: number;
  label: string;
  createdAt: Date | string;
  updatedAt: Date | string;
};

export type Curriculum = {
  id: string;
  subjectId: string;
  gradeLevelId: string;
  subject?: Subject;
  gradeLevel?: GradeLevel;
  terms?: Term[];
  createdAt: Date | string;
};

export type Term = {
  id: string;
  curriculumId: string;
  number: number;
  title: string;
  units?: Unit[];
  createdAt: Date | string;
};

export type Unit = {
  id: string;
  termId: string;
  title: string;
  description: string | null;
  position: number;
  isDemo: boolean;
  lessons?: LessonSummary[];
  createdAt: Date | string;
  updatedAt: Date | string;
};

/* ---------------- Lessons & Content ---------------- */

export type LessonStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';

export type LessonContentKind =
  | 'EXPLANATION'
  | 'EXAMPLE'
  | 'CALLOUT'
  | 'SUMMARY'
  | 'TEXT'
  | 'VIDEO'
  | 'IMAGE'
  | 'DOCUMENT'
  | 'INTERACTIVE';

export type LessonProgressStatus =
  | 'NOT_STARTED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'NEEDS_PRACTICE'
  | 'MASTERED';

export type LessonSummary = {
  id: string;
  title: string;
  description?: string | null;
  subject: string;
  gradeLevel: string;
  position?: number;
  estimatedMinutes: number | null;
  status: LessonStatus;
  createdAt?: Date | string;
  updatedAt?: Date | string;
  author?: {
    id: string;
    displayName: string;
    role: UserRole;
  };
};

export type LessonSectionType =
  | 'TEXT'
  | 'EXAMPLE'
  | 'VIDEO'
  | 'ACTIVITY'
  | 'CHECK'
  | 'SUMMARY';

export type WorkedExampleStep = {
  step: number;
  action: string;
  explanation: string;
};

export type WorkedExampleMetadata = {
  problem: string;
  steps: WorkedExampleStep[];
  finalAnswer: string;
};

export type LessonSection = {
  id: string;
  lessonId: string;
  position: number;
  heading: string;
  type?: LessonSectionType | string;
  content?: string | null;
  metadata?: WorkedExampleMetadata | Record<string, unknown> | null;
  sourceExplanation?: string | null;
  aiExplanation?: string | null;
  createdAt?: Date | string;
  updatedAt?: Date | string;
};

export type LessonContent = {
  id: string;
  lessonId: string;
  position: number;
  kind: LessonContentKind;
  heading: string | null;
  body: string;
  mediaUrl?: string | null;
  metadata?: unknown;
};

export type LessonVocabulary = {
  id: string;
  lessonId: string;
  term: string;
  definition: string;
};

export type LessonSource = {
  id: string;
  lessonId: string;
  provider: string;
  url: string;
  title: string;
  description: string | null;
  videoId?: string | null;
  thumbnailUrl?: string | null;
  channelTitle?: string | null;
  position?: number;
  isActive?: boolean;
};

export type LessonProgress = {
  id: string;
  studentId: string;
  lessonId: string;
  status: LessonProgressStatus;
  latestScore?: number | null;
  bestScore?: number | null;
  practiceAttempts: number;
  assessmentAttempts: number;
  masteryScore: number;
  startedAt: Date | string;
  completedAt: Date | string | null;
  lastActivityAt: Date | string;
  updatedAt: Date | string;
};

/* ---------------- Competencies, Objectives & Skills ---------------- */

export type Competency = {
  id: string;
  code: string | null;
  title: string;
  description: string | null;
  source: string | null;
};

export type Skill = {
  id: string;
  code: string | null;
  name: string;
  description: string | null;
};

export type LearningObjective = {
  id: string;
  lessonId: string;
  competencyId: string | null;
  code: string | null;
  description: string;
  position: number;
  competency?: Competency | null;
  skills?: { skill: Skill }[];
};

/* ---------------- Questions, Checks & Assessments ---------------- */

export type QuestionType =
  | 'MULTIPLE_CHOICE'
  | 'TRUE_FALSE'
  | 'SHORT_ANSWER'
  | 'NUMERIC';

export type QuestionPurpose =
  | 'INITIAL'
  | 'DIAGNOSTIC'
  | 'REINFORCEMENT'
  | 'APPLICATION'
  | 'MASTERY';

export type QuestionBase = {
  id: string;
  question: string;
  questionType?: QuestionType;
  difficulty?: string;
  options: string[];
  correctIndex?: number;
  correctAnswer?: string | null;
  explanation?: string;
  skill?: string | null;
  purpose?: QuestionPurpose;
  learningObjectiveId?: string | null;
  skillId?: string | null;
};

export type LessonCheck = QuestionBase & {
  lessonId: string;
  position: number;
};

export type QuizQuestion = QuestionBase & {
  lessonId: string;
  position: number;
  assessmentId?: string | null;
};

export type Assessment = {
  id: string;
  lessonId: string;
  title: string;
  description: string | null;
  passingScore: number;
  timeLimitMinutes?: number | null;
  status: LessonStatus;
  questions?: QuizQuestion[];
  createdAt: Date | string;
  updatedAt: Date | string;
};

export type AssessmentAnswer = {
  id: string;
  attemptId: string;
  questionId: string;
  selectedIndex?: number | null;
  textAnswer?: string | null;
  numericAnswer?: number | null;
  isCorrect: boolean;
  score: number;
  answeredAt: Date | string;
};

export type QuizAttempt = {
  id: string;
  studentId: string;
  lessonId: string;
  assessmentId: string | null;
  correct: number;
  total: number;
  score: number;
  passed: boolean;
  answers?: AssessmentAnswer[];
  startedAt: Date | string;
  completedAt: Date | string | null;
};

/* ---------------- Practice & Answers ---------------- */

export type PracticeType = 'PRACTICE' | 'LESSON_QUIZ';

export type PracticeDifficulty = 'Easy' | 'Medium' | 'Hard';

export type PracticeSession = {
  id: string;
  studentId: string;
  lessonId: string | null;
  subject: string;
  topic: string;
  difficulty: PracticeDifficulty | string;
  type: PracticeType;
  total: number;
  correct: number;
  startedAt: Date | string;
  completedAt: Date | string | null;
};

export type PracticeQuestion = {
  id: string;
  sessionId: string;
  question: string;
  questionType?: QuestionType;
  options: string[];
  correctIndex: number;
  correctAnswer?: string | null;
  skill?: string | null;
  explanation?: string | null;
  learningObjective?: string | null;
  difficulty: PracticeDifficulty | string;
  purpose: QuestionPurpose;
  createdAt: Date | string;
};

export type PracticeAnswer = {
  id: string;
  sessionId: string;
  questionId: string | null;
  question: string;
  options: string[];
  correctIndex: number;
  selectedIndex: number;
  correct: boolean;
  skill?: string | null;
  explanation?: string | null;
  answeredAt: Date | string;
};

/* ---------------- Mistakes ---------------- */

export type MistakeRecord = {
  id: string;
  studentId: string;
  lessonId?: string | null;
  questionId?: string | null;
  assessmentAttemptId?: string | null;
  practiceSessionId?: string | null;
  submittedAnswer: string;
  correctReference?: string | null;
  category?: string | null;
  analysis?: string | null;
  resolved: boolean;
  createdAt: Date | string;
  resolvedAt?: Date | string | null;
};

/* ---------------- AI Interactions ---------------- */

export type AIRequestType =
  | 'TUTOR'
  | 'QUESTION_GENERATION'
  | 'MISTAKE_ANALYSIS'
  | 'LESSON_DRAFT'
  | 'TRANSCRIPT_ANALYSIS';

export type AIInteraction = {
  id: string;
  userId: string;
  lessonId?: string | null;
  requestType: AIRequestType;
  model: string;
  promptTokens?: number | null;
  outputTokens?: number | null;
  latencyMs?: number | null;
  success: boolean;
  metadata?: unknown;
  createdAt: Date | string;
};

/* ---------------- Mastery & Research Metrics ---------------- */

export type MasteryRecord = {
  id: string;
  studentId: string;
  subject: string;
  topic: string;
  mastery: number; // 0 - 100
  understanding: number; // 0 - 100
  accuracy: number; // 0 - 100
  application: number; // 0 - 100
  consistency: number; // 0 - 100
  updatedAt: Date | string;
};

export type MistakeAnalysis = {
  understood: string;
  misunderstood: string;
  misconception: string;
  simpleExplanation: string;
};

/* ---------------- AI Tutor & Conversations ---------------- */

export type ChatRole = 'user' | 'assistant';

export type ChatMessage = {
  id: string;
  conversationId: string;
  role: ChatRole;
  content: string;
  createdAt: Date | string;
};

export type ChatConversation = {
  id: string;
  studentId: string;
  lessonId: string | null;
  messages?: ChatMessage[];
  createdAt: Date | string;
  updatedAt: Date | string;
};

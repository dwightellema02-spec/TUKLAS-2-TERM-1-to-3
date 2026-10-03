import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { db } from '../src/server/db';
import { createSessionToken, toPublicUser } from '../src/server/auth';
import { GET as getCurriculum } from '../src/app/api/curriculum/route';
import { POST as createLesson } from '../src/app/api/lessons/route';
import {
  GET as getLesson,
  PATCH as updateLesson,
} from '../src/app/api/lessons/[id]/route';
import { POST as publishLesson } from '../src/app/api/lessons/[id]/publish/route';
import { GET as previewLesson } from '../src/app/api/lessons/[id]/preview/route';
import { POST as addSection } from '../src/app/api/lessons/[id]/sections/route';
import {
  PATCH as updateSection,
  DELETE as deleteSection,
} from '../src/app/api/lessons/[id]/sections/[sectionId]/route';
import { POST as reorderSections } from '../src/app/api/lessons/[id]/sections/reorder/route';
import { POST as addCheck } from '../src/app/api/lessons/[id]/checks/route';
import { POST as attachVideo } from '../src/app/api/lessons/[id]/videos/route';
import { DELETE as removeVideo } from '../src/app/api/lessons/[id]/videos/[videoId]/route';
import { parseYouTubeUrl } from '../src/lib/youtube';
import { sanitizeText } from '../src/lib/sanitizer';

const emailFor = (role: string) => `p5-test-${role}-${randomUUID()}@example.com`;

async function authHeaderFor(user: {
  id: string;
  email: string;
  displayName: string;
  role: 'STUDENT' | 'TEACHER' | 'ADMIN';
}) {
  const token = await createSessionToken(toPublicUser(user));
  return { Cookie: `tuklas_session=${token}` };
}

afterEach(async () => {
  const testUsers = await db.user.findMany({
    where: { email: { startsWith: 'p5-test-' } },
    select: { id: true },
  });
  const userIds = testUsers.map((u) => u.id);

  if (userIds.length > 0) {
    const testLessons = await db.lesson.findMany({
      where: { authorId: { in: userIds } },
      select: { id: true },
    });
    const lessonIds = testLessons.map((l) => l.id);

    if (lessonIds.length > 0) {
      await db.lessonSection.deleteMany({ where: { lessonId: { in: lessonIds } } });
      await db.lessonCheck.deleteMany({ where: { lessonId: { in: lessonIds } } });
      await db.lessonSource.deleteMany({ where: { lessonId: { in: lessonIds } } });
      await db.lessonContent.deleteMany({ where: { lessonId: { in: lessonIds } } });
      await db.lessonProgress.deleteMany({ where: { lessonId: { in: lessonIds } } });
      await db.lesson.deleteMany({ where: { id: { in: lessonIds } } });
    }

    await db.authSession.deleteMany({ where: { userId: { in: userIds } } });
    await db.lessonProgress.deleteMany({ where: { studentId: { in: userIds } } });
    await db.user.deleteMany({ where: { id: { in: userIds } } });
  }
});

describe('Phase 5 — Interactive Lesson Studio & Multi-Section Authoring', () => {
  describe('YouTube URL Validation & Parsing', () => {
    it('validates standard, short, and embed YouTube URLs, and rejects malicious hosts', () => {
      // Valid URLs
      const watchUrl = parseYouTubeUrl('https://www.youtube.com/watch?v=kYJv8y-9q5U');
      expect(watchUrl.isValid).toBe(true);
      expect(watchUrl.videoId).toBe('kYJv8y-9q5U');
      expect(watchUrl.canonicalUrl).toBe('https://www.youtube.com/watch?v=kYJv8y-9q5U');

      const shortUrl = parseYouTubeUrl('https://youtu.be/kYJv8y-9q5U');
      expect(shortUrl.isValid).toBe(true);
      expect(shortUrl.videoId).toBe('kYJv8y-9q5U');

      const embedUrl = parseYouTubeUrl('https://www.youtube.com/embed/kYJv8y-9q5U');
      expect(embedUrl.isValid).toBe(true);
      expect(embedUrl.videoId).toBe('kYJv8y-9q5U');

      // Invalid & Malicious URLs
      expect(parseYouTubeUrl('https://vimeo.com/123456789').isValid).toBe(false);
      expect(parseYouTubeUrl('javascript:alert(1)').isValid).toBe(false);
      expect(parseYouTubeUrl('https://malicious-site.com/watch?v=kYJv8y-9q5U').isValid).toBe(false);
      expect(parseYouTubeUrl('https://youtube.com/watch?v=too_short').isValid).toBe(false);
    });
  });

  describe('Content Sanitization & Mathematical Expressions', () => {
    it('sanitizes malicious script tags and event handlers while preserving mathematical formulas', () => {
      const malicious = '<script>alert("xss")</script><img src=x onerror=alert(1)>Solve for $x$: $2x + 3 = 11$ and evaluate $3/4 + 1/2$.';
      const clean = sanitizeText(malicious);

      expect(clean).not.toContain('<script>');
      expect(clean).not.toContain('onerror=');
      expect(clean).toContain('$2x + 3 = 11$');
      expect(clean).toContain('$3/4 + 1/2$');
    });
  });

  describe('Lesson Creation & Initial Draft State', () => {
    it('creates a new lesson in DRAFT mode under an existing unit and forbids unauthorized students', async () => {
      const teacher = await db.user.create({
        data: {
          email: emailFor('teacher'),
          passwordHash: 'hash-p5',
          role: 'TEACHER',
          displayName: 'Teacher Author',
        },
      });

      const student = await db.user.create({
        data: {
          email: emailFor('student'),
          passwordHash: 'hash-p5',
          role: 'STUDENT',
          displayName: 'Curious Student',
        },
      });

      const unit = await db.unit.findFirstOrThrow({
        include: { term: { include: { curriculum: { include: { subject: true, gradeLevel: true } } } } },
      });

      // 1. Student attempts to create lesson -> 403 Forbidden
      const studentRes = await createLesson(
        new Request('http://localhost/api/lessons', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            ...(await authHeaderFor(student)),
          },
          body: JSON.stringify({
            title: 'Unauthorized Student Lesson',
            unitId: unit.id,
          }),
        }),
      );
      expect(studentRes.status).toBe(403);

      // 2. Teacher creates lesson -> 201 Created in DRAFT status
      const teacherRes = await createLesson(
        new Request('http://localhost/api/lessons', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            ...(await authHeaderFor(teacher)),
          },
          body: JSON.stringify({
            title: 'Phase 5 Linear Equations Lesson',
            description: 'A structured lesson covering solving one-variable linear equations.',
            unitId: unit.id,
            subject: unit.term.curriculum.subject.name,
            gradeLevel: unit.term.curriculum.gradeLevel.label,
            estimatedMinutes: 40,
            sections: [
              {
                position: 0,
                heading: 'Introduction to Equations',
                type: 'TEXT',
                content: 'An equation states that two mathematical expressions are equal: $2x + 3 = 11$.',
              },
            ],
          }),
        }),
      );

      expect(teacherRes.status).toBe(201);
      const payload = await teacherRes.json();
      const createdLesson = payload.data.lesson;

      expect(createdLesson.title).toBe('Phase 5 Linear Equations Lesson');
      expect(createdLesson.status).toBe('DRAFT');
      expect(createdLesson.sections.length).toBe(1);
      expect(createdLesson.sections[0].type).toBe('TEXT');

      // 3. Verify Draft is HIDDEN from student curriculum view
      const studentCurriculumRes = await getCurriculum(
        new Request('http://localhost/api/curriculum', {
          headers: await authHeaderFor(student),
        }),
      );
      const studentCurriculumData = await studentCurriculumRes.json();
      const curriculumStr = JSON.stringify(studentCurriculumData);
      expect(curriculumStr).not.toContain('Phase 5 Linear Equations Lesson');
    });
  });

  describe('Multi-Section Authoring & Worked Examples', () => {
    it('authors multiple sections, worked examples, and transactionally reorders them without collision', async () => {
      const teacher = await db.user.create({
        data: {
          email: emailFor('teacher'),
          passwordHash: 'hash-p5',
          role: 'TEACHER',
          displayName: 'Math Teacher Alpha',
        },
      });

      const unit = await db.unit.findFirstOrThrow({
        include: { term: { include: { curriculum: { include: { subject: true, gradeLevel: true } } } } },
      });

      // Create base draft lesson
      const lesson = await db.lesson.create({
        data: {
          title: 'Integers & Equations Masterclass',
          unitId: unit.id,
          subject: unit.term.curriculum.subject.name,
          gradeLevel: unit.term.curriculum.gradeLevel.label,
          authorId: teacher.id,
          status: 'DRAFT',
        },
      });

      // 1. Add Text Section via API
      const sec1Res = await addSection(
        new Request(`http://localhost/api/lessons/${lesson.id}/sections`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            ...(await authHeaderFor(teacher)),
          },
          body: JSON.stringify({
            heading: '1. Variables & Constants',
            type: 'TEXT',
            content: 'In the equation $ax + b = c$, $a$ and $b$ are constants and $x$ is the unknown variable.',
            position: 0,
          }),
        }),
        { params: Promise.resolve({ id: lesson.id }) },
      );
      expect(sec1Res.status).toBe(201);
      const sec1Data = await sec1Res.json();
      const section1Id = sec1Data.data.section.id;

      // 2. Add Worked Example Section with Step-by-Step Metadata
      const sec2Res = await addSection(
        new Request(`http://localhost/api/lessons/${lesson.id}/sections`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            ...(await authHeaderFor(teacher)),
          },
          body: JSON.stringify({
            heading: '2. Worked Example: Linear Equation',
            type: 'EXAMPLE',
            content: 'Step-by-step resolution of $2x + 3 = 11$.',
            position: 1,
            metadata: {
              problem: 'Solve for x: $2x + 3 = 11$',
              steps: [
                { step: 1, action: 'Subtract 3 from both sides', explanation: '$2x = 11 - 3 \\Rightarrow 2x = 8$' },
                { step: 2, action: 'Divide both sides by 2', explanation: '$x = 8 / 2 \\Rightarrow x = 4$' },
              ],
              finalAnswer: '$x = 4$',
            },
          }),
        }),
        { params: Promise.resolve({ id: lesson.id }) },
      );
      expect(sec2Res.status).toBe(201);
      const sec2Data = await sec2Res.json();
      const section2Id = sec2Data.data.section.id;

      // 3. Update Section 1
      const updateSecRes = await updateSection(
        new Request(`http://localhost/api/lessons/${lesson.id}/sections/${section1Id}`, {
          method: 'PATCH',
          headers: {
            'content-type': 'application/json',
            ...(await authHeaderFor(teacher)),
          },
          body: JSON.stringify({
            heading: '1. Variables, Coefficients & Constants',
          }),
        }),
        { params: Promise.resolve({ id: lesson.id, sectionId: section1Id }) },
      );
      expect(updateSecRes.status).toBe(200);

      // 4. Reorder Sections (swap section 1 and 2)
      const reorderRes = await reorderSections(
        new Request(`http://localhost/api/lessons/${lesson.id}/sections/reorder`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            ...(await authHeaderFor(teacher)),
          },
          body: JSON.stringify({
            sectionIds: [section2Id, section1Id],
          }),
        }),
        { params: Promise.resolve({ id: lesson.id }) },
      );
      expect(reorderRes.status).toBe(200);

      const reorderedSections = await db.lessonSection.findMany({
        where: { lessonId: lesson.id },
        orderBy: { position: 'asc' },
      });

      expect(reorderedSections[0].id).toBe(section2Id);
      expect(reorderedSections[0].position).toBe(0);
      expect(reorderedSections[1].id).toBe(section1Id);
      expect(reorderedSections[1].position).toBe(1);

      // 5. Delete Section 1 safely
      const deleteSecRes = await deleteSection(
        new Request(`http://localhost/api/lessons/${lesson.id}/sections/${section1Id}`, {
          method: 'DELETE',
          headers: await authHeaderFor(teacher),
        }),
        { params: Promise.resolve({ id: lesson.id, sectionId: section1Id }) },
      );
      expect(deleteSecRes.status).toBe(200);

      const remainingSections = await db.lessonSection.findMany({
        where: { lessonId: lesson.id },
      });
      expect(remainingSections.length).toBe(1);
      expect(remainingSections[0].id).toBe(section2Id);
      expect(remainingSections[0].position).toBe(0);
    });
  });

  describe('Formative Checks & Anti-Cheating Protection', () => {
    it('creates multiple formative check types and strictly strips answer keys from students', async () => {
      const teacher = await db.user.create({
        data: {
          email: emailFor('teacher'),
          passwordHash: 'hash-p5',
          role: 'TEACHER',
          displayName: 'Formative Check Teacher',
        },
      });

      const student = await db.user.create({
        data: {
          email: emailFor('student'),
          passwordHash: 'hash-p5',
          role: 'STUDENT',
          displayName: 'Assessment Student',
        },
      });

      const unit = await db.unit.findFirstOrThrow({
        include: { term: { include: { curriculum: { include: { subject: true, gradeLevel: true } } } } },
      });

      const lesson = await db.lesson.create({
        data: {
          title: 'Published Check Assessment Lesson',
          unitId: unit.id,
          subject: unit.term.curriculum.subject.name,
          gradeLevel: unit.term.curriculum.gradeLevel.label,
          authorId: teacher.id,
          status: 'PUBLISHED',
        },
      });

      // 1. Add Multiple Choice Check
      const mcRes = await addCheck(
        new Request(`http://localhost/api/lessons/${lesson.id}/checks`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            ...(await authHeaderFor(teacher)),
          },
          body: JSON.stringify({
            question: 'What is $2x + 3$ when $x = 4$?',
            questionType: 'MULTIPLE_CHOICE',
            options: ['9', '11', '14', '7'],
            correctIndex: 1,
            explanation: '$2(4) + 3 = 8 + 3 = 11$.',
            points: 1,
            position: 0,
          }),
        }),
        { params: Promise.resolve({ id: lesson.id }) },
      );
      expect(mcRes.status).toBe(201);

      // 2. Add Short Answer Check
      const saRes = await addCheck(
        new Request(`http://localhost/api/lessons/${lesson.id}/checks`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            ...(await authHeaderFor(teacher)),
          },
          body: JSON.stringify({
            question: 'Solve for x: $x - 7 = 15$.',
            questionType: 'SHORT_ANSWER',
            correctAnswer: '22',
            explanation: 'Add 7 to both sides: $x = 15 + 7 = 22$.',
            points: 2,
            position: 1,
          }),
        }),
        { params: Promise.resolve({ id: lesson.id }) },
      );
      expect(saRes.status).toBe(201);

      // 3. Student requests lesson -> Anti-cheating strips correctIndex, correctAnswer, explanation
      const studentViewRes = await getLesson(
        new Request(`http://localhost/api/lessons/${lesson.id}`, {
          headers: await authHeaderFor(student),
        }),
        { params: Promise.resolve({ id: lesson.id }) },
      );
      expect(studentViewRes.status).toBe(200);
      const studentPayload = await studentViewRes.json();
      const studentChecks = studentPayload.data.lesson.checks;

      expect(studentChecks.length).toBe(2);
      for (const chk of studentChecks) {
        expect(chk).not.toHaveProperty('correctIndex');
        expect(chk).not.toHaveProperty('correctAnswer');
        expect(chk).not.toHaveProperty('explanation');
      }

      // 4. Teacher requests lesson preview -> Sees all answer keys and explanations
      const teacherPreviewRes = await previewLesson(
        new Request(`http://localhost/api/lessons/${lesson.id}/preview`, {
          headers: await authHeaderFor(teacher),
        }),
        { params: Promise.resolve({ id: lesson.id }) },
      );
      expect(teacherPreviewRes.status).toBe(200);
      const teacherPayload = await teacherPreviewRes.json();
      const teacherChecks = teacherPayload.data.lesson.checks;

      expect(teacherChecks[0].correctIndex).toBe(1);
      expect(teacherChecks[0].explanation).toBe('$2(4) + 3 = 8 + 3 = 11$.');
      expect(teacherChecks[1].correctAnswer).toBe('22');
    });
  });

  describe('Educational YouTube Video Attachment', () => {
    it('attaches and removes verified educational YouTube video references', async () => {
      const teacher = await db.user.create({
        data: {
          email: emailFor('teacher'),
          passwordHash: 'hash-p5',
          role: 'TEACHER',
          displayName: 'Video Author Teacher',
        },
      });

      const unit = await db.unit.findFirstOrThrow({
        include: { term: { include: { curriculum: { include: { subject: true, gradeLevel: true } } } } },
      });

      const lesson = await db.lesson.create({
        data: {
          title: 'Lesson with DepEd Video',
          unitId: unit.id,
          subject: unit.term.curriculum.subject.name,
          gradeLevel: unit.term.curriculum.gradeLevel.label,
          authorId: teacher.id,
          status: 'DRAFT',
        },
      });

      // 1. Attach valid YouTube video
      const attachRes = await attachVideo(
        new Request(`http://localhost/api/lessons/${lesson.id}/videos`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            ...(await authHeaderFor(teacher)),
          },
          body: JSON.stringify({
            url: 'https://www.youtube.com/watch?v=kYJv8y-9q5U',
            title: 'DepEd TV: Grade 7 Mathematics - Operations on Integers',
            description: 'Official DepEd broadcast on integers.',
          }),
        }),
        { params: Promise.resolve({ id: lesson.id }) },
      );

      expect(attachRes.status).toBe(201);
      const attachPayload = await attachRes.json();
      const videoRecord = attachPayload.data.video;
      expect(videoRecord.videoId).toBe('kYJv8y-9q5U');
      expect(videoRecord.provider).toBe('youtube');

      // 2. Reject invalid video URL
      const invalidRes = await attachVideo(
        new Request(`http://localhost/api/lessons/${lesson.id}/videos`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            ...(await authHeaderFor(teacher)),
          },
          body: JSON.stringify({
            url: 'https://not-youtube.com/watch?v=kYJv8y-9q5U',
          }),
        }),
        { params: Promise.resolve({ id: lesson.id }) },
      );
      expect(invalidRes.status).toBe(400);

      // 3. Remove attached video
      const removeRes = await removeVideo(
        new Request(`http://localhost/api/lessons/${lesson.id}/videos/${videoRecord.id}`, {
          method: 'DELETE',
          headers: await authHeaderFor(teacher),
        }),
        { params: Promise.resolve({ id: lesson.id, videoId: videoRecord.id }) },
      );
      expect(removeRes.status).toBe(200);

      const count = await db.lessonSource.count({ where: { lessonId: lesson.id } });
      expect(count).toBe(0);
    });
  });

  describe('Publish Validation & Teacher Ownership Protection', () => {
    it('blocks incomplete lessons from publishing, enforces ownership protection (403), and publishes valid lessons', async () => {
      const teacherA = await db.user.create({
        data: {
          email: emailFor('teacherA'),
          passwordHash: 'hash-p5',
          role: 'TEACHER',
          displayName: 'Teacher Alpha',
        },
      });

      const teacherB = await db.user.create({
        data: {
          email: emailFor('teacherB'),
          passwordHash: 'hash-p5',
          role: 'TEACHER',
          displayName: 'Teacher Beta',
        },
      });

      const unit = await db.unit.findFirstOrThrow({
        include: { term: { include: { curriculum: { include: { subject: true, gradeLevel: true } } } } },
      });

      // Teacher A creates an incomplete lesson (no sections)
      const incompleteLesson = await db.lesson.create({
        data: {
          title: 'Empty Incomplete Lesson',
          unitId: unit.id,
          subject: unit.term.curriculum.subject.name,
          gradeLevel: unit.term.curriculum.gradeLevel.label,
          authorId: teacherA.id,
          status: 'DRAFT',
        },
      });

      // 1. Publishing without sections fails validation (400)
      const invalidPublishRes = await publishLesson(
        new Request(`http://localhost/api/lessons/${incompleteLesson.id}/publish`, {
          method: 'POST',
          headers: await authHeaderFor(teacherA),
        }),
        { params: Promise.resolve({ id: incompleteLesson.id }) },
      );
      expect(invalidPublishRes.status).toBe(400);

      // 2. Teacher B attempts to publish or modify Teacher A's lesson -> 403 Forbidden
      const unauthorizedPublishRes = await publishLesson(
        new Request(`http://localhost/api/lessons/${incompleteLesson.id}/publish`, {
          method: 'POST',
          headers: await authHeaderFor(teacherB),
        }),
        { params: Promise.resolve({ id: incompleteLesson.id }) },
      );
      expect(unauthorizedPublishRes.status).toBe(403);

      const unauthorizedUpdateRes = await updateLesson(
        new Request(`http://localhost/api/lessons/${incompleteLesson.id}`, {
          method: 'PATCH',
          headers: {
            'content-type': 'application/json',
            ...(await authHeaderFor(teacherB)),
          },
          body: JSON.stringify({
            title: 'Hijacked Title by Teacher B',
          }),
        }),
        { params: Promise.resolve({ id: incompleteLesson.id }) },
      );
      expect(unauthorizedUpdateRes.status).toBe(403);

      // 3. Teacher A adds valid content
      await db.lessonSection.create({
        data: {
          lessonId: incompleteLesson.id,
          position: 0,
          heading: 'Core Concept Definition',
          type: 'TEXT',
          content: 'This section contains verified educational instructional content for students.',
        },
      });

      // 4. Teacher A publishes valid lesson -> 200 OK
      const validPublishRes = await publishLesson(
        new Request(`http://localhost/api/lessons/${incompleteLesson.id}/publish`, {
          method: 'POST',
          headers: await authHeaderFor(teacherA),
        }),
        { params: Promise.resolve({ id: incompleteLesson.id }) },
      );
      expect(validPublishRes.status).toBe(200);

      const updatedRecord = await db.lesson.findUnique({
        where: { id: incompleteLesson.id },
      });
      expect(updatedRecord?.status).toBe('PUBLISHED');
      expect(updatedRecord?.publishedAt).not.toBeNull();
    });
  });
});

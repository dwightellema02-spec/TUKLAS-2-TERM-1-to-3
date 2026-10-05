import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { db } from '../src/server/db';
import { createSessionToken, hashPassword, SESSION_COOKIE_NAME } from '../src/server/auth';
import { resetRateLimits } from '../src/server/rate-limit';
import { PracticeService } from '../src/services/practice.service';
import { ClassInsightsService } from '../src/services/class-insights.service';
import { GET as exportData } from '../src/app/api/account/export/route';
import { DELETE as deleteAccount } from '../src/app/api/account/route';
import { POST as reportReply } from '../src/app/api/ai/tutor/report/route';
import { POST as askTutor } from '../src/app/api/ai/tutor/route';

const PREFIX = 'privacy-test-';
const PASSWORD = 'RightPass123!';

async function account(role: 'STUDENT' | 'TEACHER', tag: string) {
  const user = await db.user.create({
    data: { email: `${PREFIX}${tag}-${randomUUID()}@example.com`, passwordHash: await hashPassword(PASSWORD), role, displayName: `Name ${tag}` },
  });
  const token = await createSessionToken({ id: user.id, email: user.email, displayName: user.displayName, role });
  return { user, cookie: `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}` };
}

const call = (handler: (r: Request) => Promise<Response>, method: string, cookie: string, body?: unknown) =>
  handler(new Request('http://localhost/api/x', { method, headers: { 'content-type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }));

afterEach(async () => {
  resetRateLimits();
  await db.class.deleteMany({ where: { name: { startsWith: PREFIX } } });
  await db.user.deleteMany({ where: { email: { startsWith: PREFIX } } });
});

async function studentWithActivity() {
  const pupil = await account('STUDENT', 'pupil');
  const session = await PracticeService.startLessonBankSession(pupil.user.id, { lessonId: 'lesson-math-7-integers', total: 4 });
  const row = await db.practiceQuestion.findFirstOrThrow({ where: { sessionId: session.id }, orderBy: { position: 'asc' } });
  await PracticeService.submitAnswer(pupil.user.id, session.id, row.id, (row.correctIndex + 1) % 4);
  delete process.env.ANTHROPIC_API_KEY;
  process.env.AI_PROVIDER = 'anthropic';
  const asked = await (await call(askTutor, 'POST', pupil.cookie, { message: 'why was I wrong? my phone is 0917-000-0000', practiceQuestionId: row.id })).json();
  return { pupil, row, session, asked: asked.data };
}

describe('download my data', () => {
  it('returns everything stored about the person and nothing secret or foreign', async () => {
    const { pupil } = await studentWithActivity();
    const other = await account('STUDENT', 'other');
    await db.chatConversation.create({ data: { studentId: other.user.id, messages: { create: [{ role: 'user', content: 'SOMEONE ELSES MESSAGE' }] } } });

    const response = await call(exportData, 'GET', pupil.cookie);
    expect(response.status).toBe(200);
    const text = await response.text();
    const data = JSON.parse(text).data;
    expect(data.account).toMatchObject({ email: pupil.user.email, displayName: 'Name pupil', role: 'STUDENT' });
    expect(data.practiceSessions).toHaveLength(1);
    expect(data.practiceSessions[0].answers).toHaveLength(1);
    expect(data.mistakes.length).toBeGreaterThan(0);
    expect(data.tutorConversations[0].messages.map((m: { role: string }) => m.role)).toEqual(['user', 'assistant']);
    expect(data.tutorConversations[0].messages[0].content).toContain('0917-000-0000'); // what they typed is theirs to see
    expect(text).not.toMatch(/passwordHash|pbkdf2|SOMEONE ELSES/); // no secrets, no one else's data
    expect(text).not.toContain(other.user.email);
  });

  it('works for a teacher (their classes and lessons), and visitors are refused', async () => {
    const teacher = await account('TEACHER', 'teacher');
    await db.lesson.create({ data: { authorId: teacher.user.id, title: `${PREFIX}lesson`, subject: 'Mathematics', gradeLevel: 'Grade 7' } });
    const data = (await (await call(exportData, 'GET', teacher.cookie)).json()).data;
    expect(data.lessonsYouAuthored.map((l: { title: string }) => l.title)).toEqual([`${PREFIX}lesson`]);
    expect((await call(exportData, 'GET', '')).status).toBe(401);
    await db.lesson.deleteMany({ where: { title: `${PREFIX}lesson` } });
  });
});

describe('delete my account', () => {
  it('needs the right password AND the word DELETE; a refusal changes nothing', async () => {
    const { pupil } = await studentWithActivity();
    expect((await call(deleteAccount, 'DELETE', pupil.cookie, { password: 'WrongPass123!', confirm: 'DELETE' })).status).toBe(400);
    expect((await call(deleteAccount, 'DELETE', pupil.cookie, { password: PASSWORD, confirm: 'delete' })).status).toBe(400);
    expect((await call(deleteAccount, 'DELETE', pupil.cookie, { password: PASSWORD })).status).toBe(400);
    expect((await call(deleteAccount, 'DELETE', '', { password: PASSWORD, confirm: 'DELETE' })).status).toBe(401);
    expect(await db.user.count({ where: { id: pupil.user.id } })).toBe(1);
  });

  it('removes the account and every learning record, and leaves other people untouched', async () => {
    const { pupil, asked } = await studentWithActivity();
    const bystander = await account('STUDENT', 'bystander');
    await db.classMember.create({ data: { classId: (await db.class.create({ data: { name: `${PREFIX}class`, teacherId: (await account('TEACHER', 'cls')).user.id } })).id, userId: pupil.user.id } });
    await call(reportReply, 'POST', pupil.cookie, { messageId: asked.reply.id, reason: 'CONFUSING' });
    const id = pupil.user.id;

    expect((await call(deleteAccount, 'DELETE', pupil.cookie, { password: PASSWORD, confirm: 'DELETE' })).status).toBe(200);

    const remaining = await Promise.all([
      db.user.count({ where: { id } }),
      db.practiceSession.count({ where: { studentId: id } }),
      db.mistakeRecord.count({ where: { studentId: id } }),
      db.skillMastery.count({ where: { studentId: id } }),
      db.chatConversation.count({ where: { studentId: id } }),
      db.aIInteraction.count({ where: { userId: id } }),
      db.classMember.count({ where: { userId: id } }),
      db.replyReport.count({ where: { studentId: id } }),
      db.authSession.count({ where: { userId: id } }),
    ]);
    expect(remaining).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(await db.user.count({ where: { id: bystander.user.id } })).toBe(1);
    expect((await call(exportData, 'GET', pupil.cookie)).status).toBe(401); // the old cookie no longer works
  });

  it('teachers cannot delete themselves (an administrator closes the account)', async () => {
    const teacher = await account('TEACHER', 'keep');
    const response = await call(deleteAccount, 'DELETE', teacher.cookie, { password: PASSWORD, confirm: 'DELETE' });
    expect(response.status).toBe(403);
    expect((await response.json()).error).toMatch(/administrator/i);
    expect(await db.user.count({ where: { id: teacher.user.id } })).toBe(1);
  });
});

describe('report a tutor reply', () => {
  it('stores one report per reply (idempotent), only for the student’s own assistant messages', async () => {
    const { pupil, asked } = await studentWithActivity();
    const intruder = await account('STUDENT', 'intruder');
    const messageId = asked.reply.id as string;

    expect((await call(reportReply, 'POST', pupil.cookie, { messageId, reason: 'WRONG_MATH', note: 'it said 5' })).status).toBe(201);
    expect((await call(reportReply, 'POST', pupil.cookie, { messageId, reason: 'UNSAFE', note: 'changed my mind' })).status).toBe(201);
    const rows = await db.replyReport.findMany({ where: { messageId } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ reason: 'UNSAFE', note: 'changed my mind' });

    expect((await call(reportReply, 'POST', intruder.cookie, { messageId, reason: 'OTHER' })).status).toBe(404); // not their conversation
    const userMessage = await db.chatMessage.findFirstOrThrow({ where: { conversationId: (await db.chatMessage.findUniqueOrThrow({ where: { id: messageId } })).conversationId, role: 'user' } });
    expect((await call(reportReply, 'POST', pupil.cookie, { messageId: userMessage.id, reason: 'OTHER' })).status).toBe(404); // only tutor replies
    expect((await call(reportReply, 'POST', pupil.cookie, { messageId, reason: 'NOT_A_REASON' })).status).toBe(400);
    expect((await call(reportReply, 'POST', '', { messageId, reason: 'OTHER' })).status).toBe(401);
  });

  it('the class teacher sees the report and the reply text, never the student', async () => {
    const { pupil, asked } = await studentWithActivity();
    const teacher = await account('TEACHER', 'reader');
    const cls = await db.class.create({ data: { name: `${PREFIX}class2`, teacherId: teacher.user.id } });
    await db.classMember.create({ data: { classId: cls.id, userId: pupil.user.id } });
    await call(reportReply, 'POST', pupil.cookie, { messageId: asked.reply.id, reason: 'WRONG_MATH', note: 'the sign was wrong' });

    const insights = await ClassInsightsService.getClassInsights(cls.id, { id: teacher.user.id, role: 'TEACHER' });
    expect(insights.reportedReplies.total).toBe(1);
    expect(insights.reportedReplies.recent[0]).toMatchObject({ reason: 'WRONG_MATH', note: 'the sign was wrong' });
    expect(insights.reportedReplies.recent[0].reply.length).toBeGreaterThan(10);
    expect(JSON.stringify(insights.reportedReplies)).not.toMatch(new RegExp(`${pupil.user.id}|${pupil.user.email}|Name pupil`));

    // A teacher with a different class sees nothing.
    const rival = await account('TEACHER', 'rival');
    const rivalClass = await db.class.create({ data: { name: `${PREFIX}class3`, teacherId: rival.user.id } });
    expect((await ClassInsightsService.getClassInsights(rivalClass.id, { id: rival.user.id, role: 'TEACHER' })).reportedReplies.total).toBe(0);
  });
});

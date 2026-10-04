/**
 * THE FULL LOOP, through the real UI and a real browser, on the real database.
 *
 *   teacher creates a lesson -> adds material, captions, a video -> publishes -> creates a class
 *   -> student joins -> student opens the lesson -> student asks the tutor -> student practises
 *   -> student errs, asks again, improves -> teacher sees the insights
 *
 * HONESTY RULES for this file:
 *  - The "AI" is e2e/fake-ai-server.mjs. Every assertion about the tutor is about WHAT THE MODEL WAS SENT and
 *    how the app labels and guards the reply. Nothing here says anything about real model quality (SIMULATED).
 *  - A step the UI cannot do is a PRODUCT GAP. It is asserted as it currently behaves and recorded as a test
 *    annotation. It is never worked around inside the lesson under test.
 */

import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { expectNoHorizontalScroll, signIn, snap, solveExpression } from './helpers';

test.describe.configure({ mode: 'serial' });

const FAKE = 'http://localhost:3401';
type Call = { system: string; user: string; message: string };
const fakeCalls = async (): Promise<Call[]> => (await fetch(`${FAKE}/__calls`)).json();
const resetFake = () => fetch(`${FAKE}/__reset`, { method: 'POST' });

const SEEDED = 'Operations on Integers';
let tag = '';
let lessonTitle = '';
let className = '';
let joinCode = '';
let sectionMarker = '';
let captionMarker = '';
let notesMarker = '';

let teacherCtx: BrowserContext;
let studentCtx: BrowserContext;
let teacher: Page;
let student: Page;

const gap = (testInfo: { annotations: { type: string; description?: string }[] }, description: string) =>
  testInfo.annotations.push({ type: 'PRODUCT GAP', description });

test.beforeAll(async ({ browser }, testInfo) => {
  tag = `${testInfo.project.name}-${Date.now().toString(36)}`;
  lessonTitle = `Loop lesson ${tag}`;
  className = `Loop class ${tag}`;
  sectionMarker = `quillfeather${Date.now().toString(36)}`;
  captionMarker = `driftwood${Date.now().toString(36)}`;
  notesMarker = `lanternfish${Date.now().toString(36)}`;
  const use = testInfo.project.use as never;
  teacherCtx = await browser.newContext(use);
  studentCtx = await browser.newContext(use);
  teacher = await teacherCtx.newPage();
  student = await studentCtx.newPage();
  const registered = await student.request.post('/api/auth/register', {
    data: { email: `e2e-loop-${tag}@example.test`, password: 'StudentPass12345!', displayName: `Loop Student ${tag}`, role: 'STUDENT' },
  });
  expect(registered.status()).toBe(201);
  await signIn(teacher, 'teacher-demo@tuklas.local');
  await resetFake();
});

test.afterAll(async () => {
  await Promise.all([teacherCtx, studentCtx].map((context) => context?.close()));
});

test('1. the teacher creates a lesson in the studio: content, a check, a video, reference notes and captions', async ({}, testInfo) => {
  await teacher.goto('/teacher/lessons/new');
  const unit = teacher.getByLabel('Curriculum Unit');
  await expect(unit).toBeVisible({ timeout: 60_000 }); // first compile of this page can be slow in dev
  const options = await unit.locator('option').allInnerTexts();
  const match = options.find((text) => text.includes('Rational and Irrational Numbers'));
  expect(match, 'a Term 1 unit must be selectable').toBeTruthy();
  await unit.selectOption({ label: match as string });
  await teacher.getByLabel('Lesson Title').fill(lessonTitle);
  await teacher.getByLabel('Description (Optional)').fill('Created by the full-loop browser test.');
  await teacher.getByRole('button', { name: /Open in Lesson Studio/ }).click();
  await expect(teacher).toHaveURL(/\/teacher\/lessons\/[^/]+\/studio$/);

  // Content
  await teacher.getByPlaceholder(/Enter instructional text/).first().fill(`The ${sectionMarker} rule: a negative times a negative is positive.`);

  // A knowledge check (what the studio calls a formative check)
  await teacher.getByRole('button', { name: /2\. Formative Checks/ }).click();
  await teacher.getByRole('button', { name: '+ Add Formative Check' }).click();
  const check = teacher.locator('article').filter({ hasText: 'Check 1' });
  const fields = check.locator('input[type="text"]');
  await fields.nth(0).fill('What is (−4) × (−2)?');
  await fields.nth(1).fill('8');
  await fields.nth(2).fill('−8');
  await fields.nth(3).fill('6');
  await fields.nth(4).fill('−6');
  await check.getByRole('radio').first().check();
  await check.locator('textarea').fill('Two negatives multiply to a positive: 4 × 2 = 8.');

  // A YouTube video (attached by link; Tuklas does not fetch its captions)
  await teacher.getByRole('button', { name: /3\. Educational Videos/ }).click();
  await teacher.getByPlaceholder('https://www.youtube.com/watch?v=...').fill('https://www.youtube.com/watch?v=kYJv8y-9q5U');
  await teacher.getByRole('button', { name: 'Attach Video' }).click();
  await expect(teacher.getByText('Video ID: kYJv8y-9q5U')).toBeVisible();

  await teacher.getByRole('button', { name: 'Save Draft' }).click();
  await expect(teacher.getByText('✓ Saved')).toBeVisible();

  // Reference notes and the video's captions
  await teacher.getByRole('button', { name: '4. Reference Documents' }).click();
  const docs = teacher.getByRole('region', { name: 'Reference documents' });
  await docs.getByLabel('Document file').setInputFiles({
    name: 'loop-notes.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from(`Teacher notes\n\nThe ${notesMarker} trick: count the negative signs. An even count gives a positive product.`),
  });
  await docs.getByRole('button', { name: 'Upload' }).click();
  await expect(docs.getByRole('status').filter({ hasText: 'Added loop-notes.txt' })).toBeVisible();
  await docs.getByLabel('Document file').setInputFiles({
    name: 'loop-video.vtt',
    mimeType: 'text/vtt',
    buffer: Buffer.from(`WEBVTT\n\n00:00:05.000 --> 00:00:12.000\nWatch how the ${captionMarker} method multiplies two negative numbers.\n`),
  });
  await docs.getByRole('button', { name: 'Upload' }).click();
  await expect(docs.getByRole('status').filter({ hasText: 'Added loop-video.vtt' })).toBeVisible();
  await expect(docs.getByRole('row').filter({ hasText: 'loop-video.vtt' })).toContainText('Video captions');

  // Publish
  await teacher.getByRole('button', { name: 'Publish Lesson' }).click();
  await expect(teacher.getByText('Lesson successfully published to students!')).toBeVisible();
  await snap(teacher, testInfo, 'loop-1-lesson-published');

  // Product gaps seen from this screen, recorded rather than worked around.
  await expect(teacher.getByRole('button', { name: /practice/i })).toHaveCount(0);
  gap(testInfo, 'The studio has no way to author PRACTICE questions. Formative checks only; the practice bank exists only through the seed.');
  gap(testInfo, 'Captions are uploaded as a document and are not linked to the attached YouTube video; Tuklas cannot fetch captions itself.');
});

test('2. the teacher creates a class, the student joins with the code, the teacher assigns the lesson', async ({}, testInfo) => {
  await teacher.goto('/teacher/classes');
  await teacher.getByLabel('Class name').fill(className);
  await teacher.getByRole('button', { name: 'Create class' }).click();
  await teacher.locator('.review-item', { hasText: className }).getByRole('link').click();
  joinCode = (await teacher.locator('.join-code').first().innerText()).trim();
  expect(joinCode).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);

  await signIn(student, `e2e-loop-${tag}@example.test`, 'StudentPass12345!');
  await student.goto('/student');
  const join = student.getByRole('form', { name: 'Join a class' });
  await join.getByLabel('Join a class with a code').fill(joinCode);
  await join.getByRole('button', { name: 'Join class' }).click();
  await expect(join.getByRole('status')).toContainText(`You joined ${className}`);

  const assign = teacher.getByRole('form', { name: 'Assign a lesson' });
  // The lesson list loads after the class; wait for the published lesson to be offered.
  await expect(assign.getByLabel('Lesson').locator('option', { hasText: lessonTitle })).toHaveCount(1, { timeout: 30_000 });
  const options = await assign.getByLabel('Lesson').locator('option').allInnerTexts();
  const lesson = options.find((text) => text.includes(lessonTitle));
  expect(lesson, 'the published lesson must be assignable').toBeTruthy();
  await assign.getByLabel('Lesson').selectOption({ label: lesson as string });
  await assign.getByRole('button', { name: 'Assign to class' }).click();
  await expect(teacher.getByRole('status').filter({ hasText: 'Lesson assigned.' })).toBeVisible();
  await snap(teacher, testInfo, 'loop-2-class-assigned');
});

test('3. the student opens the assigned lesson, answers its check (graded by the server) and completes it', async ({}, testInfo) => {
  await student.goto('/student');
  await student.getByRole('region', { name: 'Your classes and assignments' }).getByRole('link', { name: lessonTitle }).click();
  await expect(student.getByRole('heading', { level: 1 })).toContainText(lessonTitle);
  await expect(student.getByText(sectionMarker)).toBeVisible();

  const item = student.locator('section:has(h2:text("Knowledge Checks")) > ol > li').first();
  await item.locator('label', { hasText: /^\s*−8\s*$|^\s*-8\s*$/ }).locator('input').check(); // a wrong choice first
  await item.getByRole('button', { name: 'Check answer' }).click();
  await expect(item.getByRole('status')).toContainText('Not quite');
  await item.locator('label', { hasText: /^\s*8\s*$/ }).locator('input').check();
  await item.getByRole('button', { name: 'Check answer' }).click();
  await expect(item.getByRole('status')).toContainText('Correct!');
  await student.getByRole('button', { name: 'Mark lesson complete' }).click();
  await expect(student.getByRole('status').filter({ hasText: 'Lesson marked complete.' })).toBeVisible();
  await expectNoHorizontalScroll(student);
  await snap(student, testInfo, 'loop-3-lesson-completed');
});

test('4. PRODUCT GAP: practising the teacher-made lesson is impossible, because it has no practice bank', async ({}, testInfo) => {
  await student.goto('/student');
  await student.getByRole('region', { name: 'Your classes and assignments' }).getByRole('link', { name: lessonTitle }).click();
  const button = student.getByRole('button', { name: 'Practice this lesson' });
  const offered = await button.count();
  if (offered > 0) {
    await button.click();
    await student.waitForTimeout(2000);
  }
  const startedPractice = /\/student\/practice\//.test(student.url());
  const message = (await student.locator('[role="alert"], [role="status"]').allInnerTexts()).join(' | ');
  gap(testInfo, `Practice on a teacher-made lesson: button offered=${offered > 0}, session started=${startedPractice}, page said: "${message.slice(0, 160)}"`);
  // Asserted as it is TODAY. When teachers can author practice questions this test must flip.
  expect(startedPractice, 'a teacher-made lesson currently cannot be practised').toBe(false);
});

test('5. the tutor is sent the lesson, the teacher notes AND the video captions (the model is the local fake: SIMULATED)', async ({}, testInfo) => {
  await student.goto('/student');
  await student.getByRole('region', { name: 'Your classes and assignments' }).getByRole('link', { name: lessonTitle }).click();
  const tutor = student.getByRole('region', { name: 'Ask about this lesson' });
  await tutor.getByRole('button', { name: /Ask Tuklas/ }).click();
  await resetFake();
  const form = tutor.getByRole('form', { name: 'Ask a question' });
  await form.getByLabel('Your question').fill(`How do the ${captionMarker} method and the ${notesMarker} trick help with negative times negative?`);
  await form.getByRole('button', { name: 'Send' }).click();
  await expect.poll(async () => (await fakeCalls()).length).toBeGreaterThan(0);
  await expect(tutor.getByRole('log')).toContainText('Ask Tuklas (AI)');

  const [call] = await fakeCalls();
  expect(call.system).toContain(lessonTitle);
  expect(call.system).toContain(sectionMarker); // the lesson's own content block
  expect(call.system).toContain('BEGIN TEACHER MATERIAL');
  expect(call.system).toContain(notesMarker); // the uploaded notes
  expect(call.system).toMatch(/Video transcript "Video 0:05–0:12"/); // the captions, with their time range
  expect(call.system).toContain(captionMarker);
  expect(call.system).toMatch(/You have not watched the video/);
  await snap(student, testInfo, 'loop-5-tutor-lesson-grounded');
});

test('6. on the SEEDED lesson (the only one with a practice bank): error, a different explanation, then improvement', async ({}, testInfo) => {
  gap(testInfo, 'Steps 6-7 had to use the seeded lesson "Operations on Integers" because teacher-made lessons have no practice bank (see step 4).');
  await student.goto('/student');
  await student.getByRole('region', { name: 'Your learning path' }).getByRole('link', { name: SEEDED }).click();
  await student.getByRole('button', { name: 'Practice this lesson' }).click();
  await expect(student).toHaveURL(/\/student\/practice\//);

  const help = student.getByRole('region', { name: 'Help with this question' });
  const log = help.getByRole('log', { name: 'Conversation with Tuklas' });
  const say = async (message: string) => {
    const form = help.getByRole('form', { name: 'Ask a question' });
    await form.getByLabel('Your question').fill(message);
    await form.getByRole('button', { name: 'Send' }).click();
  };

  const question = (await student.locator('legend.practice-question').innerText()).trim();
  const correct = solveExpression(question);
  await help.getByRole('button', { name: 'Need help? Ask Tuklas' }).click();

  // The error: a wrong answer, submitted.
  const labels = student.locator('label.option-choice');
  let wrongIndex = 0;
  for (let i = 0; i < (await labels.count()); i += 1) {
    if ((await labels.nth(i).innerText()).trim() !== correct) {
      wrongIndex = i;
      break;
    }
  }
  await resetFake();
  await say('hint please');
  await expect(log).toContainText('Hint 1 from the fake tutor');
  await say("I still don't get it");
  // The second message changes strategy AND moves up one rung: the reply differs from the first.
  await expect(log).toContainText('Hint 2 from the fake tutor');
  await expect(log).toContainText('number line');
  const calls = await fakeCalls();
  expect(calls[1].system).toMatch(/did not work\. Do NOT repeat it/);
  expect(calls[0].system).not.toMatch(/did not work\. Do NOT repeat it/);

  await student.getByRole('radio').nth(wrongIndex).check();
  await student.getByRole('button', { name: 'Submit answer' }).click();
  await expect(student.getByRole('status').filter({ hasText: 'Not quite.' })).toBeVisible();
  await student.getByRole('button', { name: 'Next question' }).click();

  // The improvement: the next two are answered correctly.
  for (let n = 2; n <= 3; n += 1) {
    const text = (await student.locator('legend.practice-question').innerText()).trim();
    await student.getByRole('radio', { name: solveExpression(text), exact: true }).check();
    await student.getByRole('button', { name: 'Submit answer' }).click();
    await expect(student.getByRole('status').filter({ hasText: 'Correct!' })).toBeVisible();
    await student.getByRole('button', { name: 'Next question' }).click();
  }
  await snap(student, testInfo, 'loop-6-practice-error-and-improvement');
});

test('7. the teacher sees the class insights built from what the student actually did', async ({}, testInfo) => {
  await teacher.goto('/teacher/classes');
  await teacher.locator('.review-item', { hasText: className }).getByRole('link').click();
  const row = teacher.getByRole('row').filter({ hasText: `e2e-loop-${tag}@example.test` });
  await expect(row).toContainText('Learning'); // three practice answers are far too few to claim more
  await expect(row).toContainText('1'); // lessons done: the teacher-made lesson was completed

  const insights = teacher.getByRole('region', { name: 'Class insights' });
  await expect(insights).toContainText('Last 14 days: 1 of 1 students practised, answering 3 questions with 67% correct.');
  await expect(insights.getByRole('list', { name: /Questions answered each day/ })).toContainText('3 questions, 1 student');
  await expect(insights).toContainText(`${lessonTitle}: 1 completed, 0 in progress, 0 practised, of 1 student`);
  // The seeded lesson was practised but not completed: it must still be listed (regression found by this very test).
  await expect(insights).toContainText(`${SEEDED}: 0 completed, 0 in progress, 1 practised, of 1 student`);
  await expectNoHorizontalScroll(teacher);

  await teacher.getByRole('link', { name: /View details for Loop Student/ }).click();
  // The first visit to this route compiles it on demand in `next dev`, which can exceed the default 10 s when run alone.
  await expect(teacher.getByText('3 questions answered, 67% correct; 3 in the last 14 days.')).toBeVisible({ timeout: 45_000 });
  await snap(teacher, testInfo, 'loop-7-teacher-insights');
});

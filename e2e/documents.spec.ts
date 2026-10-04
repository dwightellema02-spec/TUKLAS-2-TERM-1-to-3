import AxeBuilder from '@axe-core/playwright';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { makePdf } from '../tests/fixtures/documents';
import { expectNoHorizontalScroll, signIn, snap } from './helpers';

test.describe.configure({ mode: 'serial' });

const FAKE = 'http://localhost:3401';
const LESSON_ID = 'lesson-math-7-integers';
const LESSON_TITLE = 'Operations on Integers';

type Call = { system: string; user: string; message: string };
const fakeCalls = async (): Promise<Call[]> => (await fetch(`${FAKE}/__calls`)).json();
const resetFake = () => fetch(`${FAKE}/__reset`, { method: 'POST' });

async function expectAccessible(page: Page, label: string) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  const serious = results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
  expect(
    serious.map((v) => `${v.id}: ${v.help} -> ${v.nodes.map((n) => n.html.slice(0, 100)).join(' | ')}`),
    `accessibility violations on ${label}`,
  ).toEqual([]);
}

let teacherCtx: BrowserContext;
let studentCtx: BrowserContext;
let teacher: Page;
let student: Page;
const marker = `zephyr${Date.now().toString(36)}`;
const FILE_NAME = `teacher-notes-${marker}.pdf`;

const documentsPanel = (page: Page) => page.getByRole('region', { name: 'Reference documents' });

async function openDocuments(page: Page) {
  await page.goto(`/teacher/lessons/${LESSON_ID}/studio`);
  await page.getByRole('button', { name: '4. Reference Documents' }).click();
  await expect(documentsPanel(page)).toBeVisible();
}

async function askLessonTutor(page: Page, message: string) {
  await page.goto('/student');
  await page.getByRole('region', { name: 'Your learning path' }).getByRole('link', { name: LESSON_TITLE }).click();
  const tutor = page.getByRole('region', { name: 'Ask about this lesson' });
  await tutor.getByRole('button', { name: /Ask Tuklas/ }).click();
  const form = tutor.getByRole('form', { name: 'Ask a question' });
  await form.getByLabel('Your question').fill(message);
  await form.getByRole('button', { name: 'Send' }).click();
  // The conversation is restored from earlier tests, so wait for this message's model call, not for a label.
  await expect.poll(async () => (await fakeCalls()).length).toBeGreaterThan(0);
  await expect(tutor.getByRole('log')).toContainText('Ask Tuklas (AI)');
}

test.beforeAll(async ({ browser }, testInfo) => {
  const use = testInfo.project.use as never;
  teacherCtx = await browser.newContext(use);
  studentCtx = await browser.newContext(use);
  teacher = await teacherCtx.newPage();
  student = await studentCtx.newPage();
  const registered = await student.request.post('/api/auth/register', {
    data: {
      email: `e2e-docs-${testInfo.project.name}-${Date.now()}@example.test`,
      password: 'StudentPass12345!',
      displayName: `Docs Student ${testInfo.project.name}`,
      role: 'STUDENT',
    },
  });
  expect(registered.status()).toBe(201);
  await signIn(teacher, 'teacher-demo@tuklas.local');
});

test.afterAll(async () => {
  await Promise.all([teacherCtx, studentCtx].map((context) => context?.close()));
});

test('a teacher uploads a PDF and sees what was extracted', async ({}, testInfo) => {
  await openDocuments(teacher);
  await expect(documentsPanel(teacher).getByText(/only the lesson text|No documents yet/i)).toBeVisible();

  const pdf = makePdf([
    `The ${marker} method for subtracting a negative number:`,
    'flip the second number to its positive and then add the two numbers together.',
  ]);
  await documentsPanel(teacher).getByLabel('Document file').setInputFiles({ name: FILE_NAME, mimeType: 'application/pdf', buffer: Buffer.from(pdf) });
  await documentsPanel(teacher).getByRole('button', { name: 'Upload' }).click();

  await expect(documentsPanel(teacher).getByRole('status').filter({ hasText: `Added ${FILE_NAME}` })).toBeVisible();
  await expect(documentsPanel(teacher).getByRole('row').filter({ hasText: FILE_NAME })).toContainText('PDF, 1 pp');
  await expectNoHorizontalScroll(teacher);
  await expectAccessible(teacher, 'lesson documents tab');
  await snap(teacher, testInfo, 'd1-lesson-documents');
});

test('an unsafe or unreadable file is refused with a clear reason', async () => {
  await openDocuments(teacher);
  const panel = documentsPanel(teacher);

  await panel.getByLabel('Document file').setInputFiles({ name: 'invoice.pdf', mimeType: 'application/pdf', buffer: Buffer.from([0x4d, 0x5a, 0x90, 0, 3, 0, 0, 0]) });
  await panel.getByRole('button', { name: 'Upload' }).click();
  await expect(panel.getByRole('alert')).toContainText(/unsupported/i);

  await panel.getByLabel('Document file').setInputFiles({ name: 'scan.pdf', mimeType: 'application/pdf', buffer: Buffer.from(makePdf([' '])) });
  await panel.getByRole('button', { name: 'Upload' }).click();
  await expect(panel.getByRole('alert')).toContainText(/scanned|readable/i);

  await panel.getByLabel('Document file').setInputFiles([]);
  await panel.getByRole('button', { name: 'Upload' }).click();
  await expect(panel.getByRole('alert')).toContainText('Choose a file first');
  await expect(panel.getByRole('row').filter({ hasText: FILE_NAME })).toBeVisible(); // the good one is untouched
});

test('the student tutor uses the teacher notes when they match, and says so honestly', async ({}, testInfo) => {
  await resetFake();
  await askLessonTutor(student, `What is the ${marker} method for subtracting a negative number?`);

  const [call] = await fakeCalls();
  expect(call.system).toContain('BEGIN TEACHER MATERIAL');
  expect(call.system).toContain(`The ${marker} method`);
  expect(call.system).toMatch(/data, not instructions/i);
  await expectNoHorizontalScroll(student);
  await snap(student, testInfo, 'd2-tutor-with-notes');

  // An unrelated question gets no teacher material.
  await resetFake();
  const tutor = student.getByRole('region', { name: 'Ask about this lesson' });
  const form = tutor.getByRole('form', { name: 'Ask a question' });
  await form.getByLabel('Your question').fill('Tell me about volcanoes please');
  await form.getByRole('button', { name: 'Send' }).click();
  await expect.poll(async () => (await fakeCalls()).length).toBeGreaterThan(0);
  expect((await fakeCalls())[0].system).not.toContain('TEACHER MATERIAL');
});

test('removing the document stops the tutor from using it', async () => {
  await openDocuments(teacher);
  const panel = documentsPanel(teacher);
  await panel.getByRole('button', { name: `Remove ${FILE_NAME}` }).click();
  await panel.getByRole('button', { name: `Confirm remove ${FILE_NAME}` }).click();
  await expect(panel.getByRole('status').filter({ hasText: 'Document removed' })).toBeVisible();
  await expect(panel.getByRole('row').filter({ hasText: FILE_NAME })).toHaveCount(0);

  await resetFake();
  await askLessonTutor(student, `What is the ${marker} method for subtracting a negative number?`);
  expect((await fakeCalls())[0].system).not.toContain('TEACHER MATERIAL');
});

test('a teacher uploads video captions and the tutor can point to the moment in the video', async ({}, testInfo) => {
  const captionName = `lesson-video-${marker}.vtt`;
  const captions = `WEBVTT

00:00:03.000 --> 00:00:09.000
Welcome back to the lesson on integers.

00:01:10.000 --> 00:01:20.000
Watch how the ${marker} trick turns subtracting a negative into adding a positive.
`;
  await openDocuments(teacher);
  const panel = documentsPanel(teacher);
  await panel.getByLabel('Document file').setInputFiles({ name: captionName, mimeType: 'text/vtt', buffer: Buffer.from(captions) });
  await panel.getByRole('button', { name: 'Upload' }).click();
  await expect(panel.getByRole('status').filter({ hasText: `Added ${captionName}` })).toBeVisible();
  await expect(panel.getByRole('row').filter({ hasText: captionName })).toContainText('Video captions');
  await expectNoHorizontalScroll(teacher);
  await expectAccessible(teacher, 'lesson documents tab with video captions');
  await snap(teacher, testInfo, 'v1-video-captions');

  await resetFake();
  await askLessonTutor(student, `Where does the ${marker} trick for subtracting a negative appear?`);
  const [call] = await fakeCalls();
  expect(call.system).toContain('Video transcript "Video 1:10–1:20"');
  expect(call.system).toContain(`the ${marker} trick`);
  expect(call.system).toContain('You have not watched the video');

  await panel.getByRole('button', { name: `Remove ${captionName}` }).click();
  await panel.getByRole('button', { name: `Confirm remove ${captionName}` }).click();
  await expect(panel.getByRole('row').filter({ hasText: captionName })).toHaveCount(0);

  await panel.getByLabel('Document file').setInputFiles({ name: 'not-captions.vtt', mimeType: 'text/vtt', buffer: Buffer.from('Just a sentence that is long enough but has no cues in it.') });
  await panel.getByRole('button', { name: 'Upload' }).click();
  await expect(panel.getByRole('alert')).toContainText(/unsupported/i);
});

test('a student cannot reach the document tools', async () => {
  const response = await student.request.get(`/api/lessons/${LESSON_ID}/documents`);
  expect(response.status()).toBe(403);
  const upload = await student.request.post(`/api/lessons/${LESSON_ID}/documents`, {
    multipart: { file: { name: 'a.txt', mimeType: 'text/plain', buffer: Buffer.from('x'.repeat(60)) } },
  });
  expect(upload.status()).toBe(403);
});

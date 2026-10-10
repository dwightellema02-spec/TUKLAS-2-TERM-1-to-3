import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { expectNoHorizontalScroll, signIn, snap, solveExpression } from './helpers';

test.describe.configure({ mode: 'serial' });

const LESSON_TITLE = 'Operations on Integers';
const TEMP_PASSWORD = 'TempTeacher123!';
const STUDENT_PASSWORD = 'StudentPass12345!';

let tag = '';
let teacherEmail = '';
let studentEmail = '';
let joinCode = '';
let classId = '';

let adminCtx: BrowserContext;
let teacherCtx: BrowserContext;
let studentCtx: BrowserContext;
let rivalCtx: BrowserContext;
let admin: Page;
let teacher: Page;
let student: Page;
let rival: Page;

async function actorPage(browser: Browser, use: Record<string, unknown>) {
  const context = await browser.newContext(use);
  return { context, page: await context.newPage() };
}

async function expectAccessible(page: Page, label: string) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  const serious = results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
  expect(
    serious.map((v) => `${v.id}: ${v.help} -> ${v.nodes.map((n) => n.html.slice(0, 100)).join(' | ')}`),
    `accessibility violations on ${label}`,
  ).toEqual([]);
}

test.beforeAll(async ({ browser }, testInfo) => {
  tag = `${testInfo.project.name}-${Date.now()}`;
  teacherEmail = `e2e-teacher-${tag}@example.test`;
  studentEmail = `e2e-student-${tag}@example.test`;
  const use = testInfo.project.use as Record<string, unknown>;
  ({ context: adminCtx, page: admin } = await actorPage(browser, use));
  ({ context: teacherCtx, page: teacher } = await actorPage(browser, use));
  ({ context: studentCtx, page: student } = await actorPage(browser, use));
  ({ context: rivalCtx, page: rival } = await actorPage(browser, use));
});

test.afterAll(async () => {
  await Promise.all([adminCtx, teacherCtx, studentCtx, rivalCtx].map((context) => context?.close()));
});

test('an admin creates a teacher account, and it is audited', async ({}, testInfo) => {
  await signIn(admin, 'admin-demo@tuklas.local');
  await admin.goto('/admin');
  await expect(admin.getByRole('heading', { level: 1 })).toHaveText('Admin console');

  const form = admin.getByRole('form', { name: 'Create an account' });
  await form.getByLabel('Name').fill(`Teacher ${tag}`);
  await form.getByLabel('Email').fill(teacherEmail);
  await form.getByLabel('Role').selectOption('TEACHER');
  await form.getByLabel('Temporary password').fill(TEMP_PASSWORD);
  await form.getByRole('button', { name: 'Create account' }).click();

  await expect(admin.getByRole('status').filter({ hasText: `Account created for ${teacherEmail}` })).toBeVisible();
  await expect(admin.getByRole('row').filter({ hasText: teacherEmail })).toContainText('Teacher');
  await expect(admin.getByRole('region', { name: 'Recent admin actions' })).toContainText('Created account');
  await expectNoHorizontalScroll(admin);
  await expectAccessible(admin, 'admin console');
  await snap(admin, testInfo, 'c1-admin-console');
});

test('the new teacher signs in and creates a class with a join code', async ({}, testInfo) => {
  await signIn(teacher, teacherEmail, TEMP_PASSWORD);
  await teacher.goto('/teacher');
  await expect(teacher.getByText('You have no classes yet')).toBeVisible();

  await teacher.getByRole('link', { name: 'Create a class' }).click();
  await expect(teacher).toHaveURL(/\/teacher\/classes$/);
  await teacher.getByLabel('Class name').fill(`Sampaguita ${tag}`);
  await teacher.getByRole('button', { name: 'Create class' }).click();

  const item = teacher.locator('.review-item', { hasText: `Sampaguita ${tag}` });
  await expect(item).toBeVisible();
  await expect(item).toContainText('0 students');
  await item.getByRole('link').click();

  await expect(teacher.getByRole('heading', { level: 1 })).toHaveText(`Sampaguita ${tag}`);
  joinCode = (await teacher.locator('.join-code').first().innerText()).trim();
  expect(joinCode).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  classId = teacher.url().split('/').pop() ?? '';
  expect(classId.length).toBeGreaterThan(5);

  await expect(teacher.getByText('No students yet')).toBeVisible();
  await expectNoHorizontalScroll(teacher);
  await expectAccessible(teacher, 'empty class page');
  await snap(teacher, testInfo, 'c2-class-created');
});

test('a student registers, then joins the class with the code', async ({}, testInfo) => {
  await student.goto('/login?mode=register');
  await student.getByLabel('Display name').fill(`Student ${tag}`);
  await student.getByLabel('Email').fill(studentEmail);
  await student.getByLabel('Password').fill(STUDENT_PASSWORD);
  await student.locator('form').getByRole('button', { name: 'Create account' }).click();
  // Registering signs the student in and lands on their workspace, whose greeting names them.
  await expect(student.getByRole('heading', { level: 1 })).toContainText(`Student ${tag}`);

  await student.goto('/student');
  await expect(student.getByText('You are not in a class yet')).toBeVisible();

  // A wrong code is refused with a clear message.
  const join = student.getByRole('form', { name: 'Join a class' });
  await join.getByLabel('Join a class with a code').fill('ZZZZ-9999');
  await join.getByRole('button', { name: 'Join class' }).click();
  await expect(join.getByRole('alert')).toContainText('not valid');

  // The real code (typed in lower case, as a student might) works.
  await join.getByLabel('Join a class with a code').fill(joinCode.toLowerCase());
  await join.getByRole('button', { name: 'Join class' }).click();
  await expect(join.getByRole('status')).toContainText(`You joined Sampaguita ${tag}`);
  await expect(student.getByText(`In class: Sampaguita ${tag}`)).toBeVisible();
  await expectNoHorizontalScroll(student);
  await expectAccessible(student, 'student dashboard with class');
  await snap(student, testInfo, 'c3-student-joined');
});

test('the teacher sees the student on the roster with no invented numbers', async ({}, testInfo) => {
  await teacher.reload();
  const row = teacher.getByRole('row').filter({ hasText: studentEmail });
  await expect(row).toBeVisible();
  await expect(row).toContainText('No answers yet');
  await expect(row).toContainText('No activity');
  await expect(teacher.getByText('1 student · 0 with activity')).toBeVisible();
  // Analytics invent nothing either: no answers means no skills, no hard questions.
  const insights = teacher.getByRole('region', { name: 'Class insights' });
  await expect(insights).toContainText('No practice answers yet');
  await expect(insights.getByRole('table')).toHaveCount(0);
  await expectNoHorizontalScroll(teacher);
  await expectAccessible(teacher, 'class roster');
  await snap(teacher, testInfo, 'c4-roster-empty-student');
});

test('the teacher assigns a lesson and the student sees it', async ({}, testInfo) => {
  const assign = teacher.getByRole('form', { name: 'Assign a lesson' });
  // Any teacher can assign published curriculum, including lessons written by someone else.
  const options = await assign.getByLabel('Lesson').locator('option').allInnerTexts();
  const match = options.find((text) => text.includes(LESSON_TITLE));
  expect(match, 'the published lesson must be assignable by a new teacher').toBeTruthy();
  await assign.getByLabel('Lesson').selectOption({ label: match as string });
  const due = new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10);
  await assign.getByLabel('Due date (optional)').fill(due);
  await assign.getByRole('button', { name: 'Assign to class' }).click();
  await expect(teacher.getByRole('status').filter({ hasText: 'Lesson assigned.' })).toBeVisible();
  await expect(teacher.locator('.review-item', { hasText: LESSON_TITLE })).toContainText('0 of 1 completed');

  await student.goto('/student');
  const item = student.locator('.review-item', { hasText: LESSON_TITLE }).first();
  await expect(item).toContainText('Not started');
  await expect(item).toContainText(`Sampaguita ${tag}`);
  await expect(item).toContainText('due');
  await expect(item).not.toContainText('Overdue');
  await snap(student, testInfo, 'c5-student-assignment');
});

test('after the student practices, the teacher sees real activity and accuracy', async ({}, testInfo) => {
  await student.goto('/student');
  await student.getByRole('region', { name: 'Your classes and assignments' }).getByRole('link', { name: LESSON_TITLE }).click();
  await student.getByRole('button', { name: 'Practice this lesson' }).click();
  await expect(student).toHaveURL(/\/student\/practice\//);

  for (let n = 1; n <= 3; n += 1) {
    const question = (await student.locator('legend.practice-question').innerText()).trim();
    await student.getByRole('radio', { name: solveExpression(question), exact: true }).check();
    await student.getByRole('button', { name: 'Submit answer' }).click();
    await expect(student.getByRole('status').filter({ hasText: 'Correct!' })).toBeVisible();
    await student.getByRole('button', { name: 'Next question' }).click();
  }

  await teacher.reload();
  const row = teacher.getByRole('row').filter({ hasText: studentEmail });
  await expect(row).toContainText('100%');
  await expect(row).toContainText('Learning'); // three answers are far too few to claim more
  await expect(teacher.getByText('1 student · 1 with activity')).toBeVisible();
  await expect(row).not.toContainText('No activity');
  await expectAccessible(teacher, 'roster with activity');
  await snap(teacher, testInfo, 'c6-roster-with-activity');
});

test('class insights and the student page are built from the practice that happened', async ({}, testInfo) => {
  await teacher.reload();
  const insights = teacher.getByRole('region', { name: 'Class insights' });
  await expect(insights).toContainText('Last 14 days: 1 of 1 students practised, answering 3 questions with 100% correct.');
  await expect(insights.getByRole('list', { name: /Questions answered each day/ }).getByRole('listitem')).toHaveCount(14);
  await expect(insights.getByRole('list', { name: /Questions answered each day/ })).toContainText('3 questions, 1 student');
  await expect(insights.getByRole('table', { name: 'Class standing by skill' }).getByRole('row')).not.toHaveCount(1); // header + at least one skill
  // Three answers are too few to call any question hard, and the page says why.
  await expect(insights).toContainText('None yet. A question is listed when at least 2 students tried it 3+ times');
  await expectNoHorizontalScroll(teacher);
  await expectAccessible(teacher, 'class insights');
  await snap(teacher, testInfo, 'c8-class-insights');

  await teacher.getByRole('link', { name: `View details for Student ${tag}` }).click();
  await expect(teacher.getByRole('heading', { level: 1 })).toHaveText(`Student ${tag}`);
  await expect(teacher.getByText('3 questions answered, 100% correct; 3 in the last 14 days.')).toBeVisible();
  await expect(teacher.getByRole('region', { name: 'Recent practice' })).toContainText('3 of 10 answered, not finished');
  await expectNoHorizontalScroll(teacher);
  await expectAccessible(teacher, 'student detail');
  await snap(teacher, testInfo, 'c9-student-detail');
  await teacher.goBack();
});

test('another teacher cannot read this class’s insights or its students through the API', async () => {
  await signIn(rival, 'teacher-demo@tuklas.local');
  expect((await rival.request.get(`/api/classes/${classId}/insights`)).status()).toBe(404);
  const studentId = await teacher.evaluate(async (id) => {
    const response = await fetch(`/api/classes/${id}`);
    return (await response.json()).data.students[0].id as string;
  }, classId);
  expect((await rival.request.get(`/api/classes/${classId}/students/${studentId}`)).status()).toBe(404);
});

test('other teachers, students and visitors cannot reach the class', async ({}, testInfo) => {
  // A different teacher cannot open this class by guessing its id.
  await signIn(rival, 'teacher-demo@tuklas.local');
  await rival.goto(`/teacher/classes/${classId}`);
  await expect(rival.getByText('Class not found.')).toBeVisible();
  await expect(rival.getByText(studentEmail)).toHaveCount(0);
  await rival.goto('/teacher/classes');
  await expect(rival.getByText(`Sampaguita ${tag}`)).toHaveCount(0);
  // ... and cannot open the admin console either.
  await rival.goto('/admin');
  await expect(rival).toHaveURL(/\/unauthorized$/);

  // A student cannot open teacher pages.
  await student.goto('/teacher/classes');
  await expect(student).toHaveURL(/\/unauthorized$/);
  await student.goto(`/teacher/classes/${classId}`);
  await expect(student).toHaveURL(/\/unauthorized$/);

  // A visitor who is not signed in is sent to sign in.
  const visitor = await (await rivalCtx.browser()!.newContext(testInfo.project.use as never)).newPage();
  await visitor.goto('/teacher/classes');
  await expect(visitor).toHaveURL(/\/login$/);
  await visitor.close();
});

test('rotating the join code stops the old one working', async () => {
  await teacher.reload();
  await teacher.getByRole('button', { name: 'Create a new code' }).click();
  await expect(teacher.getByRole('status').filter({ hasText: 'New join code created' })).toBeVisible();
  // The notice appears a moment before the refreshed class data arrives, so wait for the change.
  await expect(teacher.locator('.join-code').first()).not.toHaveText(joinCode);
  const fresh = (await teacher.locator('.join-code').first().innerText()).trim();
  expect(fresh).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);

  // The student (a different person from the teacher) tries the OLD code: it must be refused.
  await student.goto('/student');
  const join = student.getByRole('form', { name: 'Join a class' });
  await join.getByLabel('Join a class with a code').fill(joinCode);
  await join.getByRole('button', { name: 'Join class' }).click();
  await expect(join.getByRole('alert')).toContainText('not valid');
});

test('deactivating the teacher signs them out immediately', async ({}, testInfo) => {
  await admin.goto('/admin');
  await admin.getByLabel('Search').fill(teacherEmail);
  const row = admin.getByRole('row').filter({ hasText: teacherEmail });
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: /^Deactivate/ }).click();
  await expect(admin.getByRole('status').filter({ hasText: 'was deactivated and signed out' })).toBeVisible();
  await expect(row).toContainText('Deactivated');
  await expect(admin.getByRole('region', { name: 'Recent admin actions' })).toContainText('Deactivated account');
  await snap(admin, testInfo, 'c7-teacher-deactivated');

  // The teacher's open session no longer works.
  await teacher.goto('/teacher/classes');
  await expect(teacher).toHaveURL(/\/login$/);
  // And they cannot sign back in.
  await signInExpectFailure(teacher, teacherEmail, TEMP_PASSWORD);
});

async function signInExpectFailure(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.getByLabel('Email Address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
}

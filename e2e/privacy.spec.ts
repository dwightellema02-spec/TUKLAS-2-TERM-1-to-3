import AxeBuilder from '@axe-core/playwright';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { expectNoHorizontalScroll, snap } from './helpers';

test.describe.configure({ mode: 'serial' });

const PASSWORD = 'StudentPass12345!';
const LESSON_TITLE = 'Operations on Integers';
let email = '';

async function expectAccessible(page: Page, label: string) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  const serious = results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
  expect(serious.map((v) => `${v.id}: ${v.help} -> ${v.nodes.map((n) => n.html.slice(0, 100)).join(' | ')}`), label).toEqual([]);
}

let context: BrowserContext;
let page: Page;

test.beforeAll(async ({ browser }, testInfo) => {
  email = `e2e-privacy-${testInfo.project.name}-${Date.now()}@example.test`;
  context = await browser.newContext(testInfo.project.use as never);
  page = await context.newPage();
  const response = await page.request.post('/api/auth/register', { data: { email, password: PASSWORD, displayName: 'Privacy Student', role: 'STUDENT' } });
  expect(response.status()).toBe(201);
});

test.afterAll(async () => {
  await context?.close();
});

test('the tutor tells the student not to type personal details, and a bad reply can be reported', async ({}, testInfo) => {
  await page.goto('/student');
  await page.getByRole('region', { name: 'Your learning path' }).getByRole('link', { name: LESSON_TITLE }).click();
  const tutor = page.getByRole('region', { name: 'Ask about this lesson' });
  await tutor.getByRole('button', { name: 'Need help? Ask Tuklas' }).click();
  await expect(tutor).toContainText('Please do not type personal details');

  const replies = tutor.getByRole('log').locator('.tutor-message.assistant');
  const form = tutor.getByRole('form', { name: 'Ask a question' });
  await form.getByLabel('Your question').fill('What does subtracting a negative mean?');
  await form.getByRole('button', { name: 'Send' }).click();
  await expect(replies).toHaveCount(1);

  await tutor.getByRole('button', { name: 'Report this reply' }).click();
  const report = tutor.getByRole('form', { name: 'Report this reply' });
  await report.getByLabel('What was wrong?').selectOption('CONFUSING');
  await report.getByLabel('Tell your teacher more (optional)').fill('I did not follow the last step');
  await expectNoHorizontalScroll(page);
  await expectAccessible(page, 'report form');
  await report.getByRole('button', { name: 'Send report' }).click();
  await expect(tutor).toContainText('Thank you. Your teacher can see that you reported this reply.');
  await snap(page, testInfo, 'privacy-1-report-reply');
});

test('the student can see what is kept, download it, and the file is theirs only', async ({}, testInfo) => {
  await page.goto('/student');
  await page.getByRole('link', { name: 'My data' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('My data');
  await expect(page.getByRole('region', { name: 'What Tuklas keeps' })).toContainText('Your name and email are not sent');
  await expectNoHorizontalScroll(page);
  await expectAccessible(page, 'privacy page');
  await snap(page, testInfo, 'privacy-2-my-data');

  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('link', { name: 'Download my data' }).click()]);
  expect(download.suggestedFilename()).toBe('tuklas-my-data.json');
  const text = await (await import('node:fs/promises')).readFile(await download.path(), 'utf8');
  const data = JSON.parse(text).data;
  expect(data.account.email).toBe(email);
  expect(data.tutorConversations[0].messages[0].content).toBe('What does subtracting a negative mean?');
  expect(data.repliesYouReported).toHaveLength(1);
  expect(text).not.toMatch(/passwordHash|pbkdf2/);
});

test('deleting the account needs the password and the word DELETE, then removes everything', async () => {
  await page.goto('/student/privacy');
  const form = page.getByRole('form', { name: 'Delete my account' });
  const button = form.getByRole('button', { name: 'Delete my account' });
  await expect(button).toBeDisabled();

  await form.getByLabel('Your password').fill('WrongPassword123!');
  await form.getByLabel('Type DELETE to confirm').fill('DELETE');
  await button.click();
  await expect(form.getByRole('alert')).toContainText('That password is not correct.');

  await form.getByLabel('Your password').fill(PASSWORD);
  await button.click();
  await expect(page.getByRole('status')).toContainText('were removed');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Your account was deleted');

  // The account is gone: signing in with the same details fails and the old session is dead.
  await page.goto('/student');
  await expect(page).toHaveURL(/\/login/);
  await page.getByLabel('Email Address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page.getByRole('alert')).toBeVisible();
});

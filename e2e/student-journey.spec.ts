import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { expectNoHorizontalScroll, signIn, snap, solveExpression, studentFor } from './helpers';

test.describe.configure({ mode: 'serial' });

const LESSON_TITLE = 'Operations on Integers';
let missedQuestion = '';

async function expectAccessible(page: Page, label: string) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  const serious = results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
  expect(
    serious.map(
      (v) =>
        `${v.id}: ${v.help} -> ${v.nodes
          .map((n) => `${n.html.slice(0, 110)} [${n.any[0]?.message ?? ''}]`)
          .join(' | ')}`,
    ),
    `accessibility violations on ${label}`,
  ).toEqual([]);
}

async function openLessonFromDashboard(page: Page) {
  await page.goto('/student');
  await page
    .getByRole('region', { name: 'Your learning path' })
    .getByRole('link', { name: LESSON_TITLE })
    .click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText(LESSON_TITLE);
}

test('visitors who are not signed in are sent to the sign-in page', async ({ page }) => {
  for (const path of ['/student', '/student/mistakes', '/student/practice/anything']) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login$/);
  }
});

test('the dashboard shows the student’s real learning path', async ({ page }, testInfo) => {
  const student = studentFor(testInfo);
  await signIn(page, student.email);
  await page.goto('/student');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Welcome back');

  const path = page.getByRole('region', { name: 'Your learning path' });
  await expect(path.getByRole('link', { name: LESSON_TITLE })).toBeVisible();
  await expect(path.getByText('Not started').first()).toBeVisible();
  await expect(page.getByText('Server-Authoritative Tracking Active')).toHaveCount(0);
  await expect(page.locator('.stat-card', { hasText: 'lessons completed' })).toContainText('0');
  await expect(page.locator('.stat-card', { hasText: 'to review' })).toContainText('0');

  // Demo-only content must never be offered to students.
  await expect(page.getByText('DEMO ONLY')).toHaveCount(0);

  await expectNoHorizontalScroll(page);
  await expectAccessible(page, 'student dashboard');
  await snap(page, testInfo, '1-dashboard-new-student');
});

test('knowledge checks are graded by the server and gate lesson completion', async ({ page }, testInfo) => {
  const student = studentFor(testInfo);
  await signIn(page, student.email);

  const lessonResponse = page.waitForResponse(
    (r) => /\/api\/lessons\/[^/]+$/.test(r.url()) && r.request().method() === 'GET',
  );
  await openLessonFromDashboard(page);
  const lessonBody = await (await lessonResponse).text();

  // The answer key never reaches the student's browser.
  const checks = JSON.parse(lessonBody).data.lesson.checks as Array<Record<string, unknown>>;
  expect(checks.length).toBeGreaterThanOrEqual(2);
  for (const check of checks) {
    expect(check).not.toHaveProperty('correctIndex');
    expect(check).not.toHaveProperty('explanation');
    expect(check).not.toHaveProperty('correctAnswer');
  }

  // Forging completion does not work.
  await page.getByRole('button', { name: 'Mark lesson complete' }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Answer all knowledge checks correctly' }),
  ).toBeVisible();

  const items = page.locator('section:has(h2:text("Knowledge Checks")) > ol > li');
  const count = await items.count();
  expect(count).toBeGreaterThanOrEqual(2);
  for (let i = 0; i < count; i += 1) {
    const item = items.nth(i);
    const question = await item.locator('p').first().innerText();
    const answer = solveExpression(question);
    const labels = item.locator('label');
    const total = await labels.count();

    // First a wrong answer: the server says "not quite" and reveals no explanation.
    let wrong = 0;
    for (let r = 0; r < total; r += 1) {
      const label = (await labels.nth(r).innerText()).trim().replace('-', '−');
      if (label !== answer) {
        wrong = r;
        break;
      }
    }
    await item.getByRole('radio').nth(wrong).check();
    await item.getByRole('button', { name: 'Check answer' }).click();
    await expect(item.getByRole('status')).toContainText('Not quite');

    // Then the right one.
    await labels.filter({ hasText: new RegExp(`^\\s*${answer.replace('−', '[−-]')}\\s*$`) }).locator('input').check();
    await item.getByRole('button', { name: 'Check answer' }).click();
    await expect(item.getByRole('status')).toContainText('Correct!');
  }

  await page.getByRole('button', { name: 'Mark lesson complete' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Lesson marked complete.' })).toBeVisible();
  await expectNoHorizontalScroll(page);
  await expectAccessible(page, 'lesson page');
  await snap(page, testInfo, '2-lesson-checks-completed');
});

test('practice comes from the lesson, records a mistake, and explains it', async ({ page }, testInfo) => {
  const student = studentFor(testInfo);
  await signIn(page, student.email);
  await openLessonFromDashboard(page);

  const firstLoad = page.waitForResponse(
    (r) => /\/api\/practice\/sessions\/[^/]+$/.test(r.url()) && r.request().method() === 'GET',
  );
  await page.getByRole('button', { name: 'Practice this lesson' }).click();
  await expect(page).toHaveURL(/\/student\/practice\//);

  // Before answering, the page data holds no answer key and no explanations.
  const initial = await (await firstLoad).text();
  expect(initial).not.toContain('"correctIndex"');
  expect(initial).not.toContain('"explanation"');

  await expect(page.getByText(/Question 1 of 10/)).toBeVisible();
  await expectNoHorizontalScroll(page);
  await expectAccessible(page, 'practice question');
  await snap(page, testInfo, '3-practice-question');

  // Tap targets are comfortably large (also on a phone).
  const optionHeight = await page
    .locator('label.option-choice')
    .first()
    .evaluate((el) => el.getBoundingClientRect().height);
  expect(optionHeight).toBeGreaterThanOrEqual(44);

  for (let n = 1; n <= 10; n += 1) {
    await expect(page.getByText(new RegExp(`Question ${n} of 10`))).toBeVisible();
    const question = (await page.locator('legend.practice-question').innerText()).trim();
    const answer = solveExpression(question);

    if (n === 1) {
      missedQuestion = question;
      // Deliberately choose a wrong option.
      const labels = page.locator('label.option-choice');
      const total = await labels.count();
      let wrongIndex = 0;
      for (let i = 0; i < total; i += 1) {
        const text = (await labels.nth(i).innerText()).trim();
        if (text !== answer) {
          wrongIndex = i;
          break;
        }
      }
      await page.getByRole('radio').nth(wrongIndex).check();
      await page.getByRole('button', { name: 'Submit answer' }).click();
      const feedback = page.getByRole('status').filter({ hasText: 'Not quite.' });
      await expect(feedback).toBeVisible();
      await expect(feedback).toBeFocused(); // keyboard and screen-reader users land on the result
      await expect(page.locator('.option-tag', { hasText: 'Correct answer' })).toBeVisible();
      await expectAccessible(page, 'practice feedback');
      await snap(page, testInfo, '4-practice-wrong-answer-feedback');
    } else {
      await page.getByRole('radio', { name: answer, exact: true }).check();
      await page.getByRole('button', { name: 'Submit answer' }).click();
      await expect(page.getByRole('status').filter({ hasText: 'Correct!' })).toBeVisible();
    }
    await page.getByRole('button', { name: n === 10 ? 'See my results' : 'Next question' }).click();
  }

  await expect(page.getByText('9 of 10 correct')).toBeVisible();
  const review = page.locator('.review-item.missed');
  await expect(review).toHaveCount(1);
  await expect(review).toContainText(missedQuestion);
  await expectNoHorizontalScroll(page);
  await expectAccessible(page, 'practice results');
  await snap(page, testInfo, '5-practice-results');

  // The mistake is saved for review, with the reason.
  await page.getByRole('link', { name: 'Review my mistakes' }).click();
  await expect(page).toHaveURL(/\/student\/mistakes$/);
  const mistakes = page.locator('.review-item');
  await expect(mistakes).toHaveCount(1);
  await expect(mistakes).toContainText('You answered');
  await expect(mistakes).toContainText('Correct answer');
  await expectNoHorizontalScroll(page);
  await expectAccessible(page, 'mistakes page');
  await snap(page, testInfo, '6-mistakes-to-review');

  await page.getByRole('button', { name: 'I understand this now' }).click();
  await expect(page.getByText('No mistakes to review.')).toBeVisible();
  await page.getByRole('button', { name: 'Understood' }).click();
  await expect(page.locator('.review-item')).toHaveCount(1);
});

test('the dashboard reflects the completed lesson, practice and review', async ({ page }, testInfo) => {
  const student = studentFor(testInfo);
  await signIn(page, student.email);
  await page.goto('/student');

  const path = page.getByRole('region', { name: 'Your learning path' });
  await expect(path.locator('.review-item', { hasText: LESSON_TITLE }).getByText('Completed')).toBeVisible();
  await expect(page.locator('.stat-card', { hasText: 'practice sessions' })).toContainText('1');
  await expect(page.locator('.stat-card', { hasText: 'to review' })).toContainText('0');
  await expect(page.getByRole('region', { name: 'Recent practice' })).toContainText('9 of 10 correct');
  await expectAccessible(page, 'updated dashboard');
  await snap(page, testInfo, '7-dashboard-after-learning');
});

test('practicing again brings back the question that was missed', async ({ page }, testInfo) => {
  const student = studentFor(testInfo);
  await signIn(page, student.email);
  await openLessonFromDashboard(page);
  await page.getByRole('button', { name: 'Practice this lesson' }).click();
  await expect(page).toHaveURL(/\/student\/practice\//);

  await expect(page.locator('legend.practice-question')).toHaveText(missedQuestion);

  // Questions answered correctly last time are not repeated while unseen ones remain.
  const seen: string[] = [];
  for (let n = 1; n <= 3; n += 1) {
    const text = (await page.locator('legend.practice-question').innerText()).trim();
    seen.push(text);
    await page.getByRole('radio', { name: solveExpression(text), exact: true }).check();
    await page.getByRole('button', { name: 'Submit answer' }).click();
    await page.getByRole('button', { name: 'Next question' }).click();
  }
  expect(new Set(seen).size).toBe(3);
});

test('a student cannot open another student’s practice session', async ({ page, browser }, testInfo) => {
  const student = studentFor(testInfo);
  await signIn(page, student.email);
  await openLessonFromDashboard(page);
  await page.getByRole('button', { name: 'Practice this lesson' }).click();
  await expect(page).toHaveURL(/\/student\/practice\//);
  const sessionUrl = page.url();

  const other = await browser.newContext();
  const otherPage = await other.newPage();
  const otherEmail = student.email.includes('juan') ? 'student-maria@tuklas.local' : 'student-juan@tuklas.local';
  await signIn(otherPage, otherEmail);
  await otherPage.goto(sessionUrl);
  await expect(otherPage.getByText('Practice session not found.')).toBeVisible();
  // ... and none of the other student's questions are rendered.
  await expect(otherPage.locator('legend.practice-question')).toHaveCount(0);
  await other.close();
});

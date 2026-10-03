import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { expectNoHorizontalScroll, signIn, snap, studentFor } from './helpers';

test.describe.configure({ mode: 'serial' });

const TERM1_TITLES = [
  'Polygons and Their Angles',
  'Percentage Change and Money Problems',
  'Rates and Speed',
  'Rational Numbers: Fractions, Decimals and Percents',
  'Square Roots, Cube Roots and Irrational Numbers',
];
const ROOTS = TERM1_TITLES[4];

async function expectAccessible(page: Page, label: string) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  const serious = results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
  expect(
    serious.map((v) => `${v.id}: ${v.help} -> ${v.nodes.map((n) => n.html.slice(0, 110)).join(' | ')}`),
    `accessibility violations on ${label}`,
  ).toEqual([]);
}

/** Solves a roots practice question the way a student would, from the numbers shown. */
function solveRoots(question: string): string {
  const fmt = (n: number) => (n < 0 ? `−${Math.abs(n)}` : String(n));
  let m = /square root of (\d+)/.exec(question);
  if (m) return fmt(Math.round(Math.sqrt(Number(m[1]))));
  m = /cube root of (−?\d+)/.exec(question);
  if (m) return fmt(Math.round(Math.cbrt(Number(m[1].replace('−', '-')))));
  m = /√(\d+)/.exec(question);
  if (m) {
    const low = Math.floor(Math.sqrt(Number(m[1])));
    return `${low} and ${low + 1}`;
  }
  throw new Error(`Cannot solve: ${question}`);
}

test('the learning path offers the five Grade 7 Term 1 lessons and no demo content', async ({ page }, testInfo) => {
  await signIn(page, studentFor(testInfo).email);
  await page.goto('/student');
  const path = page.getByRole('region', { name: 'Your learning path' });
  for (const title of TERM1_TITLES) await expect(path.getByRole('link', { name: title })).toBeVisible();
  await expect(page.getByText('DEMO ONLY')).toHaveCount(0);
  await expectNoHorizontalScroll(page);
  await expectAccessible(page, 'dashboard with Term 1 lessons');
  await snap(page, testInfo, 't1-1-learning-path');
});

test('every Term 1 lesson page opens with its sections, without leaking answers, and is accessible', async ({ page }, testInfo) => {
  await signIn(page, studentFor(testInfo).email);
  for (const title of TERM1_TITLES) {
    const response = page.waitForResponse((r) => /\/api\/lessons\/[^/]+$/.test(r.url()) && r.request().method() === 'GET');
    await page.goto('/student');
    await page.getByRole('region', { name: 'Your learning path' }).getByRole('link', { name: title }).click();
    await expect(page.getByRole('heading', { level: 1 })).toContainText(title);
    const body = await (await response).text();
    const lesson = JSON.parse(body).data.lesson;
    expect(lesson.sections.length).toBeGreaterThanOrEqual(3);
    expect(lesson.checks).toHaveLength(2);
    for (const check of lesson.checks) {
      expect(check).not.toHaveProperty('correctIndex');
      expect(check).not.toHaveProperty('explanation');
    }
    await expect(page.getByRole('button', { name: 'Practice this lesson' })).toBeVisible();
    await expectNoHorizontalScroll(page);
    await expectAccessible(page, `lesson page: ${title}`);
  }
  await snap(page, testInfo, 't1-2-lesson-page');
});

test('practice on a Term 1 lesson is graded from its own computed bank', async ({ page }, testInfo) => {
  await signIn(page, studentFor(testInfo).email);
  await page.goto('/student');
  await page.getByRole('region', { name: 'Your learning path' }).getByRole('link', { name: ROOTS }).click();
  await page.getByRole('button', { name: 'Practice this lesson' }).click();
  await expect(page).toHaveURL(/\/student\/practice\//);

  for (let n = 1; n <= 10; n += 1) {
    await expect(page.getByText(new RegExp(`Question ${n} of 10`))).toBeVisible();
    const question = (await page.locator('legend.practice-question').innerText()).trim();
    await page.getByRole('radio', { name: solveRoots(question), exact: true }).check();
    await page.getByRole('button', { name: 'Submit answer' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Correct!' })).toBeVisible();
    await page.getByRole('button', { name: n === 10 ? 'See my results' : 'Next question' }).click();
  }

  await expect(page.getByText('10 of 10 correct')).toBeVisible();
  // Ten answers across three skills are too few to claim mastery, whatever the score.
  const skills = page.getByRole('region', { name: 'Your skills after this practice' });
  await expect(skills.locator('.review-item')).toHaveCount(3);
  await expect(skills.locator('.status-chip.level-mastered')).toHaveCount(0);
  await expectNoHorizontalScroll(page);
  await expectAccessible(page, 'Term 1 practice results');
  await snap(page, testInfo, 't1-3-practice-results');
});

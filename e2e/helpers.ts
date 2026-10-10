import { mkdirSync } from 'node:fs';
import { expect, type Page, type TestInfo } from '@playwright/test';

export const PASSWORD = 'DemoPassword123!';

/** Desktop and mobile projects use different seeded students so their runs do not collide. */
export function studentFor(testInfo: TestInfo) {
  return testInfo.project.name === 'mobile'
    ? { email: 'student-maria@tuklas.local', name: 'Maria' }
    : { email: 'student-juan@tuklas.local', name: 'Juan' };
}

export async function signIn(page: Page, email: string, password = PASSWORD) {
  await page.goto('/login');
  await page.getByLabel('Email Address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign In' }).click();
  // Wait for the login to finish (the app leaves /login on success) before doing anything else.
  await page.waitForURL((url) => !url.pathname.startsWith('/login'));
}

/** On a phone the sidebar sits behind a Menu button; open it so its links can be clicked. */
export async function openNav(page: Page) {
  const menu = page.getByRole('button', { name: 'Menu', exact: true });
  if (await menu.isVisible()) await menu.click();
}

export async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, 'page must not scroll sideways').toBeLessThanOrEqual(1);
}

const toNumber = (text: string) => Number(text.replace('−', '-').replace(/[()\s]/g, ''));

/**
 * Solves the first arithmetic expression in a question the way a student would,
 * e.g. "What is (−8) + 15?" or "What is the value of (-6) * (-4)?".
 * The result uses the unicode minus sign the practice options are written with.
 */
export function solveExpression(text: string): string {
  const match = /(\(?[−-]?\d+\)?)\s*([+−\-×÷*/])\s*(\(?[−-]?\d+\)?)/.exec(text);
  if (!match) throw new Error(`Cannot solve: ${text}`);
  const a = toNumber(match[1]);
  const b = toNumber(match[3]);
  const op = match[2];
  const value =
    op === '+' ? a + b : op === '−' || op === '-' ? a - b : op === '×' || op === '*' ? a * b : a / b;
  return value < 0 ? `−${Math.abs(value)}` : String(value);
}

/** Saves a screenshot as review evidence: docs/evidence/phase7/<project>-<name>.png */
export async function snap(page: Page, testInfo: TestInfo, name: string) {
  mkdirSync('docs/evidence/phase7', { recursive: true });
  await page.screenshot({ path: `docs/evidence/phase7/${testInfo.project.name}-${name}.png`, fullPage: true });
}

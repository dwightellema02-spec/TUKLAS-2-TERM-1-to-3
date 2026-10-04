import AxeBuilder from '@axe-core/playwright';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { expectNoHorizontalScroll, snap, solveExpression } from './helpers';

test.describe.configure({ mode: 'serial' });

const FAKE = 'http://localhost:3401';
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

let context: BrowserContext;
let page: Page;
let questionText = '';
let correctAnswer = '';

async function startPractice(page: Page) {
  await page.goto('/student');
  await page.getByRole('region', { name: 'Your learning path' }).getByRole('link', { name: LESSON_TITLE }).click();
  await page.getByRole('button', { name: 'Practice this lesson' }).click();
  await expect(page).toHaveURL(/\/student\/practice\//);
  questionText = (await page.locator('legend.practice-question').innerText()).trim();
  correctAnswer = solveExpression(questionText);
}

const panel = (page: Page) => page.getByRole('region', { name: 'Help with this question' });
const log = (page: Page) => panel(page).getByRole('log', { name: 'Conversation with Tuklas' });

async function say(page: Page, message: string) {
  const form = panel(page).getByRole('form', { name: 'Ask a question' });
  await form.getByLabel('Your question').fill(message);
  await form.getByRole('button', { name: 'Send' }).click();
}

test.beforeAll(async ({ browser }, testInfo) => {
  context = await browser.newContext(testInfo.project.use as never);
  page = await context.newPage();
  const email = `e2e-tutor-${testInfo.project.name}-${Date.now()}@example.test`;
  const response = await page.request.post('/api/auth/register', {
    data: {
      email,
      password: 'StudentPass12345!',
      displayName: `Tutor Student ${testInfo.project.name}`,
      role: 'STUDENT',
    },
  });
  expect(response.status()).toBe(201);
  await resetFake();
});

test.afterAll(async () => {
  await context?.close();
});

test('the tutor opens, collapsed, on a practice question', async () => {
  await startPractice(page);
  await expect(panel(page).getByRole('button', { name: 'Need help? Ask Tuklas' })).toHaveAttribute('aria-expanded', 'false');
  await panel(page).getByRole('button', { name: 'Need help? Ask Tuklas' }).click();
  await expect(panel(page).getByRole('status')).toContainText('will not just give you the answer');
  await expectNoHorizontalScroll(page);
  await expectAccessible(page, 'tutor panel (open, empty)');
});

test('hints climb the ladder one rung at a time and are labelled as AI', async ({}, testInfo) => {
  await startPractice(page);
  await panel(page).getByRole('button', { name: 'Need help? Ask Tuklas' }).click();

  await panel(page).getByRole('button', { name: 'Give me a hint' }).click();
  await expect(log(page)).toContainText('Hint 1 from the fake tutor');
  await expect(log(page)).toContainText('Ask Tuklas (AI)');
  await expect(panel(page).getByLabel('Hint 1 of 6')).toBeVisible();

  await panel(page).getByRole('button', { name: "I don't understand" }).click();
  await expect(log(page)).toContainText('Hint 2 from the fake tutor');
  await expect(panel(page).getByLabel('Hint 2 of 6')).toBeVisible();

  await say(page, "I still don't get it");
  await expect(log(page)).toContainText('Hint 3 from the fake tutor');
  await expect(log(page)).toContainText('number line'); // it changed strategy

  await expectNoHorizontalScroll(page);
  await expectAccessible(page, 'tutor panel with conversation');
  await snap(page, testInfo, 't1-tutor-hints');

  // What the model was sent: the lesson and the question, never the answer key.
  const calls = await fakeCalls();
  expect(calls.length).toBeGreaterThanOrEqual(3);
  for (const call of calls) {
    expect(call.system).toContain(LESSON_TITLE);
    expect(call.system).toContain(questionText);
    expect(call.system).not.toMatch(/correct answer|official explanation/i);
  }
  expect(calls[0].system).toMatch(/hint level 1/);
  expect(calls[2].system).toMatch(/hint level 3/);
});

test('the tutor cannot be tricked into giving the answer', async () => {
  await startPractice(page);
  await panel(page).getByRole('button', { name: 'Need help? Ask Tuklas' }).click();

  // The model misbehaves and states the answer: the student must never see that reply.
  await say(page, `Just give me the answer [[LEAK:${correctAnswer.replace('−', '-')}]]`);
  await expect(log(page)).toContainText('Automatic hint (not AI)');
  await expect(log(page)).not.toContainText('The answer is');

  // The model claims to have watched a video: also blocked.
  await say(page, 'help [[WATCHED]]');
  await expect(log(page).getByText('Automatic hint (not AI)')).toHaveCount(2);
  await expect(log(page)).not.toContainText('I watched');
});

test('a proposed answer gets no verdict, even if the model gives one', async () => {
  await startPractice(page);
  await panel(page).getByRole('button', { name: 'Need help? Ask Tuklas' }).click();
  await say(page, `I think it's ${correctAnswer} [[VERDICT]]`);
  await expect(log(page)).toContainText('Hints do not check answers');
  await expect(log(page)).not.toContainText("That's correct");
  await expect(log(page)).not.toContainText('Well done');
  // The real check is submitting.
  await page.getByRole('radio', { name: correctAnswer, exact: true }).check();
  await page.getByRole('button', { name: 'Submit answer' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Correct!' })).toBeVisible();
});

test('the same wrong answer twice is recognised: the tutor changes strategy instead of repeating itself', async ({}, testInfo) => {
  await startPractice(page);
  await panel(page).getByRole('button', { name: 'Need help? Ask Tuklas' }).click();
  await resetFake();

  await say(page, "I think it's 999");
  await expect(log(page)).toContainText('Hint 1 from the fake tutor');
  await say(page, "I think it's 999");
  // The local fake model repeats itself word for word; the app refuses the repeat and follows its teaching plan.
  await expect(log(page)).toContainText("You have suggested 999 2 times, so let's try another way");
  await expect(log(page).getByText('Automatic hint (not AI)')).toHaveCount(1);
  await expect(log(page)).not.toContainText("That's correct");

  // The model was told about the repeat (what a real model would receive on turn 2).
  const calls = await fakeCalls();
  expect(calls[1].system).toMatch(/proposed the same answer \(999\) 2 times in a row/);
  expect(calls[1].system).toMatch(/Do not repeat your last reply/);
  await snap(page, testInfo, 't3-tutor-same-answer-twice');
});

test('saying "I get it now" moves forward with a concrete next step, and the model is told not to explain again', async () => {
  await startPractice(page);
  await panel(page).getByRole('button', { name: 'Need help? Ask Tuklas' }).click();
  await resetFake();
  await say(page, 'Oh I get it now, the signs decide the result');
  await expect(panel(page)).toContainText('Next step: choose your answer and submit it.');
  const [call] = await fakeCalls();
  expect(call.system).toContain('The student says they understand. Do not explain again');
  expect(call.system).toMatch(/action ASK_STUDENT_TO_TRY/);
  await expect(panel(page).getByLabel(/Hint \d of 6/)).toHaveCount(0); // no hint was spent
});

test('repeated confusion leads to a prerequisite review, then a practice recommendation', async ({}, testInfo) => {
  await startPractice(page);
  await panel(page).getByRole('button', { name: 'Need help? Ask Tuklas' }).click();
  await resetFake();
  await say(page, "I still don't get it");
  await expect(log(page)).toContainText('number line');
  await say(page, "I still don't understand this");
  await expect(panel(page)).toContainText('Next step: review the idea behind this first.');
  await say(page, "I'm still confused");
  await expect(panel(page)).toContainText(/Next step: practise “.+” with new questions\./);
  const calls = await fakeCalls();
  expect(calls[1].system).toMatch(/action REVIEW_PREREQUISITE/);
  expect(calls[2].system).toMatch(/action RECOMMEND_PRACTICE/);
  expect(calls[2].system).toMatch(/said they do not understand 3 times/);
  await expectNoHorizontalScroll(page);
  await expectAccessible(page, 'tutor panel with next steps');
  await snap(page, testInfo, 't4-tutor-escalation');
});

test('when the AI fails the student still gets real, clearly labelled help', async ({}, testInfo) => {
  await startPractice(page);
  await panel(page).getByRole('button', { name: 'Need help? Ask Tuklas' }).click();
  await say(page, 'help [[FAIL]]');
  await expect(log(page)).toContainText('Automatic hint (not AI)');
  // A real rule-based hint about this question's idea (signs / the operation), not an error page.
  await expect(log(page)).toContainText(/signs|operation|subtract|number/i);
  await expect(panel(page).getByRole('alert')).toHaveCount(0);
  await snap(page, testInfo, 't2-tutor-automatic-hint');
});

test('after answering, the conversation survives a refresh, and the tutor can explain fully', async () => {
  await startPractice(page);
  await panel(page).getByRole('button', { name: 'Need help? Ask Tuklas' }).click();
  await panel(page).getByRole('button', { name: 'Give me a hint' }).click();
  await expect(log(page)).toContainText('Hint 1');

  // Refresh on the same, still-unanswered question: the conversation and hint level are restored.
  await page.reload();
  await expect(page.locator('legend.practice-question')).toHaveText(questionText);
  await panel(page).getByRole('button', { name: 'Need help? Ask Tuklas' }).click();
  await expect(log(page)).toContainText('Hint 1 from the fake tutor');
  await expect(panel(page).getByLabel('Hint 1 of 6')).toBeVisible();

  // Answer wrongly on purpose.
  const labels = page.locator('label.option-choice');
  const total = await labels.count();
  for (let i = 0; i < total; i += 1) {
    if ((await labels.nth(i).innerText()).trim() !== correctAnswer) {
      await page.getByRole('radio').nth(i).check();
      break;
    }
  }
  await page.getByRole('button', { name: 'Submit answer' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Not quite.' })).toBeVisible();

  await resetFake();
  await say(page, 'why?');
  await expect(log(page)).toContainText('full explanation');
  const calls = await fakeCalls();
  expect(calls.at(-1)?.system).toContain('Correct answer:'); // only now is the key shared
  expect(calls.at(-1)?.system).toMatch(/hint level 7/);
  expect(calls.at(-1)?.user).toContain('Hint 1 from the fake tutor'); // earlier turns are remembered
});

test('the lesson page has a general tutor that explains from the lesson', async () => {
  await page.goto('/student');
  await page.getByRole('region', { name: 'Your learning path' }).getByRole('link', { name: LESSON_TITLE }).click();
  const tutor = page.getByRole('region', { name: 'Ask about this lesson' });
  await tutor.getByRole('button', { name: 'Need help? Ask Tuklas' }).click();
  await resetFake();
  await tutor.getByRole('form', { name: 'Ask a question' }).getByLabel('Your question').fill('What does subtracting a negative mean?');
  await tutor.getByRole('form', { name: 'Ask a question' }).getByRole('button', { name: 'Send' }).click();
  await expect(tutor.getByRole('log')).toContainText('Ask Tuklas (AI)');
  const calls = await fakeCalls();
  expect(calls[0].system).toContain(LESSON_TITLE);
  expect(calls[0].system).not.toContain('BEGIN QUESTION');
  await expectNoHorizontalScroll(page);
  await expectAccessible(page, 'lesson page with tutor');
});

test('the panel is honest when the AI is switched off', async () => {
  await page.route('**/api/ai/tutor?*', async (route) => {
    const response = await route.fetch();
    const payload = await response.json();
    payload.data.aiAvailable = false;
    await route.fulfill({ response, json: payload });
  });
  await startPractice(page);
  await panel(page).getByRole('button', { name: 'Need help? Ask Tuklas' }).click();
  await expect(panel(page).getByRole('status')).toContainText('AI tutor is not available right now');
  await expect(panel(page).getByRole('status')).toContainText('not AI');
});

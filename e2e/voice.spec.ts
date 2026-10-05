/**
 * Voice through a real browser. HONESTY: the speech engine here is a SCRIPTED STAND-IN injected into the page. These
 * tests prove the wiring (button, permission errors, text goes through the same tutor, replies are spoken, graceful
 * fallback). They do NOT prove that a real microphone, a real speech recogniser or real phone speakers work: that
 * needs a physical device and is NOT VERIFIED.
 */

import AxeBuilder from '@axe-core/playwright';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { expectNoHorizontalScroll, snap } from './helpers';

test.describe.configure({ mode: 'serial' });

const FAKE = 'http://localhost:3401';
type Call = { system: string; user: string; message: string };
const fakeCalls = async (): Promise<Call[]> => (await fetch(`${FAKE}/__calls`)).json();
const resetFake = () => fetch(`${FAKE}/__reset`, { method: 'POST' });
const LESSON_TITLE = 'Operations on Integers';

async function expectAccessible(page: Page, label: string) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  const serious = results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
  expect(serious.map((v) => `${v.id}: ${v.help} -> ${v.nodes.map((n) => n.html.slice(0, 100)).join(' | ')}`), label).toEqual([]);
}

const installFakeSpeech = () => {
  class FakeRecognition {
    lang = '';
    interimResults = false;
    continuous = false;
    maxAlternatives = 1;
    onresult: ((event: unknown) => void) | null = null;
    onerror: ((event: { error: string }) => void) | null = null;
    onend: (() => void) | null = null;
    start() {
      const w = window as unknown as Record<string, unknown>;
      w.__recognition = this;
      w.__started = ((w.__started as number) ?? 0) + 1;
    }
    stop() {
      this.onend?.();
    }
    abort() {}
  }
  const w = window as unknown as Record<string, unknown>;
  Object.defineProperty(window, 'SpeechRecognition', { value: FakeRecognition, configurable: true });
  w.__spoken = [] as Array<{ text: string; lang: string }>;
  Object.defineProperty(window, 'speechSynthesis', {
    configurable: true,
    value: { speak: (u: { text: string; lang: string }) => (w.__spoken as unknown[]).push({ text: u.text, lang: u.lang }), cancel: () => {} },
  });
  Object.defineProperty(window, 'SpeechSynthesisUtterance', {
    configurable: true,
    value: class {
      text: string;
      lang = '';
      constructor(text: string) {
        this.text = text;
      }
    },
  });
};

const removeSpeech = () => {
  for (const name of ['SpeechRecognition', 'webkitSpeechRecognition', 'speechSynthesis']) {
    Object.defineProperty(window, name, { value: undefined, configurable: true });
  }
};

let withVoice: BrowserContext;
let withoutVoice: BrowserContext;
let page: Page;
let bare: Page;

test.beforeAll(async ({ browser }, testInfo) => {
  const use = testInfo.project.use as never;
  withVoice = await browser.newContext(use);
  withoutVoice = await browser.newContext(use);
  page = await withVoice.newPage();
  bare = await withoutVoice.newPage();
  await page.addInitScript(installFakeSpeech);
  await bare.addInitScript(removeSpeech);
  for (const [p, tag] of [[page, 'a'], [bare, 'b']] as const) {
    const response = await p.request.post('/api/auth/register', {
      data: { email: `e2e-voice-${tag}-${testInfo.project.name}-${Date.now()}@example.test`, password: 'StudentPass12345!', displayName: `Voice ${tag}`, role: 'STUDENT' },
    });
    expect(response.status()).toBe(201);
  }
  await resetFake();
});

test.afterAll(async () => {
  await Promise.all([withVoice, withoutVoice].map((context) => context?.close()));
});

async function openLessonTutor(target: Page) {
  await target.goto('/student');
  await target.getByRole('region', { name: 'Your learning path' }).getByRole('link', { name: LESSON_TITLE }).click();
  const tutor = target.getByRole('region', { name: 'Ask about this lesson' });
  await tutor.getByRole('button', { name: 'Need help? Ask Tuklas' }).click();
  return tutor;
}

test('the site allows the microphone for itself only, and still blocks camera and location', async () => {
  const response = await page.request.get('/');
  const policy = response.headers()['permissions-policy'];
  expect(policy).toContain('microphone=(self)');
  expect(policy).toContain('camera=()');
  expect(policy).toContain('geolocation=()');
});

test('speaking fills the question box for the student to check; sending it goes through the SAME tutor as typing', async ({}, testInfo) => {
  const tutor = await openLessonTutor(page);
  await resetFake();
  const voice = tutor.getByRole('group', { name: 'Voice' });
  await expect(voice).toContainText('does not record or keep your voice');

  await voice.getByRole('button', { name: 'Speak your question' }).click();
  await expect(voice.getByRole('button', { name: 'Stop listening' })).toHaveAttribute('aria-pressed', 'true');
  await expect(voice).toContainText('Listening');
  await page.evaluate(() => {
    const recognition = (window as unknown as { __recognition: { onresult: (e: unknown) => void; onend: () => void; lang: string } }).__recognition;
    recognition.onresult({ results: [Object.assign([{ transcript: 'what does subtracting a negative mean' }], { isFinal: true })] });
    recognition.onend();
  });
  const box = tutor.getByLabel('Your question');
  await expect(box).toHaveValue('what does subtracting a negative mean'); // NOT auto-sent: the student checks it first
  await expect(voice).toContainText('Check what I heard, then press Send.');
  expect(await fakeCalls()).toHaveLength(0);
  expect(await page.evaluate(() => (window as unknown as { __recognition: { lang: string } }).__recognition.lang)).toBe('en-PH');

  await tutor.getByRole('form', { name: 'Ask a question' }).getByRole('button', { name: 'Send' }).click();
  await expect(tutor.getByRole('log')).toContainText('Ask Tuklas (AI)');
  const [call] = await fakeCalls();
  expect(call.message).toBe('what does subtracting a negative mean'); // exactly what was said, through the normal path
  expect(call.system).toContain(LESSON_TITLE); // with the same lesson context as typing
  await expectNoHorizontalScroll(page);
  await expectAccessible(page, 'tutor with voice controls');
  await snap(page, testInfo, 'voice-1-speak-question');
});

test('the language choice reaches the recogniser', async () => {
  const tutor = await openLessonTutor(page);
  await tutor.getByLabel('Language for listening and reading aloud').selectOption('fil-PH');
  await tutor.getByRole('button', { name: 'Speak your question' }).click();
  expect(await page.evaluate(() => (window as unknown as { __recognition: { lang: string } }).__recognition.lang)).toBe('fil-PH');
});

test('replies are read aloud only when the student switches it on, once per reply, in the chosen language', async () => {
  const tutor = await openLessonTutor(page);
  const replies = tutor.getByRole('log').locator('.tutor-message.assistant');
  const ask = async (message: string) => {
    // The conversation is restored from earlier tests, so wait for THIS question's reply by counting replies.
    const before = await replies.count();
    const form = tutor.getByRole('form', { name: 'Ask a question' });
    await form.getByLabel('Your question').fill(message);
    await form.getByRole('button', { name: 'Send' }).click();
    await expect(replies).toHaveCount(before + 1);
  };
  const spoken = () => page.evaluate(() => (window as unknown as { __spoken: Array<{ text: string; lang: string }> }).__spoken);

  await page.evaluate(() => ((window as unknown as { __spoken: unknown[] }).__spoken.length = 0));
  await ask('hint please'); // reading aloud is off: silence
  expect(await spoken()).toHaveLength(0);

  await tutor.getByRole('checkbox', { name: 'Read replies aloud' }).check();
  await tutor.getByLabel('Language for listening and reading aloud').selectOption('en-US');
  await ask('another example please');
  await expect.poll(async () => (await spoken()).length).toBe(1);
  const [said] = await spoken();
  expect(said.lang).toBe('en-US');
  expect(said.text.length).toBeGreaterThan(10);
  expect(said.text).not.toMatch(/[*_#`]/); // decoration removed
  await page.waitForTimeout(500);
  expect(await spoken()).toHaveLength(1); // a re-render does not repeat it
});

test('a refused microphone gives a kind message and typing still works', async () => {
  const tutor = await openLessonTutor(page);
  await tutor.getByRole('button', { name: 'Speak your question' }).click();
  await page.evaluate(() => {
    const recognition = (window as unknown as { __recognition: { onerror: (e: { error: string }) => void; onend: () => void } }).__recognition;
    recognition.onerror({ error: 'not-allowed' });
    recognition.onend();
  });
  await expect(tutor.getByRole('group', { name: 'Voice' })).toContainText('does not have permission to use the microphone');
  await expect(tutor.getByRole('button', { name: 'Speak your question' })).toBeVisible();
  const form = tutor.getByRole('form', { name: 'Ask a question' });
  await form.getByLabel('Your question').fill('typing still works');
  await expect(form.getByRole('button', { name: 'Send' })).toBeEnabled();
});

test('a browser with no speech support says so plainly, and the tutor still works by typing', async ({}, testInfo) => {
  const tutor = await openLessonTutor(bare);
  await expect(tutor.getByText('Voice is not available in this browser. You can type your question.')).toBeVisible();
  await expect(tutor.getByRole('button', { name: 'Speak your question' })).toHaveCount(0);
  await resetFake();
  const form = tutor.getByRole('form', { name: 'Ask a question' });
  await form.getByLabel('Your question').fill('hint please');
  await form.getByRole('button', { name: 'Send' }).click();
  await expect(tutor.getByRole('log')).toContainText('Ask Tuklas (AI)');
  await expectAccessible(bare, 'tutor without voice support');
  await snap(bare, testInfo, 'voice-2-unsupported');
});

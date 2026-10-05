import { expect, test } from '@playwright/test';

/** The cross-site write check runs in front of the real server (src/proxy.ts), so it is tested over real HTTP. */
const post = (request: import('@playwright/test').APIRequestContext, headers: Record<string, string>) =>
  request.post('/api/auth/login', { data: { email: 'nobody@example.test', password: 'whatever-123' }, headers });

test('a write that a browser marks as coming from another site is refused before any route runs', async ({ request, baseURL }) => {
  const forgedOrigin = await post(request, { origin: 'https://evil.example' });
  expect(forgedOrigin.status()).toBe(403);
  expect((await forgedOrigin.json()).error).toBe('Cross-site request refused.');

  expect((await post(request, { 'sec-fetch-site': 'cross-site' })).status()).toBe(403);
  expect((await post(request, { origin: 'null' })).status()).toBe(403);
  expect((await post(request, { origin: `${baseURL}.evil.example` })).status()).toBe(403);
});

test('the site’s own pages and plain API clients are not affected', async ({ request, baseURL }) => {
  // Not 403: the request reaches the login route, which answers 401 for an unknown account.
  expect((await post(request, { origin: baseURL!, 'sec-fetch-site': 'same-origin' })).status()).toBe(401);
  expect((await post(request, {})).status()).toBe(401);
  // Reads are never blocked, even with hostile headers.
  expect((await request.get('/api/health', { headers: { origin: 'https://evil.example', 'sec-fetch-site': 'cross-site' } })).status()).toBe(200);
});

test('the real sign-in form still works (same-origin browser requests carry a matching Origin)', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email Address').fill('student-juan@tuklas.local');
  await page.getByLabel('Password', { exact: true }).fill('DemoPassword123!');
  await page.getByRole('button', { name: 'Sign In' }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'));
});

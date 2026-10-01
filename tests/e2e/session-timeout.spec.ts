import { test, expect } from '@playwright/test';
import { deleteTestUser } from '@/tests/helpers/fixtures';
import { BASE_URL, createAuthenticatedUser } from './helpers';

// History: UX_AUDIT.md finding #1 - a hung /auth/me request left every authenticated page stuck
// forever on "Ładowanie sesji...". Fixed then with an axios timeout + a retry button.
//
// 2026-10-01 (performance phase 2): every authenticated section now checks the session on the
// server (AuthenticatedLayout) and hands the verified user to the client (ServerSessionBoundary),
// so no page depends on /auth/me to render at all anymore. These tests pin the stronger guarantee.

test('a logged-in page renders even when /auth/me never answers', async ({ page, context }) => {
  const user = await createAuthenticatedUser(context);
  await page.route('**/api/auth/me', async () => {
    // intentionally never resolves
  });

  try {
    await page.goto(`${BASE_URL}/growth`);
    await expect(page.getByRole('heading', { name: 'Rozwój konta' })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Ładowanie sesji...')).toHaveCount(0);
  } finally {
    await deleteTestUser(user.id);
  }
});

test('a logged-out visit to /dashboard is redirected to /login on the server, without waiting for /auth/me', async ({ page }) => {
  // Even with /auth/me hanging, the server-side redirect lands on /login right away.
  await page.route('**/api/auth/me', async () => {
    // never resolves
  });

  // A real HTTP redirect from the layout's session gate - not a 200 skeleton + client redirect.
  const redirectResponse = await page.request.get(`${BASE_URL}/dashboard`, { maxRedirects: 0 });
  expect(redirectResponse.status()).toBe(307);
  expect(redirectResponse.headers()['location']).toContain('/login');

  await page.goto(`${BASE_URL}/dashboard`);
  await page.waitForURL('**/login', { timeout: 10_000 });
  await expect(page.getByText('Ładowanie sesji...')).toHaveCount(0);
});

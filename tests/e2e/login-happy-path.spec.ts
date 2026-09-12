import { test, expect } from '@playwright/test';
import { BASE_URL } from './helpers';

// Full happy-path coverage for GO_LIVE_PLAN.md sekcja A: login previously had zero E2E
// coverage of the actual "fill form -> submit -> land on dashboard" wiring or its error
// path (password-flow-copy.spec.ts only checks static page copy/diacritics).
//
// Network calls mocked, same convention as register-status.spec.ts / register-happy-path.spec.ts
// — this exercises the page's reaction to the API, not the login business logic itself
// (already covered server-side and by Vitest).

test('successful login with valid credentials redirects to the dashboard', async ({ page }) => {
  // Landing on /dashboard mounts several components (ConnectedPlatforms, DashboardAIAdvisor,
  // OnboardingChecklist, RecentActivity, ...) that each fire their own real, unmocked
  // apiClient calls (/social-accounts, /videos, /jobs, /activity, /analytics, ...). Only
  // mocking /auth/login + /auth/me leaves those hitting the real backend with no real
  // session cookie behind this mocked login — a real 401 there trips the client's global
  // axios interceptor (lib/api-client.ts), which hard-redirects back to /login. This
  // catch-all (registered first, so more specific routes below take priority — Playwright
  // matches routes most-recently-registered-first) keeps every such background call inside
  // the 2xx path so the interceptor never fires, without having to enumerate every
  // dashboard child component's endpoint by hand.
  await page.route('**/api/**', (route) => route.fulfill({ status: 200, body: JSON.stringify([]) }));

  // /auth/me must be stateful: LoginPage redirects straight to /dashboard on mount if
  // AuthProvider's initial bootstrap already sees an authenticated session (login/page.tsx:
  // "if (isAuthenticated) router.replace('/dashboard')"). Mocking it as permanently
  // authenticated from the start — as this test originally did — raced that redirect
  // against Playwright's own .fill() calls: slow, uncompiled dev-mode responses happened to
  // let the fill()s win, but a fast production server (next build + next start, what CI and
  // the fix-verification below both use) wins the race instead, and the login form the test
  // is trying to fill in is never reached because the page already bounced away from it.
  let hasLoggedIn = false;

  await page.route('**/api/auth/login', (route) => {
    hasLoggedIn = true;
    return route.fulfill({
      status: 200,
      body: JSON.stringify({ user: { userId: 'test-user-id', email: 'user@postfly.app' } }),
    });
  });

  await page.route('**/api/auth/me', (route) => {
    if (!hasLoggedIn) {
      return route.fulfill({ status: 401, body: JSON.stringify({ message: 'Unauthorized' }) });
    }

    return route.fulfill({
      status: 200,
      body: JSON.stringify({ user: { userId: 'test-user-id', email: 'user@postfly.app' } }),
    });
  });

  await page.goto(`${BASE_URL}/login`);

  await page.getByPlaceholder('jan@postfly.app').fill('user@postfly.app');
  await page.getByPlaceholder('••••••••').fill('correct-password-123');
  await page.getByRole('button', { name: 'Zaloguj', exact: true }).click();

  await expect(page.getByText('Zalogowano pomyślnie.')).toBeVisible();
  await expect(page).toHaveURL(`${BASE_URL}/dashboard`);
});

test('invalid credentials show an error and keep the user on the login page', async ({ page }) => {
  await page.route('**/api/auth/login', (route) =>
    route.fulfill({ status: 401, body: JSON.stringify({ message: 'Invalid credentials' }) }),
  );

  await page.goto(`${BASE_URL}/login`);

  await page.getByPlaceholder('jan@postfly.app').fill('user@postfly.app');
  await page.getByPlaceholder('••••••••').fill('wrong-password');
  await page.getByRole('button', { name: 'Zaloguj', exact: true }).click();

  await expect(page.getByText('Logowanie nie powiodło się. Sprawdź e-mail i hasło.')).toBeVisible();
  await expect(page).toHaveURL(`${BASE_URL}/login`);
});

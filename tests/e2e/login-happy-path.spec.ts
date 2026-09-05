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
  await page.route('**/api/auth/login', (route) =>
    route.fulfill({
      status: 200,
      body: JSON.stringify({ user: { userId: 'test-user-id', email: 'user@postfly.app' } }),
    }),
  );

  await page.route('**/api/auth/me', (route) =>
    route.fulfill({
      status: 200,
      body: JSON.stringify({ user: { userId: 'test-user-id', email: 'user@postfly.app' } }),
    }),
  );

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

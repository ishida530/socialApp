import { test, expect } from '@playwright/test';
import { BASE_URL } from './helpers';

// Full happy-path coverage for GO_LIVE_PLAN.md sekcja A: previously only the "registration
// closed" reaction was covered (register-status.spec.ts) — the actual "fill form -> submit
// -> land on dashboard" wiring, and its error path, had no E2E coverage at all.
//
// Network calls are mocked (register-status, register, auth/me) rather than hitting a real
// DB, matching the existing convention in this suite (see register-status.spec.ts): this is
// about the page's reaction to the API, not the registration business logic itself, which
// Vitest already covers (tests/api/*).

test('successful registration with valid data redirects to the dashboard', async ({ page }) => {
  await page.route('**/api/auth/register-status', (route) =>
    route.fulfill({ status: 200, body: JSON.stringify({ open: true }) }),
  );

  await page.route('**/api/auth/register', (route) =>
    route.fulfill({
      status: 200,
      body: JSON.stringify({ user: { userId: 'test-user-id', email: 'nowy@postfly.app' } }),
    }),
  );

  await page.route('**/api/auth/me', (route) =>
    route.fulfill({
      status: 200,
      body: JSON.stringify({ user: { userId: 'test-user-id', email: 'nowy@postfly.app' } }),
    }),
  );

  await page.goto(`${BASE_URL}/register`);

  await page.getByPlaceholder('Jan Kowalski').fill('Nowy Użytkownik');
  await page.getByPlaceholder('jan@postfly.app').fill('nowy@postfly.app');
  await page.getByPlaceholder('Minimum 8 znaków').fill('bezpieczne-haslo-123');
  await page.getByRole('button', { name: 'Utwórz konto' }).click();

  await expect(page.getByText('Konto utworzone.')).toBeVisible();
  await expect(page).toHaveURL(`${BASE_URL}/dashboard`);
});

test('registration with an already-used email shows an error and stays on the page', async ({ page }) => {
  await page.route('**/api/auth/register-status', (route) =>
    route.fulfill({ status: 200, body: JSON.stringify({ open: true }) }),
  );

  await page.route('**/api/auth/register', (route) =>
    route.fulfill({
      status: 400,
      body: JSON.stringify({ message: 'User with this email already exists' }),
    }),
  );

  await page.goto(`${BASE_URL}/register`);

  await page.getByPlaceholder('Jan Kowalski').fill('Istniejący Użytkownik');
  await page.getByPlaceholder('jan@postfly.app').fill('istnieje@postfly.app');
  await page.getByPlaceholder('Minimum 8 znaków').fill('bezpieczne-haslo-123');
  await page.getByRole('button', { name: 'Utwórz konto' }).click();

  await expect(page.getByText('Rejestracja nie powiodła się.')).toBeVisible();
  await expect(page).toHaveURL(`${BASE_URL}/register`);
});

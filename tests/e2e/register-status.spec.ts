import { test, expect } from '@playwright/test';
import { BASE_URL } from './helpers';

// Regression test for UX_AUDIT.md finding #3 (sekcja 2): the register form let a user
// fill in name/email/password before ever finding out registration was closed
// (APP_MODE=personal, one account already exists) — only the final POST returned that.
// Fixed with GET /api/auth/register-status, checked on page load, that swaps the form
// for a blocking message up front.
//
// Mocks the status endpoint directly rather than depending on real DB user count (which
// the existing Vitest suite already covers) — this test is about the page's reaction to
// the status, not the counting logic itself.
test('register page shows a blocking message instead of the form when registration is closed', async ({ page }) => {
  await page.route('**/api/auth/register-status', (route) =>
    route.fulfill({ status: 200, body: JSON.stringify({ open: false }) }),
  );

  await page.goto(`${BASE_URL}/register`);

  await expect(page.getByText('Rejestracja jest obecnie zamknięta')).toBeVisible();
  await expect(page.locator('input[type="email"]')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Utwórz konto' })).toHaveCount(0);
});

test('register page shows the real form when registration is open', async ({ page }) => {
  await page.route('**/api/auth/register-status', (route) =>
    route.fulfill({ status: 200, body: JSON.stringify({ open: true }) }),
  );

  await page.goto(`${BASE_URL}/register`);

  await expect(page.getByRole('button', { name: 'Utwórz konto' })).toBeVisible();
  await expect(page.getByText('Rejestracja jest obecnie zamknięta')).not.toBeVisible();
});

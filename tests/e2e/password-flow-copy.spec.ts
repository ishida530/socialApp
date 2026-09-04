import { test, expect } from '@playwright/test';
import { BASE_URL } from './helpers';

// Regression test for UX_AUDIT.md finding #4 (sekcja 3): the entire forgot/reset
// password flow was missing Polish diacritics ("Zapomniales hasla?", "Wroc do
// logowania", ...) while the rest of the app didn't have this problem — jarring for a
// Polish-language product. Asserts the corrected copy, not just "some text exists", so
// a future regression back to the ASCII-only versions actually fails this test.
test('login page uses correct Polish diacritics in the forgot-password link', async ({ page }) => {
  await page.goto(`${BASE_URL}/login`);
  await expect(page.getByText('Zapomniałeś hasła?')).toBeVisible();
});

test('forgot-password page uses correct Polish diacritics throughout', async ({ page }) => {
  await page.goto(`${BASE_URL}/forgot-password`);
  await expect(page.getByRole('heading', { name: 'Zapomniałem hasła' })).toBeVisible();
  await expect(page.getByText('Podaj adres e-mail, a wyślemy Ci link do ustawienia nowego hasła.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Wyślij link resetu' })).toBeVisible();
  await expect(page.getByText('Pamiętasz hasło?')).toBeVisible();
  await expect(page.getByText('Wróć do logowania')).toBeVisible();
});

test('reset-password page uses correct Polish diacritics throughout', async ({ page }) => {
  await page.goto(`${BASE_URL}/reset-password?token=invalid-token-for-copy-check`);
  await expect(page.getByRole('heading', { name: 'Ustaw nowe hasło' })).toBeVisible();
  await expect(page.getByText('Nowe hasło', { exact: true })).toBeVisible();
  await expect(page.getByText('Powtórz hasło')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Zapisz nowe hasło' })).toBeVisible();
});

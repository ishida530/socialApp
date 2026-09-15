import { test, expect } from '@playwright/test';
import { prisma } from '@/lib/server/prisma';
import { createAuthenticatedUser, BASE_URL } from './helpers';

// EPIC 10 Faza 2 (2026-09-15) - /schedule had zero e2e coverage before this, despite being the
// most complex, most business-critical screen in the app. This is a real smoke test (not
// mocked), for the DEFAULT experience (feature flag off - the current production behavior),
// covering what the redesign PR touched: the page loads, the campaign-inbox tabs/filter/pager
// still render, and no client-side error is thrown.

test('schedule page loads for an authenticated user with no campaigns yet, default (non-redesigned) layout', async ({
  page,
  context,
}) => {
  const user = await createAuthenticatedUser(context);
  const consoleErrors: string[] = [];
  page.on('pageerror', (err) => consoleErrors.push(err.message));

  try {
    await page.goto(`${BASE_URL}/schedule`);

    await expect(page.getByRole('heading', { name: 'Harmonogram publikacji' })).toBeVisible();
    await expect(page.getByText('Planer kampanii AI')).toBeVisible();
    await expect(page.getByText('Optymalizacja zadań oczekujących')).toBeVisible();
    await expect(page.getByText(/Do akceptacji \(\d+\)/)).toBeVisible();
    await expect(page.getByText('Brak zadań publikacji.')).toBeVisible();

    expect(consoleErrors).toEqual([]);
  } finally {
    await prisma.user.delete({ where: { id: user.id } }).catch(() => {});
  }
});

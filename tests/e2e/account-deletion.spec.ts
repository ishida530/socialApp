import { test, expect, type BrowserContext } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { TOKEN_COOKIE_NAME, issueAccessToken } from '@/lib/server/auth';
import { hashPassword } from '@/lib/server/crypto';
import { prisma } from '@/lib/server/prisma';
import { BASE_URL } from './helpers';

// Real integration coverage (no mocks) for GO_LIVE_PLAN.md sekcja H: the self-service
// account deletion feature (app/account/page.tsx + DELETE /api/account) had zero test
// coverage of any kind before this — it's brand new, security-sensitive (irreversible,
// cascades across every user-owned table), and privacy-policy-facing.
const TEST_PASSWORD = 'correct-horse-battery-staple';

async function createPasswordUser(context: BrowserContext) {
  const email = `test+${randomUUID()}@example.com`;
  const user = await prisma.user.create({
    data: {
      email,
      name: 'Delete Me',
      passwordHash: hashPassword(TEST_PASSWORD),
    },
  });

  const token = issueAccessToken(user.id, user.email);
  await context.addCookies([
    { name: TOKEN_COOKIE_NAME, value: token, url: BASE_URL, httpOnly: true, sameSite: 'Lax' },
  ]);

  return user;
}

test('deleting an account with the correct password removes it and redirects to login', async ({ page, context }) => {
  const user = await createPasswordUser(context);

  await page.goto(`${BASE_URL}/account`);
  await page.getByRole('button', { name: 'Chcę usunąć konto' }).click();
  await page.getByPlaceholder('Podaj hasło, aby potwierdzić').fill(TEST_PASSWORD);
  await page.getByPlaceholder('usuń moje konto').fill('usuń moje konto');
  await page.getByRole('button', { name: 'Usuń konto trwale' }).click();

  await expect(page.getByText('Konto zostało usunięte.')).toBeVisible();
  await expect(page).toHaveURL(`${BASE_URL}/login`);

  const stillExists = await prisma.user.findUnique({ where: { id: user.id } });
  expect(stillExists).toBeNull();
});

test('deleting an account with the wrong password fails and keeps the account', async ({ page, context }) => {
  const user = await createPasswordUser(context);

  try {
    await page.goto(`${BASE_URL}/account`);
    await page.getByRole('button', { name: 'Chcę usunąć konto' }).click();
    await page.getByPlaceholder('Podaj hasło, aby potwierdzić').fill('definitely-the-wrong-password');
    await page.getByPlaceholder('usuń moje konto').fill('usuń moje konto');
    await page.getByRole('button', { name: 'Usuń konto trwale' }).click();

    await expect(page.getByText('Nieprawidłowe hasło.')).toBeVisible();
    await expect(page).toHaveURL(`${BASE_URL}/account`);

    const stillExists = await prisma.user.findUnique({ where: { id: user.id } });
    expect(stillExists).not.toBeNull();
  } finally {
    await prisma.user.delete({ where: { id: user.id } }).catch(() => {});
  }
});

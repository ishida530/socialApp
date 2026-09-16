import { test, expect } from '@playwright/test';
import { createHmac } from 'crypto';
import { prisma } from '@/lib/server/prisma';
import { hashPassword } from '@/lib/server/crypto';
import { enableTwoFactor, startTwoFactorSetup } from '@/lib/server/two-factor';
import { createTestUser, deleteTestUser } from '../helpers/fixtures';
import { BASE_URL } from './helpers';

// 2026-09-16 - the owner asked for exactly this: 2FA should not prompt on every single login.
// Real, unmocked coverage (no page.route stubs) of the full browser flow: log in with password,
// get the 2FA prompt, check "remember this device", submit - then simulate a later day by
// clearing just the session cookie (not the remember cookie) and logging in again. The second
// time should skip the 2FA prompt entirely.

const TEST_PASSWORD = 'correct-horse-battery-staple';

function computeCode(base32: string): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of base32.toUpperCase()) {
    const index = alphabet.indexOf(char);
    if (index === -1) continue;
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  const secret = Buffer.from(bytes);
  const counter = Math.floor(Date.now() / 1000 / 30);
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac('sha1', secret).update(counterBuffer).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const truncated =
    ((hmac[offset] & 0x7f) << 24) | ((hmac[offset + 1] & 0xff) << 16) | ((hmac[offset + 2] & 0xff) << 8) | (hmac[offset + 3] & 0xff);
  return String(truncated % 1_000_000).padStart(6, '0');
}

async function createUserWithTwoFactor() {
  const { user } = await createTestUser();
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: hashPassword(TEST_PASSWORD) } });
  const setup = await startTwoFactorSetup(user.id, user.email);
  await enableTwoFactor(user.id, computeCode(setup.secret));
  return { user, secret: setup.secret };
}

test('checking "remember this device" skips the 2FA prompt on the next login from the same browser', async ({ page }) => {
  const { user, secret } = await createUserWithTwoFactor();

  try {
    await page.goto(`${BASE_URL}/login`);
    await page.getByPlaceholder('jan@postfly.app').fill(user.email);
    await page.getByPlaceholder('••••••••').fill(TEST_PASSWORD);
    await page.getByRole('button', { name: 'Zaloguj', exact: true }).click();

    await expect(page.getByRole('heading', { name: 'Weryfikacja dwuetapowa' })).toBeVisible();
    const rememberCheckbox = page.getByRole('checkbox', { name: /Zapamiętaj to urządzenie/ });
    await expect(rememberCheckbox).toBeChecked();

    await page.getByPlaceholder('123456').fill(computeCode(secret));
    await page.getByRole('button', { name: 'Zweryfikuj' }).click();
    await expect(page).toHaveURL(`${BASE_URL}/dashboard`);

    // Simulate coming back later: the session expired/was cleared, but this is still the same
    // browser, so the trusted-device cookie is still there.
    const cookies = await page.context().cookies();
    expect(cookies.some((cookie) => cookie.name === 'postfly_2fa_remember')).toBe(true);
    // Clearing the session cookie out from under a live /dashboard can race the app's own axios
    // 401 interceptor (lib/api-client.ts), which redirects to /login itself the moment a
    // background call from a mounted dashboard component fails - occasionally aborting an
    // immediate explicit navigation with net::ERR_ABORTED. Not a bug in the remember-device logic
    // under test; navigate away from the live page first, then clear the cookie somewhere neutral.
    await page.goto('about:blank');
    await page.context().clearCookies({ name: 'postfly_token' });
    await page.goto(`${BASE_URL}/login`);
    await page.getByPlaceholder('jan@postfly.app').fill(user.email);
    await page.getByPlaceholder('••••••••').fill(TEST_PASSWORD);
    await page.getByRole('button', { name: 'Zaloguj', exact: true }).click();

    // No 2FA prompt this time - straight to the dashboard.
    await expect(page).toHaveURL(`${BASE_URL}/dashboard`);
    await expect(page.getByRole('heading', { name: 'Weryfikacja dwuetapowa' })).toHaveCount(0);
  } finally {
    await deleteTestUser(user.id);
  }
});

test('unchecking "remember this device" still prompts for 2FA on the next login', async ({ page }) => {
  const { user, secret } = await createUserWithTwoFactor();

  try {
    await page.goto(`${BASE_URL}/login`);
    await page.getByPlaceholder('jan@postfly.app').fill(user.email);
    await page.getByPlaceholder('••••••••').fill(TEST_PASSWORD);
    await page.getByRole('button', { name: 'Zaloguj', exact: true }).click();

    await expect(page.getByRole('heading', { name: 'Weryfikacja dwuetapowa' })).toBeVisible();
    await page.getByRole('checkbox', { name: /Zapamiętaj to urządzenie/ }).uncheck();
    await page.getByPlaceholder('123456').fill(computeCode(secret));
    await page.getByRole('button', { name: 'Zweryfikuj' }).click();
    await expect(page).toHaveURL(`${BASE_URL}/dashboard`);

    const cookies = await page.context().cookies();
    expect(cookies.some((cookie) => cookie.name === 'postfly_2fa_remember')).toBe(false);

    await page.context().clearCookies({ name: 'postfly_token' });
    await page.goto(`${BASE_URL}/login`);
    await page.getByPlaceholder('jan@postfly.app').fill(user.email);
    await page.getByPlaceholder('••••••••').fill(TEST_PASSWORD);
    await page.getByRole('button', { name: 'Zaloguj', exact: true }).click();

    await expect(page.getByRole('heading', { name: 'Weryfikacja dwuetapowa' })).toBeVisible();
  } finally {
    await deleteTestUser(user.id);
  }
});

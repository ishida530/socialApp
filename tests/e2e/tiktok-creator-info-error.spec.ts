import { randomUUID } from 'node:crypto';
import { test, expect } from '@playwright/test';
import { prisma } from '@/lib/server/prisma';
import { TOKEN_COOKIE_NAME } from '@/lib/server/auth';
import { createTestUser, createSocialAccount, createVideo, createDraftJob, deleteTestUser } from '@/tests/helpers/fixtures';
import { BASE_URL } from './helpers';

// Regression test for UX_AUDIT.md finding #5 (sekcja 7, mobile): a TikTok account with
// a token that fails to decrypt (found during the audit via a plaintext-mock token, but
// the same path triggers on any real corrupted/incompatible token) surfaced the raw
// internal error "Invalid encrypted payload format" straight into the composer UI.
// Fixed in app/api/social-accounts/tiktok/creator-info/route.ts: unexpected errors are
// now logged server-side and replaced with a friendly PL message before reaching the
// client.
test('a broken TikTok token shows a friendly error, not the raw crypto error', async ({ page, context }) => {
  const { user, token } = await createTestUser();
  // Not a valid `iv.tag.ciphertext` payload — decrypt() throws "Invalid encrypted
  // payload format" on exactly this shape, same as it did during the audit.
  const account = await createSocialAccount(user.id, 'TIKTOK', { accessToken: 'not-a-valid-encrypted-token' });
  const video = await createVideo(user.id);
  const postGroupId = randomUUID();
  await createDraftJob({ videoId: video.id, socialAccountId: account.id, postGroupId });

  await context.addCookies([
    { name: TOKEN_COOKIE_NAME, value: token, url: BASE_URL, httpOnly: true, sameSite: 'Lax' },
  ]);

  try {
    await page.goto(`${BASE_URL}/dashboard`);
    await page.getByRole('button', { name: 'Nowy post' }).click();
    await page.getByRole('button', { name: 'Wróć do posta' }).click();

    // The TikTok settings panel starts loading automatically (single connected platform).
    await expect(page.getByText('Nie udało się pobrać ustawień publikacji TikTok.')).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText('Invalid encrypted payload format')).toHaveCount(0);
  } finally {
    await prisma.publishJob.deleteMany({ where: { postGroupId } });
    await prisma.video.delete({ where: { id: video.id } }).catch(() => {});
    await deleteTestUser(user.id);
  }
});

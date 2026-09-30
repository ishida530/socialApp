import { randomUUID } from 'node:crypto';
import { test, expect } from '@playwright/test';
import { prisma } from '@/lib/server/prisma';
import { TOKEN_COOKIE_NAME } from '@/lib/server/auth';
import { createTestUser, createSocialAccount, createVideo, createDraftJob, deleteTestUser } from '@/tests/helpers/fixtures';
import { BASE_URL } from './helpers';

// TikTok Content Sharing Guidelines ("before the publish button there should be a declaration ...
// 'By posting, you agree to TikTok's Music Usage Confirmation'"). History: UX_AUDIT.md finding #2
// moved the consent checkbox out of the scrollable tab content into the review-step footer; the
// 2026-09-30 audit rework (rejection ref 20260913074631) moved it to where TikTok requires it -
// the final publish step, in the same block as, and directly above, the Publish button.
test('TikTok declaration sits directly above the publish button, and publishing needs it', async ({ page, context }) => {
  const { user, token } = await createTestUser();
  const account = await createSocialAccount(user.id, 'TIKTOK');
  const video = await createVideo(user.id);
  const postGroupId = randomUUID();
  await createDraftJob({ videoId: video.id, socialAccountId: account.id, postGroupId });

  await context.addCookies([
    { name: TOKEN_COOKIE_NAME, value: token, url: BASE_URL, httpOnly: true, sameSite: 'Lax' },
  ]);

  try {
    await page.goto(`${BASE_URL}/dashboard`);
    await page.getByRole('button', { name: 'Nowy post' }).click();

    // A DRAFT job already exists for this user, so the composer offers to resume it.
    await page.getByRole('button', { name: 'Wróć do posta' }).click();
    await page.getByRole('button', { name: 'Dalej' }).click();

    const declaration = page.getByText("By posting, you agree to TikTok's");
    await expect(declaration).toBeVisible();

    const publishButton = page.getByRole('button', { name: 'Opublikuj teraz' });
    await expect(publishButton).toBeVisible();
    // Nothing chosen/consented yet -> publishing is not possible.
    await expect(publishButton).toBeDisabled();

    // The declaration comes right before the button in the same publish block.
    const declarationBox = await declaration.boundingBox();
    const buttonBox = await publishButton.boundingBox();
    expect(declarationBox && buttonBox && declarationBox.y < buttonBox.y).toBe(true);
  } finally {
    await prisma.publishJob.deleteMany({ where: { postGroupId } });
    await prisma.video.delete({ where: { id: video.id } }).catch(() => {});
    await deleteTestUser(user.id);
  }
});

import { randomUUID } from 'node:crypto';
import { test, expect } from '@playwright/test';
import { prisma } from '@/lib/server/prisma';
import { TOKEN_COOKIE_NAME } from '@/lib/server/auth';
import { createTestUser, createSocialAccount, createVideo, createDraftJob, deleteTestUser } from '@/tests/helpers/fixtures';
import { BASE_URL } from './helpers';

// Regression test for UX_AUDIT.md finding #2 (sekcja 7, Krok 2): the required TikTok
// posting-consent checkbox lived inside TikTokSettingsPanel, which renders inside the
// composer's scrollable per-platform tab content — on a long form it could end up below
// the fold, right where the sticky Wstecz/Dalej footer starts. Fixed by moving the
// checkbox out of that scrollable area entirely, into the always-visible footer
// (components/PostComposer.tsx), rendered only when the TikTok tab is active.
test('TikTok consent checkbox is not inside the scrollable tab content', async ({ page, context }) => {
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

    const consentText = 'Potwierdzam, że publikacja na TikTok';
    await expect(page.getByText(consentText)).toBeVisible();

    // The regression itself: the consent checkbox must NOT be a descendant of the
    // scrollable per-platform content area.
    const scrollableArea = page.locator('.overflow-y-auto');
    await expect(scrollableArea.getByText(consentText)).toHaveCount(0);

    // And it must be visible without scrolling that area — a manual scrollIntoView
    // would defeat the point of the fix, so check its bounding box directly instead.
    const checkboxLabel = page.getByText(consentText).locator('..');
    await expect(checkboxLabel).toBeInViewport();
  } finally {
    await prisma.publishJob.deleteMany({ where: { postGroupId } });
    await prisma.video.delete({ where: { id: video.id } }).catch(() => {});
    await deleteTestUser(user.id);
  }
});

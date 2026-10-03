import { prisma } from './prisma';
import { revokeSocialAccountGrant } from './social-oauth';
import { deleteAllUserMediaFiles } from './media-lifecycle';
import { logError } from './observability';

const CLEANUP_TIMEOUT_MS = 8_000;

function withTimeout<T>(promise: Promise<T>, ms: number) {
  return Promise.race([promise, new Promise<void>((resolve) => setTimeout(resolve, ms))]);
}

// Everything outside our database that belongs to a user (2026-10-03, platform review): revoke
// platform grants (YouTube API policy, TikTok) and erase uploaded files. Best-effort and bounded in
// time - it never blocks the account deletion itself.
async function cleanUpExternalData(userId: string) {
  try {
    const socialAccounts = await prisma.socialAccount.findMany({
      where: { userId },
      select: { platform: true, accessToken: true, refreshToken: true },
    });
    await withTimeout(Promise.all(socialAccounts.map((account) => revokeSocialAccountGrant(account))), CLEANUP_TIMEOUT_MS);
    await withTimeout(deleteAllUserMediaFiles(userId), CLEANUP_TIMEOUT_MS);
  } catch (error) {
    logError('account-deletion', 'external-cleanup-failed', error, { userId });
  }
}

export async function deleteUserCompletely(userId: string) {
  await cleanUpExternalData(userId);
  await prisma.user.delete({ where: { id: userId } });
}

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserFromRequest } from '@/lib/server/auth';
import { prisma } from '@/lib/server/prisma';
import { badRequest, notFound, tooManyRequests, unauthorized } from '@/lib/server/http';
import { consumeRateLimit } from '@/lib/server/rate-limit';
import { fetchTikTokCreatorInfo } from '@/lib/server/tiktok-creator-info';
import { collectContentWarnings } from '@/lib/server/content-safety';

type PatchBody = {
  caption?: string;
  hashtags?: string[];
  title?: string | null;
  mentions?: string[];
  tiktokPrivacyLevel?: string;
  tiktokAllowComment?: boolean;
  tiktokAllowDuet?: boolean;
  tiktokAllowStitch?: boolean;
  tiktokConsent?: boolean;
  isExplicit?: boolean;
  metaPostFormat?: string;
};

const META_POST_FORMATS = ['REELS', 'FEED', 'BOTH'];

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = getAuthUserFromRequest(request);

    const rateLimit = await consumeRateLimit({
      key: `publish-jobs:drafts-patch:${user.userId}`,
      limit: 30,
      windowMs: 15 * 60 * 1000,
    });
    if (!rateLimit.allowed) {
      return tooManyRequests('Too many requests. Try again later.', rateLimit.retryAfterSec);
    }

    const params = await context.params;
    const body = (await request.json()) as PatchBody;

    const job = await prisma.publishJob.findFirst({
      where: {
        id: params.id,
        status: 'DRAFT',
        video: { userId: user.userId },
      },
      include: { video: true, socialAccount: true },
    });

    if (!job) {
      return notFound('Nie znaleziono niedokończonego posta dla tej platformy.');
    }

    const data: Record<string, unknown> = {};

    if (typeof body.caption === 'string') {
      data.caption = body.caption;
    }

    if (Array.isArray(body.hashtags)) {
      data.hashtags = body.hashtags.filter((tag) => typeof tag === 'string');
    }

    if (body.title !== undefined) {
      data.title = body.title === null ? null : String(body.title);
    }

    if (Array.isArray(body.mentions)) {
      data.mentions = body.mentions.filter((mention) => typeof mention === 'string');
    }

    if (typeof body.isExplicit === 'boolean') {
      data.isExplicit = body.isExplicit;
    }

    const touchesTikTokSettings =
      body.tiktokPrivacyLevel !== undefined ||
      body.tiktokAllowComment !== undefined ||
      body.tiktokAllowDuet !== undefined ||
      body.tiktokAllowStitch !== undefined;

    if (touchesTikTokSettings) {
      if (job.socialAccount.platform !== 'TIKTOK') {
        return badRequest('Ustawienia TikToka dotyczą tylko zadania dla platformy TikTok.');
      }

      if (!body.tiktokPrivacyLevel) {
        return badRequest('Dla TikTok wybierz poziom prywatności publikacji.');
      }

      const creatorInfo = await fetchTikTokCreatorInfo(job.socialAccountId);
      const privacyOptions = Array.isArray(creatorInfo?.privacy_level_options)
        ? creatorInfo.privacy_level_options
        : [];

      if (!privacyOptions.includes(body.tiktokPrivacyLevel)) {
        return badRequest(`Niepoprawna prywatność TikTok. Dozwolone: ${privacyOptions.join(', ')}`);
      }

      const allowComment =
        body.tiktokAllowComment !== undefined ? body.tiktokAllowComment !== false : job.tiktokAllowComment !== false;
      const allowDuet =
        body.tiktokAllowDuet !== undefined ? body.tiktokAllowDuet !== false : job.tiktokAllowDuet !== false;
      const allowStitch =
        body.tiktokAllowStitch !== undefined ? body.tiktokAllowStitch !== false : job.tiktokAllowStitch !== false;

      if (creatorInfo?.comment_disabled && allowComment) {
        return badRequest('Na tym koncie TikTok komentarze są wyłączone. Odznacz komentarze.');
      }

      if (job.video.mediaType === 'VIDEO' && creatorInfo?.duet_disabled && allowDuet) {
        return badRequest('Na tym koncie TikTok duet jest wyłączony. Odznacz duet.');
      }

      if (job.video.mediaType === 'VIDEO' && creatorInfo?.stitch_disabled && allowStitch) {
        return badRequest('Na tym koncie TikTok stitch jest wyłączony. Odznacz stitch.');
      }

      if (
        job.video.mediaType === 'VIDEO' &&
        typeof creatorInfo?.max_video_post_duration_sec === 'number' &&
        job.video.durationSec &&
        job.video.durationSec > creatorInfo.max_video_post_duration_sec
      ) {
        return badRequest(
          `Film przekracza maksymalny limit TikTok (${creatorInfo.max_video_post_duration_sec}s) dla tego konta.`,
        );
      }

      data.tiktokPrivacyLevel = body.tiktokPrivacyLevel;
      data.tiktokAllowComment = allowComment;
      data.tiktokAllowDuet = allowDuet;
      data.tiktokAllowStitch = allowStitch;
    }

    if (body.metaPostFormat !== undefined) {
      if (job.socialAccount.platform !== 'FACEBOOK' && job.socialAccount.platform !== 'INSTAGRAM') {
        return badRequest('Format publikacji (Reels/zwykły post) dotyczy tylko Facebooka i Instagrama.');
      }

      if (job.video.mediaType !== 'VIDEO') {
        return badRequest('Format publikacji (Reels/zwykły post) dotyczy tylko materiałów wideo.');
      }

      if (!META_POST_FORMATS.includes(body.metaPostFormat)) {
        return badRequest(`Niepoprawny format publikacji. Dozwolone: ${META_POST_FORMATS.join(', ')}`);
      }

      // "Oba" only makes sense on Facebook - Instagram's Reels already appears in the feed too
      // (share_to_feed), so there's no separate "plain post" surface to also publish to there.
      if (body.metaPostFormat === 'BOTH' && job.socialAccount.platform !== 'FACEBOOK') {
        return badRequest('Format "Oba" (Reels + zwykły post) dotyczy tylko Facebooka.');
      }

      data.metaPostFormat = body.metaPostFormat;
    }

    if (body.tiktokConsent !== undefined) {
      if (job.socialAccount.platform !== 'TIKTOK') {
        return badRequest('Zgoda TikTok dotyczy tylko zadania dla platformy TikTok.');
      }

      data.tiktokConsentAt = body.tiktokConsent ? new Date() : null;
    }

    if (typeof data.caption === 'string') {
      data.contentWarnings = collectContentWarnings(data.caption, job.socialAccount.platform);
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json(job);
    }

    const updated = await prisma.publishJob.update({
      where: { id: job.id },
      data,
      include: { video: true, socialAccount: true },
    });

    // Remember this as the account's new "sticky" default - read back by createDraftGroupForVideo
    // for the NEXT draft on this account, on either channel (web or Telegram). Best-effort: a
    // failure here must not fail the save the user is actually waiting on.
    if (touchesTikTokSettings || body.metaPostFormat !== undefined) {
      await prisma.socialAccount
        .update({
          where: { id: job.socialAccountId },
          data: {
            ...(touchesTikTokSettings
              ? {
                  lastTiktokPrivacyLevel: data.tiktokPrivacyLevel as string,
                  lastTiktokAllowComment: data.tiktokAllowComment as boolean,
                  lastTiktokAllowDuet: data.tiktokAllowDuet as boolean,
                  lastTiktokAllowStitch: data.tiktokAllowStitch as boolean,
                }
              : {}),
            ...(body.metaPostFormat !== undefined ? { lastMetaPostFormat: data.metaPostFormat as string } : {}),
          },
        })
        .catch((error) => console.error('[publish-jobs/drafts/:id] failed to persist sticky account defaults', error));
    }

    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return unauthorized();
    }

    // Same failure mode as social-accounts/tiktok/creator-info: fetchTikTokCreatorInfo can
    // throw internal details (token decryption, TikTok API errors) that must not reach the
    // client verbatim. Log server-side, return a message the user can act on.
    console.error('[publish-jobs/drafts/:id] PATCH failed', error);
    return badRequest('Nie udało się zaktualizować posta. Spróbuj ponownie później.');
  }
}

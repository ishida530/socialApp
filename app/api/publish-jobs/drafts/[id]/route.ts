import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserFromRequest } from '@/lib/server/auth';
import { prisma } from '@/lib/server/prisma';
import { badRequest, notFound, serverError, unauthorized } from '@/lib/server/http';
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
};

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = getAuthUserFromRequest(request);
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

      const allowComment = body.tiktokAllowComment !== false;
      const allowDuet = body.tiktokAllowDuet !== false;
      const allowStitch = body.tiktokAllowStitch !== false;

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

    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return unauthorized();
    }

    if (error instanceof Error) {
      return badRequest(error.message);
    }

    return serverError(error);
  }
}

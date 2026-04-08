import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserFromRequest } from '@/lib/server/auth';
import { prisma } from '@/lib/server/prisma';
import { badRequest, serverError, unauthorized } from '@/lib/server/http';
import {
  assertScheduleWindowAllowed,
  assertUsageAllowed,
  getSubscriptionSnapshot,
  incrementUsage,
} from '@/lib/server/subscription';
import { processPublishJobImmediately } from '@/lib/server/publish-processor';
import { decryptToken, refreshSocialAccessToken } from '@/lib/server/social-oauth';

type SocialPlatform = 'YOUTUBE' | 'TIKTOK' | 'INSTAGRAM' | 'FACEBOOK';

function normalizePlatform(value: string): SocialPlatform {
  const normalized = value.trim().toUpperCase();

  if (normalized === 'YOUTUBE') {
    return 'YOUTUBE';
  }

  if (normalized === 'TIKTOK') {
    return 'TIKTOK';
  }

  if (normalized === 'INSTAGRAM') {
    return 'INSTAGRAM';
  }

  if (normalized === 'FACEBOOK') {
    return 'FACEBOOK';
  }

  throw new Error('Nieobsługiwana platforma');
}

type TikTokCreatorInfoResponse = {
  data?: {
    creator_nickname?: string;
    privacy_level_options?: string[];
    comment_disabled?: boolean;
    duet_disabled?: boolean;
    stitch_disabled?: boolean;
    max_video_post_duration_sec?: number;
  };
  error?: {
    code?: string | number;
    message?: string;
  };
};

type TikTokPublishSettings = {
  privacyLevel: string;
  allowComment: boolean;
  allowDuet: boolean;
  allowStitch: boolean;
};

async function fetchTikTokCreatorInfo(accountId: string) {
  const account = await prisma.socialAccount.findUnique({
    where: { id: accountId },
    select: {
      id: true,
      platform: true,
      accessToken: true,
      expiresAt: true,
    },
  });

  if (!account || account.platform !== 'TIKTOK') {
    throw new Error('Brak poprawnego konta TikTok do walidacji publikacji');
  }

  let accessToken = decryptToken(account.accessToken);
  if (!accessToken || (account.expiresAt && account.expiresAt.getTime() <= Date.now() + 30_000)) {
    const refreshed = await refreshSocialAccessToken(account.id);
    accessToken = refreshed.accessToken;
  }

  if (!accessToken) {
    throw new Error('Brak tokenu TikTok do pobrania creator info');
  }

  const response = await fetch('https://open.tiktokapis.com/v2/post/publish/creator_info/query/', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`TikTok creator info query failed: ${errorBody || response.statusText}`);
  }

  const payload = (await response.json()) as TikTokCreatorInfoResponse;
  return payload.data;
}

function buildTikTokSettingsMarker(settings: TikTokPublishSettings) {
  const payload = Buffer.from(JSON.stringify(settings), 'utf8').toString('base64url');
  return `[tiktok-settings:${payload}]`;
}

export async function POST(request: NextRequest) {
  try {
    const user = getAuthUserFromRequest(request);
    const body = (await request.json()) as {
      videoId?: string;
      scheduledDate?: string;
      publishNow?: boolean;
      tiktokPostingConsent?: boolean;
      targetPlatforms?: string[];
      socialAccountIdByPlatform?: Partial<Record<SocialPlatform, string>>;
      platformSettings?: {
        platform?: string;
        title?: string;
        description?: string;
        tags?: string[];
        privacyStatus?: string;
        allowComment?: boolean;
        allowDuet?: boolean;
        allowStitch?: boolean;
      };
    };

    if (!body.videoId) {
      return badRequest('Validation failed', [
        'videoId: videoId jest wymagany',
      ]);
    }

    const publishNow = body.publishNow === true;

    let scheduledDate = new Date();
    if (!publishNow) {
      if (!body.scheduledDate) {
        return badRequest('Validation failed', ['scheduledDate: scheduledDate jest wymagany']);
      }

      scheduledDate = new Date(body.scheduledDate);
      if (Number.isNaN(scheduledDate.getTime())) {
        return badRequest('scheduledDate is invalid');
      }

      await assertScheduleWindowAllowed(user.userId, scheduledDate);
    }

    const requestedPlatforms = Array.isArray(body.targetPlatforms)
      ? body.targetPlatforms
      : body.platformSettings?.platform
        ? [body.platformSettings.platform]
        : [];

    if (requestedPlatforms.length === 0) {
      return badRequest('Validation failed', [
        'targetPlatforms: wymagane co najmniej 1 platforma (lub platformSettings.platform)',
      ]);
    }

    const targetPlatforms = Array.from(
      new Set(requestedPlatforms.map((platform) => normalizePlatform(platform))),
    );

    if (targetPlatforms.includes('TIKTOK') && body.tiktokPostingConsent !== true) {
      return badRequest('Dla publikacji TikTok wymagana jest akceptacja warunków publikacji.');
    }

    const snapshot = await getSubscriptionSnapshot(user.userId);
    const userPlan = snapshot.subscription.plan;

    if (userPlan === 'FREE' && targetPlatforms.length > 1) {
      return badRequest('Plan Free pozwala publikować jednocześnie maksymalnie na 1 kanale social.');
    }

    const [video, socialAccounts] = await Promise.all([
      prisma.video.findFirst({ where: { id: body.videoId, userId: user.userId } }),
      prisma.socialAccount.findMany({
        where: {
          userId: user.userId,
          platform: {
            in: targetPlatforms,
          },
        },
        orderBy: [
          { updatedAt: 'desc' },
          { createdAt: 'desc' },
        ],
      }),
    ]);

    if (!video) {
      return badRequest('videoId nie należy do zalogowanego użytkownika');
    }

    const requestedSocialAccountIdByPlatform = body.socialAccountIdByPlatform ?? {};

    const selectedAccountIdByPlatform = new Map<SocialPlatform, string>();
    targetPlatforms.forEach((platform) => {
      const requestedId = requestedSocialAccountIdByPlatform[platform];
      if (typeof requestedId === 'string' && requestedId.trim().length > 0) {
        selectedAccountIdByPlatform.set(platform, requestedId.trim());
      }
    });

    const socialAccountById = new Map(socialAccounts.map((account) => [account.id, account]));

    const socialAccountByPlatform = new Map<typeof socialAccounts[number]['platform'], typeof socialAccounts[number]>();
    socialAccounts.forEach((socialAccount) => {
      const selectedAccountId = selectedAccountIdByPlatform.get(socialAccount.platform);
      if (selectedAccountId) {
        if (socialAccount.id === selectedAccountId) {
          socialAccountByPlatform.set(socialAccount.platform, socialAccount);
        }
        return;
      }

      if (!socialAccountByPlatform.has(socialAccount.platform)) {
        socialAccountByPlatform.set(socialAccount.platform, socialAccount);
      }
    });

    const invalidSelectedPlatforms = targetPlatforms.filter((platform) => {
      const selectedAccountId = selectedAccountIdByPlatform.get(platform);
      if (!selectedAccountId) {
        return false;
      }

      const account = socialAccountById.get(selectedAccountId);
      return !account || account.platform !== platform;
    });

    if (invalidSelectedPlatforms.length > 0) {
      return badRequest(
        `Niepoprawny wybór konta social dla platform: ${invalidSelectedPlatforms.join(', ')}`,
      );
    }

    const missingPlatforms = targetPlatforms.filter(
      (platform) => !socialAccountByPlatform.has(platform),
    );

    if (missingPlatforms.length > 0) {
      return badRequest(
        `Brak podłączonych kont dla platform: ${missingPlatforms.join(', ')}`,
      );
    }

    let tiktokSettingsMarker: string | null = null;
    if (targetPlatforms.includes('TIKTOK')) {
      const tiktokAccount = socialAccountByPlatform.get('TIKTOK');
      if (!tiktokAccount) {
        return badRequest('Brak podłączonego konta TikTok');
      }

      const creatorInfo = await fetchTikTokCreatorInfo(tiktokAccount.id);
      const privacyOptions = Array.isArray(creatorInfo?.privacy_level_options)
        ? creatorInfo?.privacy_level_options
        : [];

      const privacyLevel = body.platformSettings?.privacyStatus?.trim();
      if (!privacyLevel) {
        return badRequest('Dla TikTok wybierz poziom prywatności publikacji.');
      }

      if (!privacyOptions.includes(privacyLevel)) {
        return badRequest(`Niepoprawna prywatność TikTok. Dozwolone: ${privacyOptions.join(', ')}`);
      }

      const allowComment = body.platformSettings?.allowComment !== false;
      const allowDuet = body.platformSettings?.allowDuet !== false;
      const allowStitch = body.platformSettings?.allowStitch !== false;

      if (creatorInfo?.comment_disabled && allowComment) {
        return badRequest('Na tym koncie TikTok komentarze są wyłączone. Odznacz komentarze.');
      }

      if (creatorInfo?.duet_disabled && allowDuet) {
        return badRequest('Na tym koncie TikTok duet jest wyłączony. Odznacz duet.');
      }

      if (creatorInfo?.stitch_disabled && allowStitch) {
        return badRequest('Na tym koncie TikTok stitch jest wyłączony. Odznacz stitch.');
      }

      if (
        typeof creatorInfo?.max_video_post_duration_sec === 'number' &&
        video.durationSec &&
        video.durationSec > creatorInfo.max_video_post_duration_sec
      ) {
        return badRequest(
          `Film przekracza maksymalny limit TikTok (${creatorInfo.max_video_post_duration_sec}s) dla tego konta.`,
        );
      }

      tiktokSettingsMarker = buildTikTokSettingsMarker({
        privacyLevel,
        allowComment,
        allowDuet,
        allowStitch,
      });
    }

    for (let index = 0; index < targetPlatforms.length; index += 1) {
      await assertUsageAllowed(user.userId, 'publish_jobs');
    }

    const createdJobs = await prisma.$transaction(
      targetPlatforms.map((platform) =>
        prisma.publishJob.create({
          data: {
            status: 'PENDING',
            scheduledFor: scheduledDate,
            errorMessage: platform === 'TIKTOK' ? tiktokSettingsMarker : null,
            video: { connect: { id: video.id } },
            socialAccount: { connect: { id: socialAccountByPlatform.get(platform)!.id } },
          },
          include: {
            video: true,
            socialAccount: true,
          },
        }),
      ),
    );

    const delay = Math.max(0, scheduledDate.getTime() - Date.now());

    await incrementUsage(user.userId, 'publish_jobs', createdJobs.length);

    const immediateOutcomes = publishNow
      ? await Promise.all(
          createdJobs.map(async (publishJob) => ({
            jobId: publishJob.id,
            platform: publishJob.socialAccount.platform,
            outcome: await processPublishJobImmediately(publishJob.id),
          })),
        )
      : [];

    const responseJobs = publishNow
      ? await prisma.publishJob.findMany({
          where: { id: { in: createdJobs.map((job) => job.id) } },
          include: {
            video: true,
            socialAccount: true,
          },
          orderBy: {
            createdAt: 'desc',
          },
        })
      : createdJobs;

    const immediateOutcome =
      immediateOutcomes.length === 0
        ? null
        : immediateOutcomes.some((item) => item.outcome === 'failed')
          ? 'failed'
          : immediateOutcomes.some((item) => item.outcome === 'retryScheduled')
            ? 'retryScheduled'
            : immediateOutcomes.some((item) => item.outcome === 'skipped')
              ? 'skipped'
              : 'succeeded';

    return NextResponse.json({
      success: true,
      publishJob: responseJobs[0] ?? null,
      publishJobs: responseJobs,
      targetsCount: targetPlatforms.length,
      immediateOutcome,
      immediateOutcomes,
      queue: {
        name: 'next-inline-queue',
        delay,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return unauthorized();
    }

    if (error instanceof Error && error.message === 'Nieobsługiwana platforma') {
      return badRequest(error.message);
    }

    if (
      error instanceof Error &&
      (error.message.startsWith('Przekroczono limit planu') ||
        error.message.startsWith('Plan FREE pozwala planować publikacje'))
    ) {
      return badRequest(error.message);
    }

    return serverError(error);
  }
}

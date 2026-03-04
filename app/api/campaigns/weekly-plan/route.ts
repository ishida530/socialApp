import { NextRequest, NextResponse } from 'next/server';
import { Platform } from '@prisma/client';
import { getAuthUserFromRequest } from '@/lib/server/auth';
import { prisma } from '@/lib/server/prisma';
import { badRequest, serverError, unauthorized } from '@/lib/server/http';
import {
  assertScheduleWindowAllowed,
  assertUsageAllowed,
  getSubscriptionSnapshot,
  incrementUsage,
} from '@/lib/server/subscription';
import { findBestSlot } from '@/lib/smart-schedule/smart-slots';

type RequestBody = {
  videoIds?: string[];
  goal?: string;
  timezone?: string;
  apply?: boolean;
};

type PlatformLower = 'youtube' | 'tiktok' | 'instagram' | 'facebook';

const PLATFORM_TO_LOWER: Record<Platform, PlatformLower> = {
  YOUTUBE: 'youtube',
  TIKTOK: 'tiktok',
  INSTAGRAM: 'instagram',
  FACEBOOK: 'facebook',
};

function resolveRecommendedPostsPerWeek(videoCount: number, plan: 'FREE' | 'STARTER' | 'PRO' | 'BUSINESS') {
  const baseline = Math.max(3, Math.min(14, videoCount * 2));

  if (plan === 'FREE') {
    return Math.min(3, baseline);
  }

  if (plan === 'STARTER') {
    return Math.min(5, baseline);
  }

  if (plan === 'PRO') {
    return Math.min(7, baseline);
  }

  return baseline;
}

function pickDayOffset(index: number, total: number) {
  return Math.floor((index * 7) / Math.max(1, total));
}

export async function POST(request: NextRequest) {
  try {
    const user = getAuthUserFromRequest(request);
    const body = (await request.json()) as RequestBody;

    const timezone = body.timezone?.trim() || 'Europe/Warsaw';
    const apply = body.apply === true;

    const requestedIds = Array.isArray(body.videoIds)
      ? Array.from(new Set(body.videoIds.filter((id) => typeof id === 'string' && id.length > 0)))
      : [];

    const [subscriptionSnapshot, connectedAccounts, candidateVideos] = await Promise.all([
      getSubscriptionSnapshot(user.userId),
      prisma.socialAccount.findMany({
        where: { userId: user.userId },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.video.findMany({
        where: {
          userId: user.userId,
          ...(requestedIds.length > 0 ? { id: { in: requestedIds } } : {}),
        },
        select: {
          id: true,
          title: true,
          status: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: requestedIds.length > 0 ? requestedIds.length : 12,
      }),
    ]);

    if (connectedAccounts.length === 0) {
      return badRequest('Brak podłączonych kont social. Najpierw połącz co najmniej jedną platformę.');
    }

    if (candidateVideos.length === 0) {
      return badRequest('Brak materiałów do zaplanowania kampanii. Dodaj co najmniej 1 materiał.');
    }

    const selectedVideos = candidateVideos;

    const effectivePlan = subscriptionSnapshot.subscription.effectivePlan || subscriptionSnapshot.subscription.plan;
    const recommendedPostsPerWeek = resolveRecommendedPostsPerWeek(selectedVideos.length, effectivePlan);

    const accountByPlatform = new Map<Platform, string[]>();
    connectedAccounts.forEach((account) => {
      const current = accountByPlatform.get(account.platform) || [];
      current.push(account.id);
      accountByPlatform.set(account.platform, current);
    });

    const availablePlatforms = Array.from(accountByPlatform.keys());

    const suggestions = Array.from({ length: recommendedPostsPerWeek }).map((_, index) => {
      const video = selectedVideos[index % selectedVideos.length];
      const platform = availablePlatforms[index % availablePlatforms.length];
      const socialAccountIds = accountByPlatform.get(platform) || [];
      const socialAccountId = socialAccountIds[index % Math.max(1, socialAccountIds.length)] || socialAccountIds[0];

      const baseDate = new Date();
      baseDate.setDate(baseDate.getDate() + pickDayOffset(index, recommendedPostsPerWeek) + 1);
      baseDate.setMinutes(0, 0, 0);

      const slot = findBestSlot(baseDate, PLATFORM_TO_LOWER[platform]);

      return {
        videoId: video.id,
        videoTitle: video.title,
        platform,
        socialAccountId,
        suggestedScheduledFor: slot.toISOString(),
        reason:
          body.goal?.trim()
            ? `Dopasowano do celu kampanii: ${body.goal.trim().slice(0, 120)}`
            : 'Dopasowano do liczby materiałów i aktywnych platform.',
      };
    });

    let createdJobsCount = 0;

    if (apply) {
      if (effectivePlan === 'FREE' && availablePlatforms.length > 1) {
        return badRequest('Plan Free pozwala planować kampanię jednocześnie maksymalnie na 1 kanale social.');
      }

      for (let index = 0; index < suggestions.length; index += 1) {
        await assertUsageAllowed(user.userId, 'publish_jobs');
        await assertScheduleWindowAllowed(user.userId, new Date(suggestions[index].suggestedScheduledFor));
      }

      await prisma.$transaction(
        suggestions.map((item) =>
          prisma.publishJob.create({
            data: {
              status: 'PENDING',
              scheduledFor: new Date(item.suggestedScheduledFor),
              video: { connect: { id: item.videoId } },
              socialAccount: { connect: { id: item.socialAccountId } },
            },
          }),
        ),
      );

      createdJobsCount = suggestions.length;
      await incrementUsage(user.userId, 'publish_jobs', createdJobsCount);
    }

    return NextResponse.json({
      success: true,
      timezone,
      applied: apply,
      plan: {
        recommendedPostsPerWeek,
        selectedMaterials: selectedVideos.length,
        connectedPlatforms: availablePlatforms,
        goal: body.goal?.trim() || null,
      },
      suggestions,
      createdJobsCount,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return unauthorized();
    }

    if (error instanceof Error && error.message.startsWith('Przekroczono limit planu')) {
      return badRequest(error.message);
    }

    if (error instanceof Error && error.message.startsWith('Plan FREE pozwala planować publikacje')) {
      return badRequest(error.message);
    }

    return serverError(error);
  }
}

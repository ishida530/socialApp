import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserFromRequest } from '@/lib/server/auth';
import { badRequest, serverError, unauthorized } from '@/lib/server/http';
import { prisma } from '@/lib/server/prisma';
import { assertUsageAllowed, incrementUsage } from '@/lib/server/subscription';
import { optimizeSchedule } from '@/lib/server/smart-autopilot/schedule';
import type { AnalysisOutput, OrchestrateContentInput, PlatformBundle } from '@/lib/server/smart-autopilot/types';

type RequestBody = {
  timezone?: string;
  apply?: boolean;
};

type PublishStatusBreakdown = {
  pending: number;
  running: number;
  success: number;
  failed: number;
  canceled: number;
};

const SUPPORTED_PLATFORMS = new Set(['YOUTUBE', 'TIKTOK', 'INSTAGRAM', 'FACEBOOK']);

export async function POST(request: NextRequest) {
  try {
    const user = getAuthUserFromRequest(request);
    const body = (await request.json()) as RequestBody;

    const timezone = body.timezone?.trim() || 'Europe/Warsaw';
    const apply = body.apply === true;

    await assertUsageAllowed(user.userId, 'ai_autopilot_runs');

    const [pendingJobs, pendingCount, runningCount, successCount, failedCount, canceledCount] = await Promise.all([
      prisma.publishJob.findMany({
        where: {
          status: 'PENDING',
          video: {
            userId: user.userId,
          },
        },
        include: {
          socialAccount: {
            select: {
              platform: true,
            },
          },
        },
        orderBy: [
          { scheduledFor: 'asc' },
          { createdAt: 'asc' },
        ],
        take: 100,
      }),
      prisma.publishJob.count({
        where: {
          status: 'PENDING',
          video: {
            userId: user.userId,
          },
        },
      }),
      prisma.publishJob.count({
        where: {
          status: 'RUNNING',
          video: {
            userId: user.userId,
          },
        },
      }),
      prisma.publishJob.count({
        where: {
          status: 'SUCCESS',
          video: {
            userId: user.userId,
          },
        },
      }),
      prisma.publishJob.count({
        where: {
          status: 'FAILED',
          video: {
            userId: user.userId,
          },
        },
      }),
      prisma.publishJob.count({
        where: {
          status: 'CANCELED',
          video: {
            userId: user.userId,
          },
        },
      }),
    ]);

    const publishStatusBreakdown: PublishStatusBreakdown = {
      pending: pendingCount,
      running: runningCount,
      success: successCount,
      failed: failedCount,
      canceled: canceledCount,
    };

    const jobsForSuggestion = pendingJobs.filter((job) => SUPPORTED_PLATFORMS.has(job.socialAccount.platform));

    if (jobsForSuggestion.length === 0) {
      return NextResponse.json({
        success: true,
        timezone,
        applied: false,
        scannedCount: 0,
        updatedCount: 0,
        suggestions: [],
        noPendingJobs: true,
        publishStatusBreakdown,
        message:
          'Brak zadań publikacji ze statusem PENDING. AI harmonogram działa na Publish Jobs (PENDING), a nie na statusach mediów (UPLOADED/READY).',
      });
    }

    const bundles: PlatformBundle[] = jobsForSuggestion.map((job) => ({
      platform: job.socialAccount.platform,
      caption: '',
      hashtags: [],
    }));

    const analysis: AnalysisOutput = {
      persona: 'neutral',
      contentType: 'unknown',
      intent: 'unknown',
      confidence: 0.5,
      safetyFlags: [],
      unknownAspectRatio: true,
      aspectRatioConfidence: 0,
    };

    const scheduleInput: OrchestrateContentInput = {
      timezone,
      mode: 'ai-autopilot',
      publishMode: 'draft',
      idempotencyKey: `schedule-ai-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    };

    const schedule = optimizeSchedule(analysis, bundles, scheduleInput);

    const suggestions = jobsForSuggestion.map((job, index) => ({
      jobId: job.id,
      platform: job.socialAccount.platform,
      previousScheduledFor: job.scheduledFor.toISOString(),
      suggestedScheduledFor: schedule[index]?.scheduledFor ?? job.scheduledFor.toISOString(),
      timezone,
      score: schedule[index]?.score ?? 0,
      reason: schedule[index]?.reason ?? 'Brak zmiany (fallback).',
    }));

    let updatedCount = 0;

    if (apply) {
      await prisma.$transaction(
        suggestions.map((item) =>
          prisma.publishJob.updateMany({
            where: {
              id: item.jobId,
              status: 'PENDING',
              video: {
                userId: user.userId,
              },
            },
            data: {
              scheduledFor: new Date(item.suggestedScheduledFor),
            },
          }),
        ),
      ).then((results) => {
        updatedCount = results.reduce((sum, result) => sum + result.count, 0);
      });
    }

    await incrementUsage(user.userId, 'ai_autopilot_runs');

    return NextResponse.json({
      success: true,
      timezone,
      applied: apply,
      scannedCount: jobsForSuggestion.length,
      updatedCount,
      suggestions,
      noPendingJobs: false,
      publishStatusBreakdown,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return unauthorized();
    }

    if (error instanceof Error && error.message.startsWith('Przekroczono limit planu')) {
      return badRequest(error.message);
    }

    return serverError(error);
  }
}

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/server/prisma';
import { serverError } from '@/lib/server/http';

type PlatformStatusRow = {
  platform: string;
  success_count: number;
  failed_count: number;
};

type RetryReason = {
  reason: string;
  count: number;
};

function extractRetryReason(message?: string | null) {
  if (!message) {
    return null;
  }

  const retryMatch = message.match(/^\[retry-attempt:\d+\]\s*(.+)$/);
  if (retryMatch?.[1]) {
    return retryMatch[1].trim();
  }

  if (message.includes('retry')) {
    return message.trim();
  }

  return null;
}

export async function GET() {
  try {
    const [finishedSuccess, finishedFailed, platformRows, recentFailures, retrySource] =
      await Promise.all([
        prisma.publishJob.count({ where: { status: 'SUCCESS' } }),
        prisma.publishJob.count({ where: { status: 'FAILED' } }),
        prisma.$queryRaw<PlatformStatusRow[]>`
          SELECT
            sa.platform::text AS platform,
            SUM(CASE WHEN pj.status = 'SUCCESS' THEN 1 ELSE 0 END)::int AS success_count,
            SUM(CASE WHEN pj.status = 'FAILED' THEN 1 ELSE 0 END)::int AS failed_count
          FROM "PublishJob" pj
          JOIN "SocialAccount" sa ON sa.id = pj."socialAccountId"
          GROUP BY sa.platform
        `,
        prisma.publishJob.findMany({
          where: { status: 'FAILED' },
          orderBy: { updatedAt: 'desc' },
          take: 10,
          select: {
            id: true,
            updatedAt: true,
            errorMessage: true,
            socialAccount: {
              select: {
                platform: true,
              },
            },
            video: {
              select: {
                title: true,
              },
            },
          },
        }),
        prisma.publishJob.findMany({
          where: {
            errorMessage: {
              not: null,
            },
          },
          orderBy: { updatedAt: 'desc' },
          take: 200,
          select: {
            errorMessage: true,
          },
        }),
      ]);

    const totalFinished = finishedSuccess + finishedFailed;
    const overallSuccessRate =
      totalFinished > 0 ? Math.round((finishedSuccess / totalFinished) * 10000) / 100 : 0;

    const perPlatform = platformRows.map((row) => {
      const finished = row.success_count + row.failed_count;
      const successRate = finished > 0 ? Math.round((row.success_count / finished) * 10000) / 100 : 0;

      return {
        platform: row.platform,
        success: row.success_count,
        failed: row.failed_count,
        finished,
        successRate,
      };
    });

    const retryReasonCounts = new Map<string, number>();
    retrySource.forEach((item) => {
      const reason = extractRetryReason(item.errorMessage);
      if (!reason) {
        return;
      }

      retryReasonCounts.set(reason, (retryReasonCounts.get(reason) ?? 0) + 1);
    });

    const retryReasons: RetryReason[] = Array.from(retryReasonCounts.entries())
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);

    return NextResponse.json({
      overall: {
        success: finishedSuccess,
        failed: finishedFailed,
        totalFinished,
        successRate: overallSuccessRate,
      },
      perPlatform,
      recentFailures: recentFailures.map((item) => ({
        id: item.id,
        at: item.updatedAt,
        platform: item.socialAccount.platform,
        videoTitle: item.video.title,
        errorMessage: item.errorMessage,
      })),
      retryReasons,
    });
  } catch (error) {
    return serverError(error);
  }
}

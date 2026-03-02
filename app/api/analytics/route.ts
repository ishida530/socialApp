import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserFromRequest } from '@/lib/server/auth';
import { prisma } from '@/lib/server/prisma';
import { serverError, unauthorized } from '@/lib/server/http';

type RangeKey = '7d' | '30d' | '90d';

const RANGE_DAYS: Record<RangeKey, number> = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
};

function resolveRange(rangeRaw: string | null): RangeKey {
  if (rangeRaw === '7d' || rangeRaw === '30d' || rangeRaw === '90d') {
    return rangeRaw;
  }

  return '30d';
}

function toIsoDateOnly(value: Date) {
  return value.toISOString().slice(0, 10);
}

export async function GET(request: NextRequest) {
  try {
    const user = getAuthUserFromRequest(request);
    const range = resolveRange(request.nextUrl.searchParams.get('range'));
    const days = RANGE_DAYS[range];

    const now = new Date();
    const start = new Date(now);
    start.setDate(start.getDate() - (days - 1));
    start.setHours(0, 0, 0, 0);

    const [videos, jobs, connectedAccounts] = await Promise.all([
      prisma.video.findMany({
        where: {
          userId: user.userId,
          createdAt: { gte: start },
        },
        select: {
          createdAt: true,
        },
      }),
      prisma.publishJob.findMany({
        where: {
          video: {
            userId: user.userId,
          },
          createdAt: { gte: start },
        },
        select: {
          createdAt: true,
          status: true,
        },
      }),
      prisma.socialAccount.count({
        where: {
          userId: user.userId,
        },
      }),
    ]);

    const trendMap = new Map<string, {
      date: string;
      videos: number;
      jobsCreated: number;
      success: number;
      failed: number;
    }>();

    for (let dayIndex = 0; dayIndex < days; dayIndex += 1) {
      const day = new Date(start);
      day.setDate(start.getDate() + dayIndex);
      const key = toIsoDateOnly(day);

      trendMap.set(key, {
        date: key,
        videos: 0,
        jobsCreated: 0,
        success: 0,
        failed: 0,
      });
    }

    videos.forEach((video) => {
      const key = toIsoDateOnly(video.createdAt);
      const bucket = trendMap.get(key);
      if (bucket) {
        bucket.videos += 1;
      }
    });

    jobs.forEach((job) => {
      const key = toIsoDateOnly(job.createdAt);
      const bucket = trendMap.get(key);
      if (!bucket) {
        return;
      }

      bucket.jobsCreated += 1;
      if (job.status === 'SUCCESS') {
        bucket.success += 1;
      }
      if (job.status === 'FAILED') {
        bucket.failed += 1;
      }
    });

    const trend = Array.from(trendMap.values());

    const jobsSucceeded = jobs.filter((job) => job.status === 'SUCCESS').length;
    const jobsFailed = jobs.filter((job) => job.status === 'FAILED').length;
    const finishedJobs = jobsSucceeded + jobsFailed;

    return NextResponse.json({
      range,
      days,
      totals: {
        videosUploaded: videos.length,
        jobsCreated: jobs.length,
        jobsSucceeded,
        jobsFailed,
        connectedAccounts,
        successRate:
          finishedJobs > 0 ? Math.round((jobsSucceeded / finishedJobs) * 10000) / 100 : 0,
      },
      trend,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return unauthorized();
    }

    return serverError(error);
  }
}

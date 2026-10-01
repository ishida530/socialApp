import { prisma } from './prisma';

// Data behind the dashboard, shared by the API routes (client refreshes) and the dashboard Server
// Component (first render) - one implementation, so both always return the same numbers.

export type AnalyticsRangeKey = '7d' | '30d' | '90d';

export const ANALYTICS_RANGE_DAYS: Record<AnalyticsRangeKey, number> = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
};

export function resolveAnalyticsRange(rangeRaw: string | null): AnalyticsRangeKey {
  if (rangeRaw === '7d' || rangeRaw === '30d' || rangeRaw === '90d') {
    return rangeRaw;
  }

  return '30d';
}

function toIsoDateOnly(value: Date) {
  return value.toISOString().slice(0, 10);
}

export type AnalyticsSummary = Awaited<ReturnType<typeof getAnalyticsSummary>>;

export async function getAnalyticsSummary(userId: string, range: AnalyticsRangeKey) {
  const days = ANALYTICS_RANGE_DAYS[range];

  const now = new Date();
  const start = new Date(now);
  start.setDate(start.getDate() - (days - 1));
  start.setHours(0, 0, 0, 0);

  const [videos, jobs, connectedAccounts] = await Promise.all([
    prisma.video.findMany({
      where: {
        userId,
        createdAt: { gte: start },
      },
      select: {
        createdAt: true,
      },
    }),
    prisma.publishJob.findMany({
      where: {
        video: {
          userId,
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
        userId,
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

  return {
    range,
    days,
    totals: {
      videosUploaded: videos.length,
      jobsCreated: jobs.length,
      jobsSucceeded,
      jobsFailed,
      connectedAccounts,
      successRate: finishedJobs > 0 ? Math.round((jobsSucceeded / finishedJobs) * 10000) / 100 : 0,
    },
    trend,
  };
}

export type OnboardingProgress = {
  hasAccounts: boolean;
  hasMedia: boolean;
  hasDrafts: boolean;
  hasSchedule: boolean;
};

// Same four checks the onboarding checklist used to make with four API calls
// (/social-accounts, /videos, /publish-jobs/drafts, /jobs), as cheap existence queries.
export async function getOnboardingProgress(userId: string): Promise<OnboardingProgress> {
  const [account, video, draft, job] = await Promise.all([
    prisma.socialAccount.findFirst({ where: { userId }, select: { id: true } }),
    prisma.video.findFirst({ where: { userId }, select: { id: true } }),
    prisma.publishJob.findFirst({ where: { status: 'DRAFT', video: { userId } }, select: { id: true } }),
    prisma.publishJob.findFirst({ where: { video: { userId } }, select: { id: true } }),
  ]);

  return {
    hasAccounts: Boolean(account),
    hasMedia: Boolean(video),
    hasDrafts: Boolean(draft),
    hasSchedule: Boolean(job),
  };
}

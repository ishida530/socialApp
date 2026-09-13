// TASK-4.1.1 ("obserwuj"/"sprawdź" steps of the planning loop): bridges the real engagement data
// collected in lib/server/post-metrics.ts into the PerformanceDataInput[] shape schedule.ts has
// accepted since before this session, but which nothing internal ever populated - it was only
// ever an external-caller-supplied field, always undefined on the real path. Honest about limits:
// platforms don't give us CTR or watch-time through the read scopes we have, so `er` (engagement
// rate) is the only real proxy available - ctr/watchTime/saves stay undefined rather than
// fabricated, so optimizeSchedule's own scoring (schedule.ts) naturally weighs this proxy at its
// real 30% share, not more.
import { prisma } from '@/lib/server/prisma';
import type { PerformanceDataInput } from './types';

const LOOKBACK_DAYS = 90;

// schedule.ts's baseline hours and nextLocalDateAtHour both operate in the request's LOCAL
// timezone, not UTC - publishedAt (stored UTC) has to be converted to that same local hour or
// the history/baseline blend in optimizeSchedule silently compares two different clocks.
function localHour(date: Date, timeZone: string): number {
  const formatted = new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', hour12: false }).format(date);
  const hour = Number(formatted);
  return Number.isFinite(hour) ? hour % 24 : date.getUTCHours();
}

export async function getRealPerformanceData(userId: string, timezone: string): Promise<PerformanceDataInput[]> {
  const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

  const rows = await prisma.postMetric.findMany({
    where: {
      publishJob: {
        video: { userId },
        publishedAt: { gte: since },
      },
    },
    select: {
      likes: true,
      comments: true,
      shares: true,
      views: true,
      publishJob: {
        select: {
          publishedAt: true,
          socialAccount: { select: { platform: true } },
        },
      },
    },
  });

  // Average engagement rate per (platform, hour-of-day) across every post we have real data for,
  // in the user's own historical slots - same grouping key schedule.ts's mapPreferredHourByPlatform
  // already reads (platform + hour), just now fed by real numbers instead of always being empty.
  const buckets = new Map<string, { platform: PerformanceDataInput['platform']; hour: number; erSum: number; count: number }>();

  for (const row of rows) {
    const publishedAt = row.publishJob.publishedAt;
    const views = row.views;
    if (!publishedAt || !views || views <= 0) {
      continue; // no honest engagement-rate signal without a real view count to divide by
    }

    const platform = row.publishJob.socialAccount.platform as PerformanceDataInput['platform'];
    const hour = localHour(publishedAt, timezone);
    const key = `${platform}:${hour}`;
    const engagement = (row.likes ?? 0) + (row.comments ?? 0) + (row.shares ?? 0);
    const er = engagement / views;

    const existing = buckets.get(key);
    if (existing) {
      existing.erSum += er;
      existing.count += 1;
    } else {
      buckets.set(key, { platform, hour, erSum: er, count: 1 });
    }
  }

  return Array.from(buckets.values()).map((bucket) => ({
    platform: bucket.platform,
    hour: bucket.hour,
    er: bucket.erSum / bucket.count,
  }));
}

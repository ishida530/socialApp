import { prisma } from './prisma';

// YouTube API Services Developer Policies (2026-10-01): statistics obtained through the API (video
// view/like counts, channel subscriber counts) may only be kept if refreshed at least every 30
// days; anything else must be deleted after 30 days. Historical growth snapshots can't be
// "refreshed", and PostMetric rows stop being refreshed once a post ages out of the metrics sweep -
// so both are deleted 30 days after they were last fetched. Runs from the daily cron.
const YOUTUBE_DATA_MAX_AGE_DAYS = 30;

export async function purgeStaleYouTubeApiData(now = new Date()) {
  const cutoff = new Date(now.getTime() - YOUTUBE_DATA_MAX_AGE_DAYS * 24 * 60 * 60 * 1000);

  const [snapshots, metrics] = await Promise.all([
    prisma.accountGrowthSnapshot.deleteMany({
      where: { fetchedAt: { lt: cutoff }, socialAccount: { platform: 'YOUTUBE' } },
    }),
    prisma.postMetric.deleteMany({
      where: { fetchedAt: { lt: cutoff }, publishJob: { socialAccount: { platform: 'YOUTUBE' } } },
    }),
  ]);

  return { growthSnapshotsDeleted: snapshots.count, postMetricsDeleted: metrics.count };
}

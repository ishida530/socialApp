// EPIC 11 Sprint 11.1 (2026-09-14): account-level growth (followers/subscribers), distinct from
// lib/server/post-metrics.ts (per-post engagement). Every field used here is already covered by
// scopes granted before this session (user.info.stats/instagram_basic/pages_read_engagement/
// youtube.readonly) - verified against each platform's current docs, zero new OAuth consent
// needed. Each fetcher degrades to null on any error (unsupported field, network failure,
// missing token) rather than throwing - same defensive posture as post-metrics.ts, since this is
// purely additive telemetry that must never affect anything else.
import { prisma } from './prisma';
import { decryptToken, refreshSocialAccessToken } from './social-oauth';
import { logError, logEvent } from './observability';

function resolveMetaApiVersion() {
  return process.env.META_GRAPH_API_VERSION || 'v23.0';
}

async function fetchTikTokFollowerCount(accessToken: string): Promise<number | null> {
  try {
    const response = await fetch('https://open.tiktokapis.com/v2/user/info/?fields=follower_count', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as { data?: { user?: { follower_count?: unknown } } };
    const count = payload.data?.user?.follower_count;
    return typeof count === 'number' && Number.isFinite(count) ? Math.floor(count) : null;
  } catch {
    return null;
  }
}

async function fetchInstagramFollowerCount(igUserId: string, accessToken: string): Promise<number | null> {
  try {
    const version = resolveMetaApiVersion();
    const response = await fetch(
      `https://graph.facebook.com/${version}/${igUserId}?fields=followers_count&access_token=${encodeURIComponent(accessToken)}`,
    );

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as { followers_count?: unknown };
    return typeof payload.followers_count === 'number' ? Math.floor(payload.followers_count) : null;
  } catch {
    return null;
  }
}

async function fetchFacebookFollowerCount(pageId: string, accessToken: string): Promise<number | null> {
  try {
    const version = resolveMetaApiVersion();
    const response = await fetch(
      `https://graph.facebook.com/${version}/${pageId}?fields=followers_count&access_token=${encodeURIComponent(accessToken)}`,
    );

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as { followers_count?: unknown };
    return typeof payload.followers_count === 'number' ? Math.floor(payload.followers_count) : null;
  } catch {
    return null;
  }
}

async function fetchYoutubeSubscriberCount(accessToken: string): Promise<number | null> {
  try {
    const response = await fetch('https://www.googleapis.com/youtube/v3/channels?part=statistics&mine=true', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as { items?: Array<{ statistics?: { subscriberCount?: string } }> };
    const raw = payload.items?.[0]?.statistics?.subscriberCount;
    if (!raw) {
      return null;
    }
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? Math.floor(parsed) : null;
  } catch {
    return null;
  }
}

async function fetchFollowerCount(
  platform: 'YOUTUBE' | 'TIKTOK' | 'FACEBOOK' | 'INSTAGRAM',
  externalId: string | null,
  accessToken: string,
): Promise<number | null> {
  if (platform === 'TIKTOK') {
    return fetchTikTokFollowerCount(accessToken);
  }
  if (platform === 'YOUTUBE') {
    return fetchYoutubeSubscriberCount(accessToken);
  }
  if (platform === 'INSTAGRAM') {
    return externalId ? fetchInstagramFollowerCount(externalId, accessToken) : null;
  }
  return externalId ? fetchFacebookFollowerCount(externalId, accessToken) : null;
}

// Called once daily from the same cron sweep as collectMetricsForRecentJobs
// (app/api/cron/telegram-digest) - no new cron slot, same free-tier constraint already applied
// throughout this session.
export async function collectAccountGrowth(): Promise<{ attempted: number; updated: number }> {
  const accounts = await prisma.socialAccount.findMany({
    select: { id: true, platform: true, externalId: true, accessToken: true, expiresAt: true },
  });

  let updated = 0;

  for (const account of accounts) {
    try {
      let accessToken = decryptToken(account.accessToken);
      if (!accessToken || (account.expiresAt && account.expiresAt.getTime() <= Date.now() + 30_000)) {
        const refreshed = await refreshSocialAccessToken(account.id);
        accessToken = refreshed.accessToken;
      }

      if (!accessToken) {
        continue;
      }

      const followerCount = await fetchFollowerCount(
        account.platform as 'YOUTUBE' | 'TIKTOK' | 'FACEBOOK' | 'INSTAGRAM',
        account.externalId,
        accessToken,
      );

      if (followerCount === null) {
        continue;
      }

      await prisma.accountGrowthSnapshot.create({ data: { socialAccountId: account.id, followerCount } });
      updated += 1;
    } catch (error) {
      logError('account-growth', 'snapshot-error', error, { socialAccountId: account.id, platform: account.platform });
    }
  }

  logEvent('account-growth', 'sweep-complete', { attempted: accounts.length, updated });

  return { attempted: accounts.length, updated };
}

export type FollowerGrowthEntry = {
  platform: string;
  current: number;
  weekAgo: number | null;
  monthAgo: number | null;
};

async function findClosestSnapshotAtOrBefore(socialAccountId: string, before: Date) {
  return prisma.accountGrowthSnapshot.findFirst({
    where: { socialAccountId, fetchedAt: { lte: before } },
    orderBy: { fetchedAt: 'desc' },
  });
}

// TASK-11.1.3: real trend per platform, "brak jeszcze wystarczających danych" (null) instead of
// a fabricated 0 when there isn't yet a historical data point to compare against - same honesty
// rule as every other metric in this app.
export async function getFollowerGrowth(userId: string): Promise<FollowerGrowthEntry[]> {
  const accounts = await prisma.socialAccount.findMany({ where: { userId }, select: { id: true, platform: true } });
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const results: FollowerGrowthEntry[] = [];

  for (const account of accounts) {
    const latest = await prisma.accountGrowthSnapshot.findFirst({
      where: { socialAccountId: account.id },
      orderBy: { fetchedAt: 'desc' },
    });

    if (!latest) {
      continue;
    }

    const [weekAgoSnapshot, monthAgoSnapshot] = await Promise.all([
      findClosestSnapshotAtOrBefore(account.id, weekAgo),
      findClosestSnapshotAtOrBefore(account.id, monthAgo),
    ]);

    results.push({
      platform: account.platform,
      current: latest.followerCount,
      weekAgo: weekAgoSnapshot?.followerCount ?? null,
      monthAgo: monthAgoSnapshot?.followerCount ?? null,
    });
  }

  return results;
}

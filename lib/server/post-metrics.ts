// TASK: real post-performance metrics collection - the prerequisite the product owner and I
// agreed on before any AI-driven "analyze what performs well / suggest improvements" feature can
// honestly exist (the app previously collected zero engagement data). Read-only, best-effort:
// every platform call is wrapped so a missing field, an unsupported node type, or a transient API
// error degrades to a partial/empty snapshot instead of ever failing the sweep or touching
// PublishJob.status - this is purely additive telemetry, never allowed to affect publishing.
import { prisma } from './prisma';
import { decryptToken, refreshSocialAccessToken } from './social-oauth';
import { logError, logEvent } from './observability';

type MetricSnapshot = {
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
};

const EMPTY_SNAPSHOT: MetricSnapshot = { views: null, likes: null, comments: null, shares: null };

function resolveMetaApiVersion() {
  return process.env.META_GRAPH_API_VERSION || 'v23.0';
}

function toNullableInt(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? Math.floor(value) : null;
}

// Instagram Graph API media node - like_count/comments_count are supported for every media type.
async function fetchInstagramLikesComments(mediaId: string, accessToken: string) {
  try {
    const version = resolveMetaApiVersion();
    const response = await fetch(
      `https://graph.facebook.com/${version}/${mediaId}?fields=like_count,comments_count&access_token=${encodeURIComponent(accessToken)}`,
    );

    if (!response.ok) {
      return { likes: null, comments: null };
    }

    const payload = (await response.json()) as { like_count?: unknown; comments_count?: unknown };
    return { likes: toNullableInt(payload.like_count), comments: toNullableInt(payload.comments_count) };
  } catch {
    return { likes: null, comments: null };
  }
}

// `views` (via /insights) replaced the deprecated `impressions`/`plays` metrics for media
// created after 2024-07-02 - verified against current Meta docs 2026-09. Every post this app has
// ever published is newer than that, so `views` is safe to request unconditionally here. Kept as
// a separate call from the media-node fields above (own try/catch) since insights is a genuinely
// different endpoint that can fail independently.
async function fetchInstagramViews(mediaId: string, accessToken: string) {
  try {
    const version = resolveMetaApiVersion();
    const response = await fetch(
      `https://graph.facebook.com/${version}/${mediaId}/insights?metric=views&access_token=${encodeURIComponent(accessToken)}`,
    );

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as { data?: Array<{ name?: string; values?: Array<{ value?: unknown }> }> };
    const viewsMetric = payload.data?.find((entry) => entry.name === 'views');
    return toNullableInt(viewsMetric?.values?.[0]?.value);
  } catch {
    return null;
  }
}

async function fetchInstagramMetrics(mediaId: string, accessToken: string): Promise<MetricSnapshot> {
  const [{ likes, comments }, views] = await Promise.all([
    fetchInstagramLikesComments(mediaId, accessToken),
    fetchInstagramViews(mediaId, accessToken),
  ]);

  return { views, likes, comments, shares: null };
}

// Facebook post/video node - likes/comments as summary connections, shares as a direct field.
// remotePostId here may be a feed post_id or a Reels video_id depending on metaPostFormat; both
// node types generally support these fields, and a failure here degrades to nulls rather than
// throwing (same defensive posture as fetchFacebookReelPermalink in publish-processor.ts).
async function fetchFacebookMetrics(postId: string, accessToken: string): Promise<MetricSnapshot> {
  try {
    const version = resolveMetaApiVersion();
    const response = await fetch(
      `https://graph.facebook.com/${version}/${postId}?fields=likes.summary(true),comments.summary(true),shares&access_token=${encodeURIComponent(accessToken)}`,
    );

    if (!response.ok) {
      return EMPTY_SNAPSHOT;
    }

    const payload = (await response.json()) as {
      likes?: { summary?: { total_count?: unknown } };
      comments?: { summary?: { total_count?: unknown } };
      shares?: { count?: unknown };
    };

    return {
      views: null,
      likes: toNullableInt(payload.likes?.summary?.total_count),
      comments: toNullableInt(payload.comments?.summary?.total_count),
      shares: toNullableInt(payload.shares?.count),
    };
  } catch {
    return EMPTY_SNAPSHOT;
  }
}

// YouTube Data API videos.list - reliable, well-documented statistics part. youtube.readonly is
// already part of the granted OAuth scope (social-oauth.ts), no new consent needed.
async function fetchYoutubeMetrics(videoId: string, accessToken: string): Promise<MetricSnapshot> {
  try {
    const response = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${encodeURIComponent(videoId)}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );

    if (!response.ok) {
      return EMPTY_SNAPSHOT;
    }

    const payload = (await response.json()) as {
      items?: Array<{ statistics?: { viewCount?: string; likeCount?: string; commentCount?: string } }>;
    };
    const statistics = payload.items?.[0]?.statistics;
    if (!statistics) {
      return EMPTY_SNAPSHOT;
    }

    return {
      views: statistics.viewCount ? toNullableInt(Number(statistics.viewCount)) : null,
      likes: statistics.likeCount ? toNullableInt(Number(statistics.likeCount)) : null,
      comments: statistics.commentCount ? toNullableInt(Number(statistics.commentCount)) : null,
      shares: null,
    };
  } catch {
    return EMPTY_SNAPSHOT;
  }
}

// TikTok Display API "Query Videos" (video.list scope, already granted - see
// docs/status-audytow-api.md). Same sandbox/audit limitation as publishing itself: only returns
// data for accounts explicitly added as testers/target users until TikTok approves the pending
// production audit - not a new limitation introduced by this feature.
async function fetchTiktokMetrics(videoId: string, accessToken: string): Promise<MetricSnapshot> {
  try {
    const response = await fetch(
      'https://open.tiktokapis.com/v2/video/query/?fields=id,like_count,comment_count,share_count,view_count',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ filters: { video_ids: [videoId] } }),
      },
    );

    if (!response.ok) {
      return EMPTY_SNAPSHOT;
    }

    const payload = (await response.json()) as {
      data?: {
        videos?: Array<{
          like_count?: unknown;
          comment_count?: unknown;
          share_count?: unknown;
          view_count?: unknown;
        }>;
      };
    };
    const video = payload.data?.videos?.[0];
    if (!video) {
      return EMPTY_SNAPSHOT;
    }

    return {
      views: toNullableInt(video.view_count),
      likes: toNullableInt(video.like_count),
      comments: toNullableInt(video.comment_count),
      shares: toNullableInt(video.share_count),
    };
  } catch {
    return EMPTY_SNAPSHOT;
  }
}

async function fetchMetricsForPlatform(
  platform: 'YOUTUBE' | 'TIKTOK' | 'FACEBOOK' | 'INSTAGRAM',
  remotePostId: string,
  accessToken: string,
): Promise<MetricSnapshot> {
  if (platform === 'INSTAGRAM') return fetchInstagramMetrics(remotePostId, accessToken);
  if (platform === 'FACEBOOK') return fetchFacebookMetrics(remotePostId, accessToken);
  if (platform === 'YOUTUBE') return fetchYoutubeMetrics(remotePostId, accessToken);
  return fetchTiktokMetrics(remotePostId, accessToken);
}

const METRICS_LOOKBACK_DAYS = 14;
const REFRESH_STALE_AFTER_HOURS = 20;
const MAX_JOBS_PER_SWEEP = 200;

// Called once daily from the same cron sweep as sendMorningDigest/sendInactivityNudges
// (app/api/cron/telegram-digest) rather than a new cron entry - same free-tier Vercel cron-slot
// constraint already applied to TASK-3.2.3.
export async function collectMetricsForRecentJobs(): Promise<{ attempted: number; updated: number }> {
  const lookbackCutoff = new Date(Date.now() - METRICS_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  const staleCutoff = new Date(Date.now() - REFRESH_STALE_AFTER_HOURS * 60 * 60 * 1000);

  const jobs = await prisma.publishJob.findMany({
    where: {
      status: 'SUCCESS',
      remotePostId: { not: null },
      publishedAt: { gte: lookbackCutoff },
      OR: [{ postMetric: null }, { postMetric: { fetchedAt: { lte: staleCutoff } } }],
    },
    take: MAX_JOBS_PER_SWEEP,
    orderBy: { publishedAt: 'desc' },
    include: { socialAccount: true },
  });

  let updated = 0;

  for (const job of jobs) {
    try {
      let accessToken = decryptToken(job.socialAccount.accessToken);
      if (!accessToken) {
        const refreshed = await refreshSocialAccessToken(job.socialAccount.id);
        accessToken = refreshed.accessToken;
      }

      if (!accessToken || !job.remotePostId) {
        continue;
      }

      const snapshot = await fetchMetricsForPlatform(
        job.socialAccount.platform as 'YOUTUBE' | 'TIKTOK' | 'FACEBOOK' | 'INSTAGRAM',
        job.remotePostId,
        accessToken,
      );

      await prisma.postMetric.upsert({
        where: { publishJobId: job.id },
        create: { publishJobId: job.id, ...snapshot },
        update: { ...snapshot, fetchedAt: new Date() },
      });
      updated += 1;
    } catch (error) {
      logError('post-metrics', 'metrics-fetch-error', error, { jobId: job.id, platform: job.socialAccount.platform });
    }
  }

  logEvent('post-metrics', 'metrics-sweep-complete', { attempted: jobs.length, updated });

  return { attempted: jobs.length, updated };
}

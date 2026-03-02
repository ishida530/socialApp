import { prisma } from './prisma';
import { logError, logEvent } from './observability';
import { decryptToken, refreshSocialAccessToken } from './social-oauth';
import { readFile } from 'fs/promises';

type ClaimedJobRow = {
  id: string;
};

type PublishTransportResult = {
  provider: 'YOUTUBE' | 'TIKTOK';
  remoteId?: string;
};

class PublishAuthError extends Error {
  status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = 'PublishAuthError';
    this.status = status;
  }
}

function isPermanentOAuthScopeError(message: string) {
  const normalized = message.toLowerCase();
  return (
    normalized.includes('scope_not_authorized') ||
    normalized.includes('did not authorize the scope') ||
    normalized.includes('insufficient scope')
  );
}

const MAX_RETRY_ATTEMPTS = 3;
const BASE_BACKOFF_SECONDS = 60;
const TIKTOK_STATUS_POLL_SECONDS = 60;
const MAX_TIKTOK_POLL_ATTEMPTS = 20;

export type PublishProcessorSummary = {
  claimed: number;
  succeeded: number;
  failed: number;
  retryScheduled: number;
  skipped: number;
};

function extractRetryAttempt(errorMessage?: string | null) {
  if (!errorMessage) {
    return 0;
  }

  const matched = errorMessage.match(/\[retry-attempt:(\d+)\]/);
  if (!matched?.[1]) {
    return 0;
  }

  const parsed = Number(matched[1]);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 0;
  }

  return Math.floor(parsed);
}

function buildRetryMessage(attempt: number, reason: string) {
  return `[retry-attempt:${attempt}] ${reason}`;
}

function buildTikTokTrackingMessage(publishId: string, pollAttempt: number) {
  return `[tiktok-tracking:${publishId}:${pollAttempt}] awaiting-final-status`;
}

function extractTikTokTrackingState(errorMessage?: string | null) {
  if (!errorMessage) {
    return null;
  }

  const matched = errorMessage.match(/\[tiktok-tracking:([^:\]]+):(\d+)\]/);
  if (!matched?.[1] || !matched?.[2]) {
    return null;
  }

  const pollAttempt = Number(matched[2]);
  if (!Number.isFinite(pollAttempt) || pollAttempt < 1) {
    return null;
  }

  return {
    publishId: matched[1],
    pollAttempt,
  };
}

async function scheduleTikTokStatusPoll(jobId: string, publishId: string, pollAttempt: number) {
  const nextRun = new Date(Date.now() + TIKTOK_STATUS_POLL_SECONDS * 1000);

  await prisma.publishJob.update({
    where: { id: jobId },
    data: {
      status: 'PENDING',
      scheduledFor: nextRun,
      errorMessage: buildTikTokTrackingMessage(publishId, pollAttempt),
    },
  });

  logEvent('publish-processor', 'job-tiktok-status-poll-scheduled', {
    jobId,
    publishId,
    pollAttempt,
    nextRun: nextRun.toISOString(),
  });
}

async function markJobSuccess(jobId: string) {
  await prisma.publishJob.update({
    where: { id: jobId },
    data: {
      status: 'SUCCESS',
      publishedAt: new Date(),
      errorMessage: null,
    },
  });
}

function normalizeTikTokFinalState(rawValue?: string) {
  const value = rawValue?.toUpperCase();
  if (!value) {
    return 'PROCESSING' as const;
  }

  if (
    value.includes('SUCCESS') ||
    value.includes('COMPLETE') ||
    value.includes('PUBLISHED') ||
    value.includes('POSTED')
  ) {
    return 'SUCCESS' as const;
  }

  if (
    value.includes('FAIL') ||
    value.includes('ERROR') ||
    value.includes('REJECT') ||
    value.includes('CANCEL')
  ) {
    return 'FAILED' as const;
  }

  return 'PROCESSING' as const;
}

async function fetchTikTokPublishStatus(publishId: string, accessToken: string) {
  const response = await fetch('https://open.tiktokapis.com/v2/post/publish/status/fetch/', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ publish_id: publishId }),
  });

  if (!response.ok) {
    const errorBody = await response.text();

    if (response.status === 401 || response.status === 403) {
      throw new PublishAuthError(
        `TikTok status token invalid/expired: ${errorBody || response.statusText}`,
        response.status,
      );
    }

    throw new Error(`TikTok publish status fetch failed: ${errorBody || response.statusText}`);
  }

  const payload = (await response.json()) as {
    data?: {
      status?: string;
      publish_status?: string;
      post_status?: string;
      fail_reason?: string;
      reason?: string;
    };
    error?: {
      code?: string | number;
      message?: string;
    };
  };

  const rawStatus =
    payload.data?.status ?? payload.data?.publish_status ?? payload.data?.post_status;
  const finalState = normalizeTikTokFinalState(rawStatus);

  return {
    finalState,
    rawStatus,
    reason: payload.data?.fail_reason ?? payload.data?.reason ?? payload.error?.message,
  };
}

async function failOrScheduleRetry(
  jobId: string,
  currentAttempt: number,
  reason: string,
) {
  if (currentAttempt >= MAX_RETRY_ATTEMPTS) {
    await prisma.publishJob.update({
      where: { id: jobId },
      data: {
        status: 'FAILED',
        errorMessage: buildRetryMessage(currentAttempt, reason),
      },
    });

    logEvent('publish-processor', 'job-failed-final', {
      jobId,
      attempt: currentAttempt,
      reason,
    });

    return 'failed' as const;
  }

  const delaySeconds = BASE_BACKOFF_SECONDS * 2 ** (currentAttempt - 1);
  const nextRun = new Date(Date.now() + delaySeconds * 1000);

  await prisma.publishJob.update({
    where: { id: jobId },
    data: {
      status: 'PENDING',
      scheduledFor: nextRun,
      errorMessage: buildRetryMessage(currentAttempt, reason),
    },
  });

  logEvent('publish-processor', 'job-retry-scheduled', {
    jobId,
    attempt: currentAttempt,
    delaySeconds,
    reason,
  });

  return 'retryScheduled' as const;
}

function normalizeBatchSize(value: number) {
  if (!Number.isFinite(value)) {
    return 20;
  }

  return Math.min(100, Math.max(1, Math.floor(value)));
}

function resolvePublicVideoUrl(sourceUrl: string) {
  if (sourceUrl.startsWith('http://') || sourceUrl.startsWith('https://')) {
    return sourceUrl;
  }

  const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:3000';
  return new URL(sourceUrl, frontendUrl).toString();
}

async function resolveVideoBytes(job: {
  video: {
    sourceUrl: string;
    localPath: string | null;
  };
}) {
  if (job.video.localPath) {
    return readFile(job.video.localPath);
  }

  const sourceUrl = resolvePublicVideoUrl(job.video.sourceUrl);
  const response = await fetch(sourceUrl, { cache: 'no-store' });

  if (!response.ok) {
    throw new Error(`Nie udało się pobrać pliku źródłowego (${response.status})`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length === 0) {
    throw new Error('Pobrany plik źródłowy jest pusty');
  }

  return buffer;
}

async function publishToYouTube(job: {
  video: {
    title: string;
    description: string | null;
    sourceUrl: string;
    localPath: string | null;
  };
}, accessToken: string) {
  const fileBytes = await resolveVideoBytes(job);
  const boundary = `flowstate-${Date.now()}-${Math.random().toString(16).slice(2)}`;

  const metadata = {
    snippet: {
      title: job.video.title.slice(0, 100),
      description: (job.video.description ?? '').slice(0, 5000),
      categoryId: '22',
    },
    status: {
      privacyStatus: 'private',
    },
  };

  const head = Buffer.from(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: video/mp4\r\n\r\n`,
    'utf8',
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8');
  const body = Buffer.concat([head, fileBytes, tail]);

  const response = await fetch(
    'https://www.googleapis.com/upload/youtube/v3/videos?part=snippet,status&uploadType=multipart',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body,
    },
  );

  if (!response.ok) {
    const errorBody = await response.text();

    if (response.status === 401 || response.status === 403) {
      throw new PublishAuthError(
        `YouTube access token invalid/expired: ${errorBody || response.statusText}`,
        response.status,
      );
    }

    throw new Error(`YouTube publish failed: ${errorBody || response.statusText}`);
  }

  const payload = (await response.json()) as { id?: string };
  return {
    provider: 'YOUTUBE' as const,
    remoteId: payload.id,
  };
}

async function publishToTikTok(job: {
  video: { title: string; sourceUrl: string };
}, accessToken: string) {
  const sourceUrl = resolvePublicVideoUrl(job.video.sourceUrl);

  const response = await fetch('https://open.tiktokapis.com/v2/post/publish/video/init/', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      post_info: {
        title: job.video.title.slice(0, 2200),
        privacy_level: 'SELF_ONLY',
        disable_comment: false,
        disable_duet: false,
        disable_stitch: false,
      },
      source_info: {
        source: 'PULL_FROM_URL',
        video_url: sourceUrl,
      },
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();

    if (response.status === 401 || response.status === 403) {
      throw new PublishAuthError(
        `TikTok access token invalid/expired: ${errorBody || response.statusText}`,
        response.status,
      );
    }

    throw new Error(`TikTok publish init failed: ${errorBody || response.statusText}`);
  }

  const payload = (await response.json()) as {
    data?: {
      publish_id?: string;
    };
  };

  return {
    provider: 'TIKTOK' as const,
    remoteId: payload.data?.publish_id,
  };
}

async function publishToPlatform(job: {
  socialAccount: { platform: 'YOUTUBE' | 'TIKTOK' };
  video: {
    title: string;
    description: string | null;
    sourceUrl: string;
    localPath: string | null;
  };
}, accessToken: string) {
  if (job.socialAccount.platform === 'YOUTUBE') {
    return publishToYouTube(job, accessToken);
  }

  if (job.socialAccount.platform === 'TIKTOK') {
    return publishToTikTok(job, accessToken);
  }

  throw new Error(`Nieobsługiwana platforma publikacji: ${job.socialAccount.platform}`);
}

function shouldRefreshBeforePublish(account: {
  accessToken: string | null;
  expiresAt: Date | null;
}) {
  if (!account.accessToken) {
    return true;
  }

  if (!account.expiresAt) {
    return false;
  }

  return account.expiresAt.getTime() <= Date.now() + 30_000;
}

async function claimDuePublishJobs(batchSizeRaw: number) {
  const batchSize = normalizeBatchSize(batchSizeRaw);

  const rows = await prisma.$transaction(async (tx) => {
    return tx.$queryRaw<ClaimedJobRow[]>`
      WITH picked AS (
        SELECT id
        FROM "PublishJob"
        WHERE status = 'PENDING'
          AND "scheduledFor" <= NOW()
        ORDER BY "scheduledFor" ASC
        FOR UPDATE SKIP LOCKED
        LIMIT ${batchSize}
      )
      UPDATE "PublishJob" AS job
      SET status = 'RUNNING',
          "updatedAt" = NOW()
      FROM picked
      WHERE job.id = picked.id
      RETURNING job.id
    `;
  });

  logEvent('publish-processor', 'jobs-claimed', {
    batchSize,
    claimed: rows.length,
  });

  return rows.map((row) => row.id);
}

async function processClaimedJob(jobId: string) {
  const job = await prisma.publishJob.findUnique({
    where: { id: jobId },
    include: {
      video: true,
      socialAccount: true,
    },
  });

  if (!job) {
    return 'skipped' as const;
  }

  const nextAttempt = extractRetryAttempt(job.errorMessage) + 1;
  const tiktokTrackingState =
    job.socialAccount.platform === 'TIKTOK'
      ? extractTikTokTrackingState(job.errorMessage)
      : null;

  const publishInput = {
    socialAccount: {
      platform: job.socialAccount.platform as 'YOUTUBE' | 'TIKTOK',
    },
    video: {
      title: job.video.title,
      description: job.video.description,
      sourceUrl: job.video.sourceUrl,
      localPath: job.video.localPath,
    },
  };

  try {
    logEvent('publish-processor', 'job-processing-started', {
      jobId: job.id,
      attempt: nextAttempt,
      platform: job.socialAccount.platform,
    });

    let accessToken = decryptToken(job.socialAccount.accessToken);
    if (!accessToken || shouldRefreshBeforePublish(job.socialAccount)) {
      const refreshed = await refreshSocialAccessToken(job.socialAccount.id);
      accessToken = refreshed.accessToken;

      logEvent('publish-processor', 'job-access-token-refreshed', {
        jobId: job.id,
        attempt: nextAttempt,
        platform: job.socialAccount.platform,
        reason: !job.socialAccount.accessToken ? 'missing-token' : 'expired-token',
      });
    }

    if (tiktokTrackingState) {
      const status = await fetchTikTokPublishStatus(
        tiktokTrackingState.publishId,
        accessToken,
      );

      if (status.finalState === 'SUCCESS') {
        await markJobSuccess(job.id);

        logEvent('publish-processor', 'job-succeeded', {
          jobId: job.id,
          attempt: nextAttempt,
          platform: 'TIKTOK',
          remoteId: tiktokTrackingState.publishId,
          rawStatus: status.rawStatus,
        });

        return 'succeeded' as const;
      }

      if (status.finalState === 'FAILED') {
        await prisma.publishJob.update({
          where: { id: job.id },
          data: {
            status: 'FAILED',
            errorMessage: `TikTok publish failed: ${status.reason || status.rawStatus || 'unknown reason'}`,
          },
        });

        logEvent('publish-processor', 'job-failed-final', {
          jobId: job.id,
          attempt: nextAttempt,
          reason: status.reason || status.rawStatus || 'tiktok-final-failed',
        });

        return 'failed' as const;
      }

      const nextPollAttempt = tiktokTrackingState.pollAttempt + 1;
      if (nextPollAttempt > MAX_TIKTOK_POLL_ATTEMPTS) {
        await prisma.publishJob.update({
          where: { id: job.id },
          data: {
            status: 'FAILED',
            errorMessage: `TikTok publish timeout: exceeded ${MAX_TIKTOK_POLL_ATTEMPTS} status checks`,
          },
        });

        logEvent('publish-processor', 'job-failed-final', {
          jobId: job.id,
          attempt: nextAttempt,
          reason: 'tiktok-status-timeout',
        });

        return 'failed' as const;
      }

      await scheduleTikTokStatusPoll(job.id, tiktokTrackingState.publishId, nextPollAttempt);
      return 'retryScheduled' as const;
    }

    const publishResult = await publishToPlatform(publishInput, accessToken);

    if (publishResult.provider === 'TIKTOK') {
      if (!publishResult.remoteId) {
        throw new Error('TikTok publish init succeeded but missing publish_id');
      }

      await scheduleTikTokStatusPoll(job.id, publishResult.remoteId, 1);

      logEvent('publish-processor', 'job-tiktok-publish-init-accepted', {
        jobId: job.id,
        attempt: nextAttempt,
        publishId: publishResult.remoteId,
      });

      return 'retryScheduled' as const;
    }

    await markJobSuccess(job.id);

    logEvent('publish-processor', 'job-succeeded', {
      jobId: job.id,
      attempt: nextAttempt,
      platform: publishResult.provider,
      remoteId: publishResult.remoteId,
    });

    return 'succeeded' as const;
  } catch (error) {
    if (error instanceof PublishAuthError) {
      if (isPermanentOAuthScopeError(error.message)) {
        const reason =
          'Brak uprawnień OAuth do publikacji. Połącz konto ponownie i zaakceptuj wymagane zakresy.';

        await prisma.publishJob.update({
          where: { id: job.id },
          data: {
            status: 'FAILED',
            errorMessage: reason,
          },
        });

        logEvent('publish-processor', 'job-failed-final', {
          jobId: job.id,
          attempt: nextAttempt,
          reason: 'oauth-scope-not-authorized',
        });

        return 'failed' as const;
      }

      try {
        const refreshed = await refreshSocialAccessToken(job.socialAccount.id);

        if (tiktokTrackingState) {
          const status = await fetchTikTokPublishStatus(
            tiktokTrackingState.publishId,
            refreshed.accessToken,
          );

          if (status.finalState === 'SUCCESS') {
            await markJobSuccess(job.id);

            logEvent('publish-processor', 'job-succeeded-after-token-refresh', {
              jobId: job.id,
              attempt: nextAttempt,
              platform: 'TIKTOK',
              remoteId: tiktokTrackingState.publishId,
              rawStatus: status.rawStatus,
            });

            return 'succeeded' as const;
          }

          if (status.finalState === 'FAILED') {
            await prisma.publishJob.update({
              where: { id: job.id },
              data: {
                status: 'FAILED',
                errorMessage: `TikTok publish failed: ${status.reason || status.rawStatus || 'unknown reason'}`,
              },
            });

            logEvent('publish-processor', 'job-failed-final', {
              jobId: job.id,
              attempt: nextAttempt,
              reason: status.reason || status.rawStatus || 'tiktok-final-failed',
            });

            return 'failed' as const;
          }

          const nextPollAttempt = tiktokTrackingState.pollAttempt + 1;
          if (nextPollAttempt > MAX_TIKTOK_POLL_ATTEMPTS) {
            await prisma.publishJob.update({
              where: { id: job.id },
              data: {
                status: 'FAILED',
                errorMessage: `TikTok publish timeout: exceeded ${MAX_TIKTOK_POLL_ATTEMPTS} status checks`,
              },
            });

            logEvent('publish-processor', 'job-failed-final', {
              jobId: job.id,
              attempt: nextAttempt,
              reason: 'tiktok-status-timeout',
            });

            return 'failed' as const;
          }

          await scheduleTikTokStatusPoll(job.id, tiktokTrackingState.publishId, nextPollAttempt);
          return 'retryScheduled' as const;
        }

        const publishResult = await publishToPlatform(publishInput, refreshed.accessToken);

        if (publishResult.provider === 'TIKTOK') {
          if (!publishResult.remoteId) {
            throw new Error('TikTok publish init succeeded but missing publish_id');
          }

          await scheduleTikTokStatusPoll(job.id, publishResult.remoteId, 1);

          logEvent('publish-processor', 'job-succeeded-after-token-refresh', {
            jobId: job.id,
            attempt: nextAttempt,
            platform: 'TIKTOK',
            remoteId: publishResult.remoteId,
            phase: 'init-accepted',
          });

          return 'retryScheduled' as const;
        }

        await markJobSuccess(job.id);

        logEvent('publish-processor', 'job-succeeded-after-token-refresh', {
          jobId: job.id,
          attempt: nextAttempt,
          platform: publishResult.provider,
          remoteId: publishResult.remoteId,
        });

        return 'succeeded' as const;
      } catch (fallbackError) {
        const reason =
          fallbackError instanceof Error
            ? fallbackError.message
            : 'Token refresh fallback failed';

        logError('publish-processor', 'job-token-refresh-fallback-failed', fallbackError, {
          jobId: job.id,
          attempt: nextAttempt,
        });

        return failOrScheduleRetry(job.id, nextAttempt, reason);
      }
    }

    const reason = error instanceof Error ? error.message : 'Unknown publish error';
    logError('publish-processor', 'job-processing-error', error, {
      jobId: job.id,
      attempt: nextAttempt,
    });
    return failOrScheduleRetry(job.id, nextAttempt, reason);
  }
}

export async function processDuePublishJobs(batchSizeRaw: number) {
  const claimedJobIds = await claimDuePublishJobs(batchSizeRaw);

  const summary: PublishProcessorSummary = {
    claimed: claimedJobIds.length,
    succeeded: 0,
    failed: 0,
    retryScheduled: 0,
    skipped: 0,
  };

  for (const jobId of claimedJobIds) {
    const outcome = await processClaimedJob(jobId);

    if (outcome === 'succeeded') {
      summary.succeeded += 1;
      continue;
    }

    if (outcome === 'failed') {
      summary.failed += 1;
      continue;
    }

    if (outcome === 'retryScheduled') {
      summary.retryScheduled += 1;
      continue;
    }

    summary.skipped += 1;
  }

  return summary;
}

export async function processPublishJobImmediately(jobId: string) {
  const claimedCount = await prisma.publishJob.updateMany({
    where: {
      id: jobId,
      status: 'PENDING',
      scheduledFor: {
        lte: new Date(),
      },
    },
    data: {
      status: 'RUNNING',
      updatedAt: new Date(),
    },
  });

  if (claimedCount.count === 0) {
    logEvent('publish-processor', 'job-immediate-claim-skipped', {
      jobId,
      reason: 'not-pending-or-not-due',
    });
    return 'skipped' as const;
  }

  return processClaimedJob(jobId);
}
import { randomUUID } from 'crypto';
import { Platform, Prisma } from '@prisma/client';
import { prisma } from './prisma';
import { generatePlatformBundles } from './composer-drafts';
import type { ScheduleSlot } from './smart-autopilot/types';
import { collectContentWarnings } from './content-safety';
import {
  assertScheduleWindowAllowed,
  assertUsageAllowed,
  getSubscriptionSnapshot,
  incrementUsage,
} from './subscription';
import { processPublishJobImmediately } from './publish-processor';
import { cancelQStashMessage, scheduleQStashPublish } from './qstash';

// TASK-3.1.2: rdzeń logiki app/api/publish-jobs/drafts (POST) i
// app/api/publish-jobs/enqueue (POST), wydzielony żeby webhook Telegrama (upload materiału,
// przycisk "Publikuj") mógł wołać dokładnie tę samą logikę biznesową co panel web - jedna
// prawda, nie dwie kopie tego samego kodu.

const PUBLISH_JOB_INCLUDE = {
  video: true,
  socialAccount: true,
} as const;

type PublishJobWithRelations = Prisma.PublishJobGetPayload<{ include: typeof PUBLISH_JOB_INCLUDE }>;

export type CreateDraftGroupResult =
  | {
      ok: true;
      postGroupId: string;
      jobs: PublishJobWithRelations[];
      askDefaultExplicit: boolean;
      orchestrationWarning: string | null;
      // EPIC 4: the real schedule suggestion computed by orchestrateContent - informational only
      // here (DRAFT jobs still get scheduledFor=now below; actual scheduling still happens via
      // the existing enqueue/"📅 Zaplanuj" flow), so a caller can show WHY a time is suggested
      // instead of the loop's output going nowhere.
      schedule: ScheduleSlot[];
    }
  | { ok: false; error: string };

export async function createDraftGroupForVideo(
  userId: string,
  videoId: string,
  options: { contentType?: string; songTitle?: string; timezone?: string } = {},
): Promise<CreateDraftGroupResult> {
  const [video, socialAccounts, dbUser] = await Promise.all([
    prisma.video.findFirst({ where: { id: videoId, userId } }),
    prisma.socialAccount.findMany({
      where: { userId },
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
    }),
    prisma.user.findUnique({
      where: { id: userId },
      select: { defaultExplicitContent: true },
    }),
  ]);

  if (!video) {
    return { ok: false, error: 'videoId nie należy do zalogowanego użytkownika' };
  }

  if (socialAccounts.length === 0) {
    return { ok: false, error: 'Brak podłączonych kont social. Połącz przynajmniej jedno konto przed dodaniem posta.' };
  }

  const accountByPlatform = new Map<Platform, (typeof socialAccounts)[number]>();
  socialAccounts.forEach((account) => {
    if (!accountByPlatform.has(account.platform)) {
      accountByPlatform.set(account.platform, account);
    }
  });

  const connectedPlatforms = Array.from(accountByPlatform.keys()).filter(
    (platform) => !(video.mediaType === 'IMAGE' && platform === Platform.YOUTUBE),
  );

  if (connectedPlatforms.length === 0) {
    return { ok: false, error: 'Żadna podłączona platforma nie obsługuje tego typu materiału.' };
  }

  const postGroupId = randomUUID();

  const createdJobs = await prisma.$transaction(
    connectedPlatforms.map((platform) => {
      const account = accountByPlatform.get(platform)!;
      const isMetaVideo = video.mediaType === 'VIDEO' && (platform === Platform.FACEBOOK || platform === Platform.INSTAGRAM);

      return prisma.publishJob.create({
        data: {
          status: 'DRAFT',
          postGroupId,
          scheduledFor: new Date(),
          video: { connect: { id: video.id } },
          socialAccount: { connect: { id: account.id } },
          // Sticky defaults: inherit whatever the user last set on THIS social account (via the
          // web composer's PATCH .../drafts/:id), falling back to REELS on first use. Read here
          // (server-side, shared by web and Telegram) rather than only in the web composer's
          // client code, so Telegram - which has no settings UI of its own - gets the same
          // inherited value instead of a hardcoded default every time. Same lesson as BUG-003
          // (a client-only default never reached the Telegram channel).
          metaPostFormat: isMetaVideo ? (account.lastMetaPostFormat ?? 'REELS') : undefined,
          ...(platform === Platform.TIKTOK
            ? {
                tiktokPrivacyLevel: account.lastTiktokPrivacyLevel ?? undefined,
                tiktokAllowComment: account.lastTiktokAllowComment ?? undefined,
                tiktokAllowDuet: account.lastTiktokAllowDuet ?? undefined,
                tiktokAllowStitch: account.lastTiktokAllowStitch ?? undefined,
              }
            : {}),
        },
        include: PUBLISH_JOB_INCLUDE,
      });
    }),
  );

  const rawInputParts = [options.contentType?.trim(), options.songTitle?.trim()].filter(Boolean);

  const { bundlesByPlatform, orchestrationWarning, schedule } = await generatePlatformBundles(userId, {
    rawInput: rawInputParts.join(' — '),
    targetPlatforms: connectedPlatforms,
    timezone: options.timezone || 'Europe/Warsaw',
    idempotencyKey: postGroupId,
  });

  const updatedJobs = await Promise.all(
    createdJobs.map(async (job) => {
      const bundle = bundlesByPlatform.get(job.socialAccount.platform);
      const caption = bundle?.caption ?? '';
      const hashtags = bundle?.hashtags ?? [];

      return prisma.publishJob.update({
        where: { id: job.id },
        data: {
          caption,
          hashtags,
          title: bundle?.title ?? null,
          contentWarnings: collectContentWarnings(caption, job.socialAccount.platform),
        },
        include: PUBLISH_JOB_INCLUDE,
      });
    }),
  );

  return {
    ok: true,
    postGroupId,
    jobs: updatedJobs,
    askDefaultExplicit: dbUser?.defaultExplicitContent === null,
    orchestrationWarning: orchestrationWarning ?? null,
    schedule,
  };
}

type SocialPlatform = 'YOUTUBE' | 'TIKTOK' | 'INSTAGRAM' | 'FACEBOOK';

export function normalizePublishPlatform(value: string): SocialPlatform {
  const normalized = value.trim().toUpperCase();

  if (normalized === 'YOUTUBE' || normalized === 'TIKTOK' || normalized === 'INSTAGRAM' || normalized === 'FACEBOOK') {
    return normalized;
  }

  throw new Error('Nieobsługiwana platforma');
}

export type EnqueueDraftGroupParams = {
  postGroupId: string;
  scheduledDate?: string;
  publishNow?: boolean;
  tiktokPostingConsent?: boolean;
  targetPlatforms: string[];
};

export type EnqueueDraftGroupResult =
  | {
      ok: true;
      publishJobs: PublishJobWithRelations[];
      targetsCount: number;
      immediateOutcome: 'succeeded' | 'failed' | 'retryScheduled' | 'skipped' | null;
    }
  | { ok: false; error: string };

export async function enqueueDraftGroup(userId: string, params: EnqueueDraftGroupParams): Promise<EnqueueDraftGroupResult> {
  const publishNow = params.publishNow === true;

  let scheduledDate = new Date();
  if (!publishNow) {
    if (!params.scheduledDate) {
      return { ok: false, error: 'scheduledDate jest wymagany' };
    }

    scheduledDate = new Date(params.scheduledDate);
    if (Number.isNaN(scheduledDate.getTime())) {
      return { ok: false, error: 'scheduledDate is invalid' };
    }

    await assertScheduleWindowAllowed(userId, scheduledDate);
  }

  if (!Array.isArray(params.targetPlatforms) || params.targetPlatforms.length === 0) {
    return { ok: false, error: 'wymagane co najmniej 1 platforma' };
  }

  let targetPlatforms: SocialPlatform[];
  try {
    targetPlatforms = Array.from(new Set(params.targetPlatforms.map((platform) => normalizePublishPlatform(platform))));
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Nieobsługiwana platforma' };
  }

  if (targetPlatforms.includes('TIKTOK') && params.tiktokPostingConsent !== true) {
    return { ok: false, error: 'Dla publikacji TikTok wymagana jest akceptacja warunków publikacji.' };
  }

  const snapshot = await getSubscriptionSnapshot(userId);
  const userPlan = snapshot.subscription.plan;

  if (userPlan === 'FREE' && targetPlatforms.length > 1) {
    return { ok: false, error: 'Plan Free pozwala publikować jednocześnie maksymalnie na 1 kanale social.' };
  }

  const draftJobs = await prisma.publishJob.findMany({
    where: {
      postGroupId: params.postGroupId,
      status: 'DRAFT',
      video: { userId },
    },
    include: PUBLISH_JOB_INCLUDE,
  });

  if (draftJobs.length === 0) {
    return { ok: false, error: 'Nie znaleziono niedokończonego posta dla podanego postGroupId.' };
  }

  const draftJobByPlatform = new Map(draftJobs.map((job) => [job.socialAccount.platform, job]));

  const missingPlatforms = targetPlatforms.filter((platform) => !draftJobByPlatform.has(platform));
  if (missingPlatforms.length > 0) {
    return { ok: false, error: `Brak przygotowanej treści dla platform: ${missingPlatforms.join(', ')}` };
  }

  if (targetPlatforms.includes('TIKTOK')) {
    const tiktokJob = draftJobByPlatform.get('TIKTOK')!;

    if (!tiktokJob.tiktokPrivacyLevel) {
      return { ok: false, error: 'Dla TikTok wybierz poziom prywatności publikacji w kroku przeglądu.' };
    }
  }

  const bothFormatCount = targetPlatforms.filter((platform) => draftJobByPlatform.get(platform)!.metaPostFormat === 'BOTH').length;

  for (let index = 0; index < targetPlatforms.length + bothFormatCount; index += 1) {
    await assertUsageAllowed(userId, 'publish_jobs');
  }

  const platformsToDelete = draftJobs
    .filter((job) => !targetPlatforms.includes(job.socialAccount.platform))
    .map((job) => job.id);

  const updateOperations = targetPlatforms.map((platform) => {
    const job = draftJobByPlatform.get(platform)!;

    return prisma.publishJob.update({
      where: { id: job.id },
      data: {
        status: 'PENDING',
        scheduledFor: scheduledDate,
        ...(platform === 'TIKTOK' ? { tiktokConsentAt: new Date() } : {}),
        // Facebook "Oba" (BOTH) isn't a real Graph API value - it means "publish this job as a
        // Reel, AND spin off an independent sibling job for the plain-post version" (below). The
        // original job settles into a normal, unambiguous REELS job once split.
        ...(job.metaPostFormat === 'BOTH' ? { metaPostFormat: 'REELS' } : {}),
      },
      include: PUBLISH_JOB_INCLUDE,
    });
  });

  // Facebook Reels and a plain video post are genuinely separate publications (unlike Instagram,
  // where a Reel with share_to_feed already appears in both places) - "Oba" is realized as a
  // second, independent PublishJob sharing the same content, created fresh here rather than as
  // a second DRAFT the user would have had to manage separately before this point.
  const bothFormatJobs = targetPlatforms
    .map((platform) => draftJobByPlatform.get(platform)!)
    .filter((job) => job.socialAccount.platform === 'FACEBOOK' && job.metaPostFormat === 'BOTH');

  const siblingCreateOperations = bothFormatJobs.map((job) =>
    prisma.publishJob.create({
      data: {
        status: 'PENDING',
        postGroupId: job.postGroupId,
        caption: job.caption,
        hashtags: job.hashtags,
        title: job.title,
        mentions: job.mentions,
        isExplicit: job.isExplicit,
        contentWarnings: job.contentWarnings,
        metaPostFormat: 'FEED',
        scheduledFor: scheduledDate,
        videoId: job.videoId,
        socialAccountId: job.socialAccountId,
      },
      include: PUBLISH_JOB_INCLUDE,
    }),
  );

  const transactionResults = await prisma.$transaction([
    ...updateOperations,
    ...siblingCreateOperations,
    prisma.publishJob.deleteMany({ where: { id: { in: platformsToDelete } } }),
  ]);

  const updatedJobs = transactionResults.slice(0, updateOperations.length) as Array<Awaited<(typeof updateOperations)[number]>>;
  const siblingJobs = transactionResults.slice(
    updateOperations.length,
    updateOperations.length + siblingCreateOperations.length,
  ) as Array<Awaited<(typeof siblingCreateOperations)[number]>>;
  const allEnqueuedJobs = [...updatedJobs, ...siblingJobs];

  await incrementUsage(userId, 'publish_jobs', allEnqueuedJobs.length);

  // Precise trigger for genuinely-scheduled jobs (publishNow jobs run inline below instead, no
  // need to schedule anything). Best-effort: unconfigured or failed QStash calls just leave
  // qstashMessageId null - the job stays PENDING and the daily Vercel cron fallback still
  // catches it eventually, exactly like before this feature existed.
  if (!publishNow) {
    await Promise.all(
      allEnqueuedJobs.map(async (publishJob) => {
        const messageId = await scheduleQStashPublish(publishJob.id, scheduledDate);
        if (messageId) {
          await prisma.publishJob.update({ where: { id: publishJob.id }, data: { qstashMessageId: messageId } }).catch(() => {});
        }
      }),
    );
  }

  const immediateOutcomes = publishNow
    ? await Promise.all(
        allEnqueuedJobs.map(async (publishJob) => ({
          jobId: publishJob.id,
          outcome: await processPublishJobImmediately(publishJob.id),
        })),
      )
    : [];

  const responseJobs = publishNow
    ? await prisma.publishJob.findMany({
        where: { id: { in: allEnqueuedJobs.map((job) => job.id) } },
        include: PUBLISH_JOB_INCLUDE,
        orderBy: { createdAt: 'desc' },
      })
    : allEnqueuedJobs;

  const immediateOutcome =
    immediateOutcomes.length === 0
      ? null
      : immediateOutcomes.some((item) => item.outcome === 'failed')
        ? 'failed'
        : immediateOutcomes.some((item) => item.outcome === 'retryScheduled')
          ? 'retryScheduled'
          : immediateOutcomes.some((item) => item.outcome === 'skipped')
            ? 'skipped'
            : 'succeeded';

  return {
    ok: true,
    publishJobs: responseJobs,
    targetsCount: allEnqueuedJobs.length,
    immediateOutcome,
  };
}

// TASK-3.2.1: rdzeń app/api/publish-jobs/[id]/trigger (POST) - publikacja natychmiastowa,
// poza standardowym oknem harmonogramu. Wołane przez panel web i przez /approve <id> na
// Telegramie (lib/server/publish-jobs.ts, jedna prawda, ten sam wzorzec co TASK-3.1.2).
export type TriggerPublishJobResult =
  | { ok: true; publishJob: PublishJobWithRelations; immediateOutcome: string }
  | { ok: false; error: string };

export async function triggerPublishJob(userId: string, jobId: string): Promise<TriggerPublishJobResult> {
  const job = await prisma.publishJob.findFirst({
    where: { id: jobId, video: { userId } },
    select: { id: true, status: true },
  });

  if (!job) {
    return { ok: false, error: 'Nie znaleziono zadania publikacji dla użytkownika' };
  }

  if (job.status === 'SUCCESS') {
    return { ok: false, error: 'Nie można wywołać trigger dla zakończonego sukcesem zadania' };
  }

  await prisma.publishJob.update({
    where: { id: job.id },
    data: { status: 'PENDING', scheduledFor: new Date() },
  });

  const immediateOutcome = await processPublishJobImmediately(job.id);

  const refreshed = await prisma.publishJob.findUniqueOrThrow({
    where: { id: job.id },
    include: PUBLISH_JOB_INCLUDE,
  });

  return { ok: true, publishJob: refreshed, immediateOutcome };
}

// TASK-3.2.1: rdzeń app/api/publish-jobs/[id]/cancel (POST). Wołane przez panel web i przez
// /reject <id> na Telegramie.
export type CancelPublishJobResult =
  | { ok: true; publishJob: PublishJobWithRelations }
  | { ok: false; error: string };

export async function cancelPublishJob(userId: string, jobId: string): Promise<CancelPublishJobResult> {
  const job = await prisma.publishJob.findFirst({
    where: { id: jobId, video: { userId } },
    select: { id: true, status: true, qstashMessageId: true },
  });

  if (!job) {
    return { ok: false, error: 'Nie znaleziono zadania publikacji dla użytkownika' };
  }

  if (job.status === 'SUCCESS' || job.status === 'FAILED' || job.status === 'CANCELED') {
    return { ok: false, error: 'Tego zadania nie można anulować w aktualnym statusie' };
  }

  const updated = await prisma.publishJob.update({
    where: { id: job.id },
    data: { status: 'CANCELED', errorMessage: 'Anulowane ręcznie przez użytkownika.' },
    include: PUBLISH_JOB_INCLUDE,
  });

  // Best-effort: if QStash still fires after this, processPublishJobImmediately's own
  // status/scheduledFor guard just no-ops on a CANCELED job - this is cleanup, not a safety net.
  if (job.qstashMessageId) {
    await cancelQStashMessage(job.qstashMessageId);
  }

  return { ok: true, publishJob: updated };
}

// TASK-3.2.1: rdzeń app/api/publish-jobs/[id]/retry (POST) i /retry <id> na Telegramie - ten
// sam efekt (FAILED/CANCELED -> PENDING, czyszczenie errorMessage), plus natychmiastowa próba
// publikacji (jak triggerPublishJob) zamiast czekania na najbliższy przebieg crona/QStash, bo
// użytkownik w tym momencie aktywnie czeka na wynik w czacie.
export type RetryPublishJobResult =
  | {
      ok: true;
      publishJob: PublishJobWithRelations;
      immediateOutcome: Awaited<ReturnType<typeof processPublishJobImmediately>>;
    }
  | { ok: false; error: string };

export async function retryPublishJob(userId: string, jobId: string): Promise<RetryPublishJobResult> {
  const job = await prisma.publishJob.findFirst({
    where: { id: jobId, video: { userId } },
    select: { id: true, status: true },
  });

  if (!job) {
    return { ok: false, error: 'Nie znaleziono zadania publikacji dla użytkownika' };
  }

  if (job.status !== 'FAILED' && job.status !== 'CANCELED') {
    return { ok: false, error: 'Retry jest dostępny tylko dla statusu FAILED lub CANCELED' };
  }

  await prisma.publishJob.update({
    where: { id: job.id },
    data: { status: 'PENDING', scheduledFor: new Date(), errorMessage: null },
  });

  const immediateOutcome = await processPublishJobImmediately(job.id);

  const refreshed = await prisma.publishJob.findUniqueOrThrow({
    where: { id: job.id },
    include: PUBLISH_JOB_INCLUDE,
  });

  return { ok: true, publishJob: refreshed, immediateOutcome };
}

// TASK-3.2.1: rdzeń komendy /logs - ostatnie zakończone zadania (sukces/błąd/anulowane) danego
// użytkownika, wyłącznie odczyt. Celowo pomija PENDING/DRAFT/RUNNING - te pokazuje już /status.
export type RecentActivityEntry = {
  id: string;
  platform: string;
  status: string;
  updatedAt: Date;
  remotePostUrl: string | null;
  errorMessage: string | null;
};

export async function getRecentActivityForUser(userId: string, limit = 5): Promise<RecentActivityEntry[]> {
  const jobs = await prisma.publishJob.findMany({
    where: { video: { userId }, status: { in: ['SUCCESS', 'FAILED', 'CANCELED'] } },
    orderBy: { updatedAt: 'desc' },
    take: limit,
    include: { socialAccount: { select: { platform: true } } },
  });

  return jobs.map((job) => ({
    id: job.id,
    platform: job.socialAccount.platform,
    status: job.status,
    updatedAt: job.updatedAt,
    remotePostUrl: job.remotePostUrl,
    errorMessage: job.errorMessage,
  }));
}

// /pomysl (content ideas): grounded in the user's own recently PUBLISHED posts, not drafts -
// the point is "what have I actually been posting", not "what did I almost post". Deduped by
// postGroupId (one post can have several PublishJob rows, one per platform) so the same post
// doesn't get counted multiple times toward "recent style".
export type RecentContentSample = { caption: string; hashtags: string[]; title: string | null };

export async function getRecentContentForIdeas(userId: string, limit = 12): Promise<RecentContentSample[]> {
  const jobs = await prisma.publishJob.findMany({
    where: { status: 'SUCCESS', video: { userId } },
    orderBy: { publishedAt: 'desc' },
    take: limit * 3, // over-fetch before dedup by postGroupId, cheap enough at this scale
    select: { postGroupId: true, caption: true, hashtags: true, title: true },
  });

  const seenGroups = new Set<string>();
  const samples: RecentContentSample[] = [];

  for (const job of jobs) {
    if (seenGroups.has(job.postGroupId)) {
      continue;
    }
    seenGroups.add(job.postGroupId);
    samples.push({ caption: job.caption, hashtags: job.hashtags, title: job.title });
    if (samples.length >= limit) {
      break;
    }
  }

  return samples;
}

export type TelegramStatusSnapshot = {
  publishingPaused: boolean;
  pendingCount: number;
  nextScheduledFor: Date | null;
  draftCount: number;
  recentSuccess: number;
  recentFailed: Array<{ id: string; platform: string; errorMessage: string | null }>;
};

// TASK-3.2.1: rdzeń komendy /status - wyłącznie odczyt, zero mutacji.
export async function getTelegramStatusSnapshot(userId: string): Promise<TelegramStatusSnapshot> {
  const [user, pendingJobs, draftCount, recentSuccess, recentFailed] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { publishingPaused: true } }),
    prisma.publishJob.findMany({
      where: { status: 'PENDING', video: { userId } },
      orderBy: { scheduledFor: 'asc' },
      select: { scheduledFor: true },
    }),
    prisma.publishJob.count({ where: { status: 'DRAFT', video: { userId } } }),
    prisma.publishJob.count({
      where: { status: 'SUCCESS', video: { userId }, publishedAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
    }),
    prisma.publishJob.findMany({
      where: { status: 'FAILED', video: { userId } },
      orderBy: { updatedAt: 'desc' },
      take: 5,
      include: { socialAccount: { select: { platform: true } } },
    }),
  ]);

  return {
    publishingPaused: user.publishingPaused,
    pendingCount: pendingJobs.length,
    nextScheduledFor: pendingJobs[0]?.scheduledFor ?? null,
    draftCount,
    recentSuccess,
    recentFailed: recentFailed.map((job) => ({
      id: job.id,
      platform: job.socialAccount.platform,
      errorMessage: job.errorMessage,
    })),
  };
}

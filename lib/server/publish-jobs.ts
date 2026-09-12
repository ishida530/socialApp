import { randomUUID } from 'crypto';
import { Platform, Prisma } from '@prisma/client';
import { prisma } from './prisma';
import { generatePlatformBundles } from './composer-drafts';
import { collectContentWarnings } from './content-safety';
import {
  assertScheduleWindowAllowed,
  assertUsageAllowed,
  getSubscriptionSnapshot,
  incrementUsage,
} from './subscription';
import { processPublishJobImmediately } from './publish-processor';

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
    connectedPlatforms.map((platform) =>
      prisma.publishJob.create({
        data: {
          status: 'DRAFT',
          postGroupId,
          scheduledFor: new Date(),
          video: { connect: { id: video.id } },
          socialAccount: { connect: { id: accountByPlatform.get(platform)!.id } },
        },
        include: PUBLISH_JOB_INCLUDE,
      }),
    ),
  );

  const rawInputParts = [options.contentType?.trim(), options.songTitle?.trim()].filter(Boolean);

  const { bundlesByPlatform, orchestrationWarning } = await generatePlatformBundles(userId, {
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

  for (let index = 0; index < targetPlatforms.length; index += 1) {
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
      },
      include: PUBLISH_JOB_INCLUDE,
    });
  });

  const transactionResults = await prisma.$transaction([
    ...updateOperations,
    prisma.publishJob.deleteMany({ where: { id: { in: platformsToDelete } } }),
  ]);

  const updatedJobs = transactionResults.slice(0, updateOperations.length) as Array<Awaited<(typeof updateOperations)[number]>>;

  await incrementUsage(userId, 'publish_jobs', updatedJobs.length);

  const immediateOutcomes = publishNow
    ? await Promise.all(
        updatedJobs.map(async (publishJob) => ({
          jobId: publishJob.id,
          outcome: await processPublishJobImmediately(publishJob.id),
        })),
      )
    : [];

  const responseJobs = publishNow
    ? await prisma.publishJob.findMany({
        where: { id: { in: updatedJobs.map((job) => job.id) } },
        include: PUBLISH_JOB_INCLUDE,
        orderBy: { createdAt: 'desc' },
      })
    : updatedJobs;

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
    targetsCount: targetPlatforms.length,
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
    select: { id: true, status: true },
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

  return { ok: true, publishJob: updated };
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

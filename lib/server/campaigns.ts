// Campaigns (2026-09-14): a named push spanning several posts over days/weeks (e.g. "Premiera
// singla"), so results can be reported collectively instead of post-by-post. PO/Architekt/UX
// decision (user explicitly deferred to judgment - "skonsultuj z specjalistami"): "active
// campaign" model. Starting one auto-attaches every subsequent post with zero extra step per
// upload - the alternative (a tagging prompt on every upload) adds friction to exactly the flow
// this app has spent the whole session trying to keep frictionless. Starting a new campaign
// auto-ends whichever one was already active, so there's never more than one active at a time
// and never an ambiguous "which campaign does this belong to" state.
import { prisma } from './prisma';

export type StartCampaignResult = { campaign: { id: string; name: string }; endedPrevious: { id: string; name: string } | null };

export async function startCampaign(userId: string, name: string): Promise<StartCampaignResult> {
  const trimmedName = name.trim();
  const previous = await endActiveCampaign(userId);

  const campaign = await prisma.campaign.create({ data: { userId, name: trimmedName } });
  await prisma.user.update({ where: { id: userId }, data: { activeCampaignId: campaign.id } });

  return {
    campaign: { id: campaign.id, name: campaign.name },
    endedPrevious: previous ? { id: previous.id, name: previous.name } : null,
  };
}

export async function endActiveCampaign(userId: string): Promise<{ id: string; name: string } | null> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { activeCampaignId: true } });
  if (!user?.activeCampaignId) {
    return null;
  }

  const campaign = await prisma.campaign.update({
    where: { id: user.activeCampaignId },
    data: { endedAt: new Date() },
  });
  await prisma.user.update({ where: { id: userId }, data: { activeCampaignId: null } });

  return { id: campaign.id, name: campaign.name };
}

export async function getActiveCampaign(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { activeCampaign: true },
  });
  return user?.activeCampaign ?? null;
}

export async function listRecentCampaigns(userId: string, limit = 5) {
  return prisma.campaign.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: limit });
}

// Called from createDraftGroupForVideo (publish-jobs.ts) right after a batch of PublishJob rows
// is created for a new upload - the actual "zero extra step" wiring. No-op (and cheap - one
// lookup) when there's no active campaign, which is the common case.
export async function attachActiveCampaignToJobs(userId: string, jobIds: string[]): Promise<void> {
  if (jobIds.length === 0) {
    return;
  }

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { activeCampaignId: true } });
  if (!user?.activeCampaignId) {
    return;
  }

  await prisma.publishJob.updateMany({
    where: { id: { in: jobIds } },
    data: { campaignId: user.activeCampaignId },
  });
}

export type CampaignReport = {
  id: string;
  name: string;
  startedAt: Date;
  endedAt: Date | null;
  postsCount: number;
  platforms: string[];
  totalViews: number;
  totalLikes: number;
  totalComments: number;
  totalShares: number;
  engagementRate: number | null;
  newFans: number;
  salesCents: number;
};

export type GetCampaignReportResult = { ok: true; report: CampaignReport } | { ok: false; error: string };

// Finds a campaign by exact name match (case-insensitive) OR by ID - a Telegram user will
// naturally type the name back ("/campaign-report Premiera singla"), not remember a cuid.
export async function getCampaignReport(userId: string, nameOrId: string): Promise<GetCampaignReportResult> {
  const query = nameOrId.trim();
  const campaign = await prisma.campaign.findFirst({
    where: {
      userId,
      OR: [{ id: query }, { name: { equals: query, mode: 'insensitive' } }],
    },
    orderBy: { createdAt: 'desc' },
  });

  if (!campaign) {
    return { ok: false, error: `Nie znaleziono kampanii "${nameOrId}". Sprawdź /campaigns.` };
  }

  const jobs = await prisma.publishJob.findMany({
    where: { campaignId: campaign.id, status: 'SUCCESS' },
    select: { id: true, socialAccount: { select: { platform: true } } },
  });

  const windowEnd = campaign.endedAt ?? new Date();

  const [metrics, newFans, sales] = await Promise.all([
    prisma.postMetric.findMany({
      where: { publishJobId: { in: jobs.map((job) => job.id) } },
      select: { views: true, likes: true, comments: true, shares: true },
    }),
    prisma.fan.count({ where: { userId, createdAt: { gte: campaign.startedAt, lte: windowEnd } } }),
    prisma.sale.aggregate({
      where: { userId, createdAt: { gte: campaign.startedAt, lte: windowEnd } },
      _sum: { amountCents: true },
    }),
  ]);

  const totalViews = metrics.reduce((sum, metric) => sum + (metric.views ?? 0), 0);
  const totalLikes = metrics.reduce((sum, metric) => sum + (metric.likes ?? 0), 0);
  const totalComments = metrics.reduce((sum, metric) => sum + (metric.comments ?? 0), 0);
  const totalShares = metrics.reduce((sum, metric) => sum + (metric.shares ?? 0), 0);

  return {
    ok: true,
    report: {
      id: campaign.id,
      name: campaign.name,
      startedAt: campaign.startedAt,
      endedAt: campaign.endedAt,
      postsCount: jobs.length,
      platforms: Array.from(new Set(jobs.map((job) => job.socialAccount.platform))),
      totalViews,
      totalLikes,
      totalComments,
      totalShares,
      engagementRate: totalViews > 0 ? (totalLikes + totalComments + totalShares) / totalViews : null,
      newFans,
      salesCents: sales._sum.amountCents ?? 0,
    },
  };
}

const STALE_CAMPAIGN_DAYS = 14;
const CAMPAIGN_REMINDER_COOLDOWN_DAYS = 7;

// TASK: "forgot to end it" is the main risk of the active-campaign model (posts unrelated to the
// push silently keep attaching to a stale campaign, muddying the eventual report) - a rare,
// cooldown-gated reminder instead of a hard timeout, so a genuinely long campaign is never
// force-ended without the user's say.
export async function findStaleActiveCampaigns(): Promise<Array<{ userId: string; telegramChatId: string; campaignName: string }>> {
  const staleCutoff = new Date(Date.now() - STALE_CAMPAIGN_DAYS * 24 * 60 * 60 * 1000);
  const reminderCutoff = new Date(Date.now() - CAMPAIGN_REMINDER_COOLDOWN_DAYS * 24 * 60 * 60 * 1000);

  const users = await prisma.user.findMany({
    where: {
      telegramChatId: { not: null },
      activeCampaignId: { not: null },
      activeCampaign: { startedAt: { lte: staleCutoff } },
      OR: [{ lastCampaignReminderSentAt: null }, { lastCampaignReminderSentAt: { lte: reminderCutoff } }],
    },
    select: { id: true, telegramChatId: true, activeCampaign: { select: { name: true } } },
  });

  return users
    .filter((user): user is typeof user & { telegramChatId: string } => Boolean(user.telegramChatId && user.activeCampaign))
    .map((user) => ({ userId: user.id, telegramChatId: user.telegramChatId, campaignName: user.activeCampaign!.name }));
}

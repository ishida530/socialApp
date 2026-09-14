import { afterEach, describe, expect, it } from 'vitest';
import {
  attachActiveCampaignToJobs,
  endActiveCampaign,
  findStaleActiveCampaigns,
  getActiveCampaign,
  getCampaignReport,
  listRecentCampaigns,
  startCampaign,
} from '@/lib/server/campaigns';
import { prisma } from '@/lib/server/prisma';
import { createTestUser, deleteTestUser, createSocialAccount, createVideo } from '../helpers/fixtures';

// Campaigns (2026-09-14): "active campaign" model - starting one auto-attaches every subsequent
// post with zero extra step, starting a new one auto-ends whichever was active. These tests
// assert the state machine (never two active at once), the zero-step attach wiring, and that the
// report aggregates real PostMetric/Fan/Sale data honestly (nulls/zeros, never fabricated).

let cleanupUserId: string | null = null;

afterEach(async () => {
  if (cleanupUserId) {
    await deleteTestUser(cleanupUserId);
    cleanupUserId = null;
  }
});

describe('startCampaign / endActiveCampaign / getActiveCampaign', () => {
  it('starting a campaign makes it active with no previous to end', async () => {
    const { user } = await createTestUser();
    cleanupUserId = user.id;

    const result = await startCampaign(user.id, 'Premiera singla');

    expect(result.campaign.name).toBe('Premiera singla');
    expect(result.endedPrevious).toBeNull();
    expect((await getActiveCampaign(user.id))?.name).toBe('Premiera singla');
  });

  it('starting a second campaign auto-ends the first - never two active at once', async () => {
    const { user } = await createTestUser();
    cleanupUserId = user.id;

    await startCampaign(user.id, 'Kampania A');
    const result = await startCampaign(user.id, 'Kampania B');

    expect(result.endedPrevious?.name).toBe('Kampania A');
    expect((await getActiveCampaign(user.id))?.name).toBe('Kampania B');

    const campaignA = await prisma.campaign.findFirst({ where: { userId: user.id, name: 'Kampania A' } });
    expect(campaignA?.endedAt).not.toBeNull();
  });

  it('endActiveCampaign clears the active campaign and returns null when none is active', async () => {
    const { user } = await createTestUser();
    cleanupUserId = user.id;

    expect(await endActiveCampaign(user.id)).toBeNull();

    await startCampaign(user.id, 'Kampania');
    const ended = await endActiveCampaign(user.id);

    expect(ended?.name).toBe('Kampania');
    expect(await getActiveCampaign(user.id)).toBeNull();
  });
});

async function makeSuccessJob(userId: string, campaignId?: string, metric?: { views: number; likes: number; comments: number; shares: number }) {
  const account = await createSocialAccount(userId, 'TIKTOK');
  const video = await createVideo(userId);
  const job = await prisma.publishJob.create({
    data: {
      status: 'SUCCESS',
      postGroupId: `group-${video.id}`,
      caption: 'x',
      hashtags: [],
      scheduledFor: new Date(),
      publishedAt: new Date(),
      remotePostId: `remote-${video.id}`,
      videoId: video.id,
      socialAccountId: account.id,
      campaignId,
    },
  });
  if (metric) {
    await prisma.postMetric.create({ data: { publishJobId: job.id, ...metric } });
  }
  return job;
}

describe('attachActiveCampaignToJobs', () => {
  it('attaches the active campaign to given job IDs', async () => {
    const { user } = await createTestUser();
    cleanupUserId = user.id;

    const { campaign } = await startCampaign(user.id, 'Premiera singla');
    const job = await makeSuccessJob(user.id);

    await attachActiveCampaignToJobs(user.id, [job.id]);

    const refreshed = await prisma.publishJob.findUnique({ where: { id: job.id } });
    expect(refreshed?.campaignId).toBe(campaign.id);
  });

  it('is a no-op when there is no active campaign', async () => {
    const { user } = await createTestUser();
    cleanupUserId = user.id;
    const job = await makeSuccessJob(user.id);

    await attachActiveCampaignToJobs(user.id, [job.id]);

    const refreshed = await prisma.publishJob.findUnique({ where: { id: job.id } });
    expect(refreshed?.campaignId).toBeNull();
  });
});

describe('getCampaignReport', () => {
  it('aggregates posts/metrics/fans/sales for the campaign window, findable by name', async () => {
    const { user } = await createTestUser();
    cleanupUserId = user.id;

    const { campaign } = await startCampaign(user.id, 'Premiera singla');
    await makeSuccessJob(user.id, campaign.id, { views: 1000, likes: 100, comments: 20, shares: 10 });
    await makeSuccessJob(user.id, campaign.id, { views: 500, likes: 50, comments: 10, shares: 5 });
    await prisma.fan.create({ data: { userId: user.id, email: 'fan@example.com' } });
    await prisma.sale.create({ data: { userId: user.id, product: 'Merch', amountCents: 5000 } });

    const result = await getCampaignReport(user.id, 'premiera singla'); // case-insensitive

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.report.postsCount).toBe(2);
    expect(result.report.platforms).toEqual(['TIKTOK']);
    expect(result.report.totalViews).toBe(1500);
    expect(result.report.totalLikes).toBe(150);
    expect(result.report.engagementRate).toBeCloseTo((150 + 30 + 15) / 1500, 5);
    expect(result.report.newFans).toBe(1);
    expect(result.report.salesCents).toBe(5000);
  });

  it('returns an honest error for a campaign that does not exist', async () => {
    const { user } = await createTestUser();
    cleanupUserId = user.id;

    const result = await getCampaignReport(user.id, 'Nie ma takiej');
    expect(result.ok).toBe(false);
  });

  it('does not leak another user posts/fans/sales into the report', async () => {
    const { user: owner } = await createTestUser();
    const { user: other } = await createTestUser();
    cleanupUserId = owner.id;

    try {
      const { campaign } = await startCampaign(owner.id, 'Kampania właściciela');
      await makeSuccessJob(owner.id, campaign.id, { views: 100, likes: 10, comments: 0, shares: 0 });
      await prisma.fan.create({ data: { userId: other.id, email: 'obcy@example.com' } });
      await prisma.sale.create({ data: { userId: other.id, product: 'Cudza sprzedaż', amountCents: 99999 } });

      const result = await getCampaignReport(owner.id, 'Kampania właściciela');
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.report.newFans).toBe(0);
      expect(result.report.salesCents).toBe(0);
    } finally {
      await deleteTestUser(other.id);
    }
  });

  it('a campaign with posts but no PostMetric rows reports zero, not a crash', async () => {
    const { user } = await createTestUser();
    cleanupUserId = user.id;

    const { campaign } = await startCampaign(user.id, 'Bez metryk');
    await makeSuccessJob(user.id, campaign.id);

    const result = await getCampaignReport(user.id, 'Bez metryk');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.report.totalViews).toBe(0);
    expect(result.report.engagementRate).toBeNull();
  });
});

describe('listRecentCampaigns', () => {
  it('lists campaigns newest first', async () => {
    const { user } = await createTestUser();
    cleanupUserId = user.id;

    await startCampaign(user.id, 'Pierwsza');
    await startCampaign(user.id, 'Druga');

    const campaigns = await listRecentCampaigns(user.id);
    expect(campaigns.map((campaign) => campaign.name)).toEqual(['Druga', 'Pierwsza']);
  });
});

describe('findStaleActiveCampaigns', () => {
  it('finds a campaign active for a long time with a linked Telegram chat', async () => {
    const { user } = await createTestUser();
    cleanupUserId = user.id;
    await prisma.user.update({ where: { id: user.id }, data: { telegramChatId: `chat-${user.id}` } });

    const { campaign } = await startCampaign(user.id, 'Stara kampania');
    await prisma.campaign.update({ where: { id: campaign.id }, data: { startedAt: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000) } });

    const stale = await findStaleActiveCampaigns();
    expect(stale).toEqual([{ userId: user.id, telegramChatId: `chat-${user.id}`, campaignName: 'Stara kampania' }]);
  });

  it('does not flag a recently-started active campaign', async () => {
    const { user } = await createTestUser();
    cleanupUserId = user.id;
    await prisma.user.update({ where: { id: user.id }, data: { telegramChatId: `chat-${user.id}` } });

    await startCampaign(user.id, 'Nowa kampania');

    const stale = await findStaleActiveCampaigns();
    expect(stale).toEqual([]);
  });

  it('does not flag a user with no active campaign', async () => {
    const { user } = await createTestUser();
    cleanupUserId = user.id;
    await prisma.user.update({ where: { id: user.id }, data: { telegramChatId: `chat-${user.id}` } });

    const stale = await findStaleActiveCampaigns();
    expect(stale).toEqual([]);
  });
});

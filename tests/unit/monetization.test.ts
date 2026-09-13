import { afterEach, describe, expect, it } from 'vitest';
import {
  addFan,
  checkSponsorshipGrowth,
  getRevenueSummary,
  isValidEmail,
  parseAmountToCents,
  recordSale,
} from '@/lib/server/monetization';
import { prisma } from '@/lib/server/prisma';
import { createTestUser, deleteTestUser, createSocialAccount, createVideo } from '../helpers/fixtures';

// EPIC 5 (Monetyzacja) - Agent fanów + rdzeń Agenta sprzedaży w zakresie tej sesji: rejestracja
// RĘCZNA (twórca sam wpisuje przez Telegram), nie automatyczny checkout - patrz uzasadnienie w
// schema.prisma przy modelu Fan.

let cleanupUserId: string | null = null;

afterEach(async () => {
  if (cleanupUserId) {
    await deleteTestUser(cleanupUserId);
    cleanupUserId = null;
  }
});

describe('isValidEmail', () => {
  it('accepts a well-formed email and rejects garbage', () => {
    expect(isValidEmail('jan@example.com')).toBe(true);
    expect(isValidEmail('not-an-email')).toBe(false);
    expect(isValidEmail('')).toBe(false);
  });
});

describe('parseAmountToCents', () => {
  it('parses a plain integer, a decimal point, and the Polish decimal comma', () => {
    expect(parseAmountToCents('80')).toBe(8000);
    expect(parseAmountToCents('80.50')).toBe(8050);
    expect(parseAmountToCents('80,50')).toBe(8050);
  });

  it('rejects zero, negative, and non-numeric input', () => {
    expect(parseAmountToCents('0')).toBeNull();
    expect(parseAmountToCents('-5')).toBeNull();
    expect(parseAmountToCents('abc')).toBeNull();
  });
});

describe('addFan', () => {
  it('creates a new fan, normalizing the email to lowercase', async () => {
    const { user } = await createTestUser();
    cleanupUserId = user.id;

    const fan = await addFan(user.id, 'Jan@Example.com', 'Jan Kowalski');
    expect(fan.email).toBe('jan@example.com');
    expect(fan.name).toBe('Jan Kowalski');
    expect(fan.source).toBe('manual');
  });

  it('is idempotent per (userId, email) - re-adding updates the name instead of duplicating', async () => {
    const { user } = await createTestUser();
    cleanupUserId = user.id;

    await addFan(user.id, 'jan@example.com');
    await addFan(user.id, 'jan@example.com', 'Jan Kowalski');

    const fans = await prisma.fan.findMany({ where: { userId: user.id, email: 'jan@example.com' } });
    expect(fans).toHaveLength(1);
    expect(fans[0].name).toBe('Jan Kowalski');
  });

  it('two different users can each have their own fan with the same email', async () => {
    const { user: userA } = await createTestUser();
    const { user: userB } = await createTestUser();
    cleanupUserId = userA.id;

    try {
      await addFan(userA.id, 'shared@example.com');
      await addFan(userB.id, 'shared@example.com');

      expect(await prisma.fan.count({ where: { userId: userA.id } })).toBe(1);
      expect(await prisma.fan.count({ where: { userId: userB.id } })).toBe(1);
    } finally {
      await deleteTestUser(userB.id);
    }
  });
});

describe('recordSale', () => {
  it('records a sale and links it to a fan when a valid email is given', async () => {
    const { user } = await createTestUser();
    cleanupUserId = user.id;

    const sale = await recordSale(user.id, 'Koszulka czarna M', 8050, { fanEmail: 'jan@example.com' });

    expect(sale.amountCents).toBe(8050);
    expect(sale.currency).toBe('PLN');
    expect(sale.fanId).not.toBeNull();

    const fan = await prisma.fan.findUnique({ where: { id: sale.fanId! } });
    expect(fan?.email).toBe('jan@example.com');
    expect(fan?.source).toBe('sale');
  });

  it('records a sale with no fan when no email is given', async () => {
    const { user } = await createTestUser();
    cleanupUserId = user.id;

    const sale = await recordSale(user.id, 'Koszulka', 5000);
    expect(sale.fanId).toBeNull();
  });
});

describe('getRevenueSummary', () => {
  it('aggregates fan count and sales correctly, separating this-month from all-time', async () => {
    const { user } = await createTestUser();
    cleanupUserId = user.id;

    await addFan(user.id, 'a@example.com');
    await addFan(user.id, 'b@example.com');
    await recordSale(user.id, 'Product A', 1000);
    await recordSale(user.id, 'Product B', 2000);

    const summary = await getRevenueSummary(user.id);

    expect(summary.fanCount).toBe(2);
    expect(summary.allTimeSalesCount).toBe(2);
    expect(summary.allTimeRevenueCents).toBe(3000);
    expect(summary.thisMonthSalesCount).toBe(2);
    expect(summary.thisMonthRevenueCents).toBe(3000);
  });

  it('returns all zeros for a fresh account - never fabricates a number', async () => {
    const { user } = await createTestUser();
    cleanupUserId = user.id;

    const summary = await getRevenueSummary(user.id);
    expect(summary).toEqual({
      fanCount: 0,
      allTimeSalesCount: 0,
      allTimeRevenueCents: 0,
      thisMonthSalesCount: 0,
      thisMonthRevenueCents: 0,
    });
  });
});

describe('checkSponsorshipGrowth', () => {
  async function makeMetric(userId: string, daysAgo: number, views: number) {
    const account = await createSocialAccount(userId, 'TIKTOK');
    const video = await createVideo(userId);
    const publishedAt = new Date();
    publishedAt.setUTCDate(publishedAt.getUTCDate() - daysAgo);
    const job = await prisma.publishJob.create({
      data: {
        status: 'SUCCESS',
        postGroupId: `group-${video.id}`,
        caption: 'x',
        hashtags: [],
        scheduledFor: publishedAt,
        publishedAt,
        remotePostId: `remote-${video.id}`,
        videoId: video.id,
        socialAccountId: account.id,
      },
    });
    await prisma.postMetric.create({ data: { publishJobId: job.id, views, likes: 0, comments: 0, shares: 0 } });
  }

  it('triggers when current-period views are at least 1.5x the prior period, above the noise floor', async () => {
    const { user } = await createTestUser();
    cleanupUserId = user.id;

    await makeMetric(user.id, 45, 1000); // prior 30-60 day window
    await makeMetric(user.id, 5, 2000); // current 0-30 day window

    const signal = await checkSponsorshipGrowth(user.id);
    expect(signal.triggered).toBe(true);
    expect(signal.currentViews).toBe(2000);
    expect(signal.priorViews).toBe(1000);
  });

  it('does not trigger on small numbers even with a huge ratio (noise floor)', async () => {
    const { user } = await createTestUser();
    cleanupUserId = user.id;

    await makeMetric(user.id, 45, 2);
    await makeMetric(user.id, 5, 10);

    const signal = await checkSponsorshipGrowth(user.id);
    expect(signal.triggered).toBe(false);
  });

  it('does not trigger when there is no prior-period baseline to compare against', async () => {
    const { user } = await createTestUser();
    cleanupUserId = user.id;

    await makeMetric(user.id, 5, 5000);

    const signal = await checkSponsorshipGrowth(user.id);
    expect(signal.triggered).toBe(false);
    expect(signal.priorViews).toBe(0);
  });
});

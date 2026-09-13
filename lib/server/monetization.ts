// EPIC 5 (Monetyzacja) - Agent fanów (TASK-5.2.1) + rdzeń Agenta sprzedaży w zakresie ustalonym
// dla tej sesji (TASK-5.2.2, ręczna rejestracja - patrz komentarz w schema.prisma przy modelu Fan
// dla pełnego uzasadnienia, czemu automatyczny checkout/webhook płatności NIE jest tu zbudowany).
import { prisma } from './prisma';

const DEFAULT_CURRENCY = 'PLN';

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export async function addFan(userId: string, email: string, name?: string, source = 'manual') {
  const normalizedEmail = normalizeEmail(email);
  const trimmedName = name?.trim() || undefined;

  return prisma.fan.upsert({
    where: { userId_email: { userId, email: normalizedEmail } },
    create: { userId, email: normalizedEmail, name: trimmedName ?? null, source },
    // Re-adding an already-known fan just refreshes the name if a new one was given - never
    // overwrites a known name with nothing.
    update: trimmedName ? { name: trimmedName } : {},
  });
}

export async function getFanCount(userId: string) {
  return prisma.fan.count({ where: { userId } });
}

export async function getRecentFans(userId: string, limit = 5) {
  return prisma.fan.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: limit });
}

// Accepts "80", "80.50", or the Polish decimal comma "80,50" - returns whole cents, or null for
// anything not a positive number (0/negative/garbage input never becomes a Sale row).
export function parseAmountToCents(raw: string): number | null {
  const normalized = raw.trim().replace(',', '.');
  const value = Number(normalized);

  if (!Number.isFinite(value) || value <= 0) {
    return null;
  }

  return Math.round(value * 100);
}

export async function recordSale(
  userId: string,
  product: string,
  amountCents: number,
  options: { fanEmail?: string; currency?: string } = {},
) {
  let fanId: string | undefined;

  if (options.fanEmail && isValidEmail(options.fanEmail)) {
    const fan = await addFan(userId, options.fanEmail, undefined, 'sale');
    fanId = fan.id;
  }

  return prisma.sale.create({
    data: {
      userId,
      product: product.trim(),
      amountCents,
      currency: options.currency ?? DEFAULT_CURRENCY,
      fanId,
    },
  });
}

function currentMonthStart() {
  const start = new Date();
  start.setUTCDate(1);
  start.setUTCHours(0, 0, 0, 0);
  return start;
}

export type RevenueSummary = {
  fanCount: number;
  allTimeSalesCount: number;
  allTimeRevenueCents: number;
  thisMonthSalesCount: number;
  thisMonthRevenueCents: number;
};

// TASK-5.4.4 (dashboard finansowy, zakres tej sesji: agregacja z realnie zebranych danych -
// Telegram /revenue, nie osobna strona web w tej wersji).
export async function getRevenueSummary(userId: string): Promise<RevenueSummary> {
  const monthStart = currentMonthStart();

  const [fanCount, allTime, thisMonth] = await Promise.all([
    prisma.fan.count({ where: { userId } }),
    prisma.sale.aggregate({ where: { userId }, _sum: { amountCents: true }, _count: true }),
    prisma.sale.aggregate({
      where: { userId, createdAt: { gte: monthStart } },
      _sum: { amountCents: true },
      _count: true,
    }),
  ]);

  return {
    fanCount,
    allTimeSalesCount: allTime._count,
    allTimeRevenueCents: allTime._sum.amountCents ?? 0,
    thisMonthSalesCount: thisMonth._count,
    thisMonthRevenueCents: thisMonth._sum.amountCents ?? 0,
  };
}

const GROWTH_LOOKBACK_DAYS = 30;
const GROWTH_MULTIPLIER = 1.5;
// Below this, a "50% growth" is noise (5 views -> 8 views), not a real signal worth a message.
const MIN_ABSOLUTE_VIEWS = 1000;

export type SponsorshipGrowthSignal = {
  triggered: boolean;
  currentViews: number;
  priorViews: number;
};

// TASK-5.4.3 (Agent sponsoringu, zakres tej sesji: sygnał wzrostu na podstawie już zebranych
// PostMetric - EPIC 4 - zamiast pełnego agenta przygotowującego wycenę, co wymagałoby danych
// o realnych stawkach rynkowych, których appka nie ma).
export async function checkSponsorshipGrowth(userId: string): Promise<SponsorshipGrowthSignal> {
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  const currentStart = new Date(now - GROWTH_LOOKBACK_DAYS * dayMs);
  const priorStart = new Date(now - GROWTH_LOOKBACK_DAYS * 2 * dayMs);

  const [currentAgg, priorAgg] = await Promise.all([
    prisma.postMetric.aggregate({
      _sum: { views: true },
      where: { publishJob: { video: { userId }, publishedAt: { gte: currentStart } } },
    }),
    prisma.postMetric.aggregate({
      _sum: { views: true },
      where: { publishJob: { video: { userId }, publishedAt: { gte: priorStart, lt: currentStart } } },
    }),
  ]);

  const currentViews = currentAgg._sum.views ?? 0;
  const priorViews = priorAgg._sum.views ?? 0;

  const triggered = currentViews >= MIN_ABSOLUTE_VIEWS && priorViews > 0 && currentViews >= priorViews * GROWTH_MULTIPLIER;

  return { triggered, currentViews, priorViews };
}

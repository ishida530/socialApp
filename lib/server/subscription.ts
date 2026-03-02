import { PlanTier, SubscriptionStatus } from '@prisma/client';
import { prisma } from './prisma';
import { resolveBillingMode } from './billing-mode';

type UsageMetric = 'video_uploads' | 'publish_jobs';

type PlanLimitConfig = {
  video_uploads: number | null;
  publish_jobs: number | null;
};

const NEW_USER_PRO_TRIAL_HOURS = 48;

const PLAN_LIMITS: Record<PlanTier, PlanLimitConfig> = {
  FREE: {
    video_uploads: 25,
    publish_jobs: 100,
  },
  PRO: {
    video_uploads: 250,
    publish_jobs: 1000,
  },
  PREMIUM: {
    video_uploads: null,
    publish_jobs: null,
  },
};

const PLAN_FEATURES: Record<PlanTier, string[]> = {
  FREE: [
    'Do 25 uploadów miesięcznie',
    'Do 100 zadań publikacji miesięcznie',
    'Podstawowy harmonogram publikacji',
  ],
  PRO: [
    'Do 250 uploadów miesięcznie',
    'Do 1000 zadań publikacji miesięcznie',
    'Priorytetowe przetwarzanie kolejki',
  ],
  PREMIUM: [
    'Nielimitowane uploady i publikacje',
    'Priorytetowe wsparcie i SLA',
    'Rozszerzona analityka',
  ],
};

export const PLAN_CATALOG = [
  {
    tier: PlanTier.FREE,
    title: 'Free',
    description: 'Plan startowy do testów i małych kont.',
    priceMonthly: '0 PLN',
  },
  {
    tier: PlanTier.PRO,
    title: 'Pro',
    description: 'Dla twórców i małych zespołów publikujących regularnie.',
    priceMonthly: '99 PLN',
  },
  {
    tier: PlanTier.PREMIUM,
    title: 'Premium',
    description: 'Dla zespołów z dużym wolumenem i potrzebą pełnej skali.',
    priceMonthly: '299 PLN',
  },
];

function resolvePlanLimits(plan: PlanTier) {
  return PLAN_LIMITS[plan];
}

function resolveTrialWindow(userCreatedAt: Date) {
  const trialEndsAt = new Date(userCreatedAt.getTime() + NEW_USER_PRO_TRIAL_HOURS * 60 * 60 * 1000);
  const isActive = trialEndsAt.getTime() > Date.now();

  return {
    trialStartedAt: userCreatedAt,
    trialEndsAt,
    isActive,
  };
}

function resolveEffectivePlan(subscriptionPlan: PlanTier, userCreatedAt: Date) {
  if (subscriptionPlan !== PlanTier.FREE) {
    return {
      effectivePlan: subscriptionPlan,
      trial: null,
    };
  }

  const trial = resolveTrialWindow(userCreatedAt);
  if (!trial.isActive) {
    return {
      effectivePlan: PlanTier.FREE,
      trial,
    };
  }

  return {
    effectivePlan: PlanTier.PRO,
    trial,
  };
}

function resolveLimitMessage(metric: UsageMetric, limit: number) {
  if (metric === 'video_uploads') {
    return `Przekroczono limit planu (${limit} uploadów wideo / miesiąc).`;
  }

  return `Przekroczono limit planu (${limit} zadań publikacji / miesiąc).`;
};

function getCurrentPeriodStart() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
}

function getNextPeriodStart(currentPeriodStart: Date) {
  return new Date(
    Date.UTC(
      currentPeriodStart.getUTCFullYear(),
      currentPeriodStart.getUTCMonth() + 1,
      1,
      0,
      0,
      0,
      0,
    ),
  );
}

export async function ensureUserSubscription(userId: string) {
  const existing = await prisma.subscription.findUnique({ where: { userId } });
  if (existing) {
    return existing;
  }

  const periodStart = getCurrentPeriodStart();
  return prisma.subscription.create({
    data: {
      userId,
      provider: resolveBillingMode(),
      plan: PlanTier.FREE,
      status: SubscriptionStatus.ACTIVE,
      currentPeriodStart: periodStart,
      currentPeriodEnd: getNextPeriodStart(periodStart),
    },
  });
}

export async function getUserSubscription(userId: string) {
  return ensureUserSubscription(userId);
}

export async function setUserPlan(userId: string, plan: PlanTier) {
  const periodStart = getCurrentPeriodStart();

  return prisma.subscription.upsert({
    where: { userId },
    update: {
      plan,
      status: SubscriptionStatus.ACTIVE,
      provider: resolveBillingMode(),
      currentPeriodStart: periodStart,
      currentPeriodEnd: getNextPeriodStart(periodStart),
      cancelAtPeriodEnd: false,
    },
    create: {
      userId,
      plan,
      status: SubscriptionStatus.ACTIVE,
      provider: resolveBillingMode(),
      currentPeriodStart: periodStart,
      currentPeriodEnd: getNextPeriodStart(periodStart),
      cancelAtPeriodEnd: false,
    },
  });
}

export async function getCurrentUsage(userId: string, metric: UsageMetric) {
  const periodStart = getCurrentPeriodStart();

  const row = await prisma.usageCounter.findUnique({
    where: {
      userId_metric_periodStart: {
        userId,
        metric,
        periodStart,
      },
    },
  });

  return {
    periodStart,
    count: row?.count ?? 0,
  };
}

export async function incrementUsage(userId: string, metric: UsageMetric, amount = 1) {
  const periodStart = getCurrentPeriodStart();

  return prisma.usageCounter.upsert({
    where: {
      userId_metric_periodStart: {
        userId,
        metric,
        periodStart,
      },
    },
    update: {
      count: { increment: amount },
    },
    create: {
      userId,
      metric,
      periodStart,
      count: amount,
    },
  });
}

export async function assertUsageAllowed(userId: string, metric: UsageMetric) {
  const [subscription, user] = await Promise.all([
    ensureUserSubscription(userId),
    prisma.user.findUnique({
      where: { id: userId },
      select: { createdAt: true },
    }),
  ]);

  if (!user) {
    throw new Error('Nie znaleziono użytkownika.');
  }

  if (subscription.status !== SubscriptionStatus.ACTIVE) {
    throw new Error('Subskrypcja jest nieaktywna.');
  }

  const effective = resolveEffectivePlan(subscription.plan, user.createdAt);
  const current = await getCurrentUsage(userId, metric);
  const limit = resolvePlanLimits(effective.effectivePlan)[metric];

  if (limit === null) {
    return;
  }

  if (current.count >= limit) {
    throw new Error(resolveLimitMessage(metric, limit));
  }
}

export async function getSubscriptionSnapshot(userId: string) {
  const [subscription, user] = await Promise.all([
    ensureUserSubscription(userId),
    prisma.user.findUnique({
      where: { id: userId },
      select: { createdAt: true },
    }),
  ]);

  if (!user) {
    throw new Error('Nie znaleziono użytkownika.');
  }

  const effective = resolveEffectivePlan(subscription.plan, user.createdAt);

  const [videoUsage, publishUsage] = await Promise.all([
    getCurrentUsage(userId, 'video_uploads'),
    getCurrentUsage(userId, 'publish_jobs'),
  ]);

  return {
    subscription: {
      ...subscription,
      basePlan: subscription.plan,
      plan: effective.effectivePlan,
      effectivePlan: effective.effectivePlan,
      trial: effective.trial
        ? {
            isActive: effective.trial.isActive,
            startsAt: effective.trial.trialStartedAt,
            endsAt: effective.trial.trialEndsAt,
          }
        : null,
    },
    catalog: PLAN_CATALOG.map((plan) => ({
      ...plan,
      features: PLAN_FEATURES[plan.tier],
      limits: resolvePlanLimits(plan.tier),
    })),
    usage: {
      video_uploads: {
        count: videoUsage.count,
        limit: resolvePlanLimits(effective.effectivePlan).video_uploads,
      },
      publish_jobs: {
        count: publishUsage.count,
        limit: resolvePlanLimits(effective.effectivePlan).publish_jobs,
      },
    },
  };
}

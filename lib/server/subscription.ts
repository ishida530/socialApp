import { PlanTier, SubscriptionStatus } from '@prisma/client';
import { prisma } from './prisma';
import { resolveBillingMode } from './billing-mode';
import {
  NEW_USER_PRO_TRIAL_DAYS,
  PLAN_CATALOG,
  PLAN_FEATURES,
} from '@/lib/billing/plans';
import {
  isBeyondFreeScheduleWindow,
  resolvePlanLimits,
  type UsageMetric,
} from '@/lib/billing/limits';

function resolveTrialWindow(userCreatedAt: Date) {
  const trialEndsAt = new Date(userCreatedAt.getTime() + NEW_USER_PRO_TRIAL_DAYS * 24 * 60 * 60 * 1000);
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

  if (metric === 'ai_autopilot_runs') {
    return `Przekroczono limit planu (${limit} uruchomień Auto-Pilot AI / miesiąc).`;
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

async function resolveSubscriptionContext(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { createdAt: true },
  });

  if (!user) {
    throw new Error('Unauthorized');
  }

  const subscription = await ensureUserSubscription(userId);

  return { subscription, user };
}

export async function getEffectivePlan(userId: string) {
  const { subscription, user } = await resolveSubscriptionContext(userId);
  const effective = resolveEffectivePlan(subscription.plan, user.createdAt);
  return effective.effectivePlan;
}

export async function checkUsageLimits(userId: string, metric: UsageMetric) {
  const { subscription, user } = await resolveSubscriptionContext(userId);

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

export async function assertUsageAllowed(userId: string, metric: UsageMetric) {
  await checkUsageLimits(userId, metric);
}

export async function assertSocialAccountsLimit(userId: string) {
  const effectivePlan = await getEffectivePlan(userId);
  const limit = resolvePlanLimits(effectivePlan).social_accounts;

  const socialAccountsCount = await prisma.socialAccount.count({
    where: { userId },
  });

  if (socialAccountsCount >= limit) {
    throw new Error(`Przekroczono limit planu (${limit} kont social).`);
  }
}

export async function assertScheduleWindowAllowed(userId: string, scheduledFor: Date) {
  const effectivePlan = await getEffectivePlan(userId);
  if (effectivePlan !== PlanTier.FREE) {
    return;
  }

  if (isBeyondFreeScheduleWindow(scheduledFor)) {
    throw new Error('Plan FREE pozwala planować publikacje maksymalnie 72h do przodu.');
  }
}

export async function getSubscriptionSnapshot(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { createdAt: true },
  });

  if (!user) {
    throw new Error('Unauthorized');
  }

  const subscription = await ensureUserSubscription(userId);

  const effective = resolveEffectivePlan(subscription.plan, user.createdAt);

  const [videoUsage, publishUsage, aiUsage] = await Promise.all([
    getCurrentUsage(userId, 'video_uploads'),
    getCurrentUsage(userId, 'publish_jobs'),
    getCurrentUsage(userId, 'ai_autopilot_runs'),
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
      ai_autopilot_runs: {
        count: aiUsage.count,
        limit: resolvePlanLimits(effective.effectivePlan).ai_autopilot_runs,
      },
    },
  };
}

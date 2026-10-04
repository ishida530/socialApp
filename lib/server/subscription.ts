import { PlanTier, SubscriptionStatus } from '@prisma/client';
import { prisma } from './prisma';
import { resolveBillingMode } from './billing-mode';
import { resolveAppMode } from './app-mode';
import { isReviewerEmail } from './admin';
import { isFreeBeta } from '@/lib/beta';
import {
  NEW_USER_PRO_TRIAL_DAYS,
  TRIAL_AI_GENERATIONS,
  PLAN_CATALOG,
  PLAN_FEATURES,
} from '@/lib/billing/plans';
import {
  isBeyondFreeScheduleWindow,
  resolvePlanLimits,
  type UsageMetric,
} from '@/lib/billing/limits';

// The 7 days run from the email confirmation (2026-10-03) - that's when the trial actually unlocks,
// and what the landing promises; counting from sign-up silently cost late confirmers days.
// Accounts created before verification existed have emailVerifiedAt = createdAt (migration).
function resolveTrialWindow(trialStart: Date) {
  const trialEndsAt = new Date(trialStart.getTime() + NEW_USER_PRO_TRIAL_DAYS * 24 * 60 * 60 * 1000);
  const isActive = trialEndsAt.getTime() > Date.now();

  return {
    trialStartedAt: trialStart,
    trialEndsAt,
    isActive,
  };
}

type PlanUser = { createdAt: Date; emailVerifiedAt: Date | null; email: string };

function resolveEffectivePlan(subscriptionPlan: PlanTier, user: PlanUser) {
  // 2026-10-02: platform reviewers' test accounts (REVIEWER_EMAILS) get the full plan for as long
  // as the review takes (weeks, while the trial lasts 7 days), so no limit blocks their testing.
  if (isReviewerEmail(user.email)) {
    return {
      effectivePlan: PlanTier.BUSINESS,
      trial: null,
    };
  }

  if (subscriptionPlan !== PlanTier.FREE) {
    return {
      effectivePlan: subscriptionPlan,
      trial: null,
    };
  }

  // 2026-10-02: the free PRO trial needs a confirmed email address (stops repeat trials on
  // throwaway addresses). Paid plans above are unaffected.
  if (!user.emailVerifiedAt) {
    return {
      effectivePlan: PlanTier.FREE,
      trial: null,
    };
  }

  // Free beta (lib/beta.ts, 2026-10-03): every confirmed account gets PRO for free, no time limit
  // (still capped by PRO's monthly AI quota).
  if (isFreeBeta()) {
    return {
      effectivePlan: PlanTier.PRO,
      trial: null,
    };
  }

  const trial = resolveTrialWindow(user.emailVerifiedAt);
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

  if (metric === 'ai_generations') {
    return `Wykorzystano miesięczny limit generowania tekstów AI w Twoim planie (${limit}).`;
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

// Robustness fix (2026-09-14): find-then-create had a genuine TOCTOU race - two concurrent
// callers (e.g. a duplicate Telegram webhook delivery hitting enqueueDraftGroup twice, which both
// go through getSubscriptionSnapshot -> here) could both see "no existing subscription" and both
// attempt to create one, tripping the unique constraint on userId. upsert closes the window: the
// database itself resolves the race instead of two racing application-level reads.
//
// 2026-10-01: upsert alone did not close it - Prisma only runs a single native INSERT ... ON
// CONFLICT for some upsert shapes; otherwise it is still read-then-create underneath, and CI caught
// two concurrent calls failing with P2002 (Subscription_userId_key). Server-rendered pages now fire
// several requests at once for a brand-new user, so the loser of that race re-reads the row the
// winner just created instead of turning into a 500.
export async function ensureUserSubscription(userId: string) {
  const periodStart = getCurrentPeriodStart();

  try {
    return await prisma.subscription.upsert({
      where: { userId },
      update: {},
      create: {
        userId,
        provider: resolveBillingMode(),
        plan: PlanTier.FREE,
        status: SubscriptionStatus.ACTIVE,
        currentPeriodStart: periodStart,
        currentPeriodEnd: getNextPeriodStart(periodStart),
      },
    });
  } catch (error) {
    if ((error as { code?: string })?.code === 'P2002') {
      return prisma.subscription.findUniqueOrThrow({ where: { userId } });
    }
    throw error;
  }
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
    select: { createdAt: true, emailVerifiedAt: true, email: true },
  });

  if (!user) {
    throw new Error('Unauthorized');
  }

  const subscription = await ensureUserSubscription(userId);

  return { subscription, user };
}

export async function getEffectivePlan(userId: string) {
  const { subscription, user } = await resolveSubscriptionContext(userId);
  const effective = resolveEffectivePlan(subscription.plan, user);
  return effective.effectivePlan;
}

export async function checkUsageLimits(userId: string, metric: UsageMetric) {
  const { subscription, user } = await resolveSubscriptionContext(userId);

  if (subscription.status !== SubscriptionStatus.ACTIVE) {
    throw new Error('Subskrypcja jest nieaktywna.');
  }

  const effective = resolveEffectivePlan(subscription.plan, user);
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
  if (resolveAppMode() === 'personal') {
    return;
  }

  await checkUsageLimits(userId, metric);
}

export async function assertSocialAccountsLimit(userId: string) {
  if (resolveAppMode() === 'personal') {
    return;
  }

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
  if (resolveAppMode() === 'personal') {
    return;
  }

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
    select: { createdAt: true, emailVerifiedAt: true, email: true },
  });

  if (!user) {
    throw new Error('Unauthorized');
  }

  const subscription = await ensureUserSubscription(userId);

  const effective =
    resolveAppMode() === 'personal'
      ? { effectivePlan: PlanTier.BUSINESS, trial: null }
      : resolveEffectivePlan(subscription.plan, user);

  const [videoUsage, publishUsage, aiUsage, aiGenerationsUsage] = await Promise.all([
    getCurrentUsage(userId, 'video_uploads'),
    getCurrentUsage(userId, 'publish_jobs'),
    getCurrentUsage(userId, 'ai_autopilot_runs'),
    getCurrentUsage(userId, 'ai_generations'),
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
      ai_generations: {
        count: aiGenerationsUsage.count,
        limit: resolveAiGenerationsLimit(effective, subscription.plan),
      },
    },
  };
}

// Free beta (2026-10-03, founder review): beta PRO accounts get the trial-sized AI allowance (50 a
// month), not PRO's 600 - the API bill is the only cost that scales with sign-ups. Accounts that are
// actually on a paid/assigned plan (subscription plan above FREE) keep that plan's limit.
function resolveAiGenerationsLimit(effective: ReturnType<typeof resolveEffectivePlan>, basePlan: PlanTier) {
  if (effective.trial?.isActive || (isFreeBeta() && basePlan === PlanTier.FREE && effective.effectivePlan === PlanTier.PRO)) {
    return TRIAL_AI_GENERATIONS;
  }
  return resolvePlanLimits(effective.effectivePlan).ai_generations;
}

// AI generation quota (2026-10-02, AI review): post-copy generation, "Wygeneruj ponownie" and the
// Telegram assistant used to have no cap at all, so one account could run up any Anthropic bill.
// Checked before the call, counted only after the AI actually produced the text (a provider
// outage doesn't eat the user's quota).
export async function hasAiGenerationQuota(userId: string) {
  if (resolveAppMode() === 'personal') {
    return true;
  }

  try {
    const { subscription, user } = await resolveSubscriptionContext(userId);
    // No AI before the email is confirmed - mass sign-ups on throwaway addresses must not cost
    // anything (2026-10-03). Reviewer accounts (REVIEWER_EMAILS) are always verified by hand.
    if (!user.emailVerifiedAt) {
      return false;
    }
    const limit = resolveAiGenerationsLimit(resolveEffectivePlan(subscription.plan, user), subscription.plan);
    if (limit === null) {
      return true;
    }

    const current = await getCurrentUsage(userId, 'ai_generations');
    return current.count < limit;
  } catch {
    // A failed quota lookup must not take the AI feature down - the cap is a cost guard, not auth.
    return true;
  }
}

export async function recordAiGeneration(userId: string) {
  if (resolveAppMode() === 'personal') {
    return;
  }

  await incrementUsage(userId, 'ai_generations').catch(() => {});
}

export const AI_EMAIL_UNVERIFIED_MESSAGE =
  'Teksty AI odblokujesz po potwierdzeniu adresu e-mail (link jest w Twojej skrzynce). Do tego czasu opis możesz napisać ręcznie.';

// Why AI was refused (2026-10-03): an unconfirmed email is not an exhausted limit - say which one.
export async function aiQuotaDeniedMessage(userId: string) {
  const user = await prisma.user
    .findUnique({ where: { id: userId }, select: { emailVerifiedAt: true } })
    .catch(() => null);
  return user && !user.emailVerifiedAt ? AI_EMAIL_UNVERIFIED_MESSAGE : AI_QUOTA_EXHAUSTED_MESSAGE;
}

export const AI_QUOTA_EXHAUSTED_MESSAGE = isFreeBeta()
  ? 'Wykorzystano miesięczny limit tekstów AI - odnowi się 1. dnia miesiąca. Opis możesz napisać lub poprawić ręcznie.'
  : 'Wykorzystano miesięczny limit generowania tekstów AI w Twoim planie. Opis możesz edytować ręcznie albo zmienić plan.';
import { NEW_USER_PRO_TRIAL_DAYS, PLAN_CATALOG, PLAN_FEATURES, PLAN_LIMITS } from '@/lib/billing/plans';

export type MarketingPlan = {
  name: string;
  slug: 'starter' | 'pro' | 'business';
  priceMonthly: string;
  priceYearly: string;
  featured: boolean;
  platformsLabel: string;
  maxSocialAccounts: number;
  accountsPerPlatformLabel: string;
  multiAccountPerPlatformEnabled: boolean;
  monthlyVideoLabel: string;
  aiAutopilot: boolean;
  aiAutopilotRunsLimit: number | null;
  aiAutopilotLabel: string;
  perks: string[];
};

export type BillingCapabilitiesResponse = {
  generatedAt: string;
  free: {
    socialAccounts: number;
    videoUploads: number | null;
    maxScheduleAheadHours: number | null;
    subtitle: string;
  };
  trial: {
    days: number;
    eligibilityNote: string;
  };
  plans: MarketingPlan[];
};

export function isValidBillingCapabilities(value: unknown): value is BillingCapabilitiesResponse {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const payload = value as Partial<BillingCapabilitiesResponse>;
  if (!payload.trial || typeof payload.trial.days !== 'number' || typeof payload.trial.eligibilityNote !== 'string') {
    return false;
  }

  if (!payload.free || typeof payload.free.socialAccounts !== 'number') {
    return false;
  }

  if (!Array.isArray(payload.plans) || payload.plans.length === 0) {
    return false;
  }

  return payload.plans.every((plan) => (
    typeof plan?.name === 'string' &&
    (plan?.slug === 'starter' || plan?.slug === 'pro' || plan?.slug === 'business') &&
    typeof plan?.priceMonthly === 'string' &&
    typeof plan?.priceYearly === 'string' &&
    typeof plan?.maxSocialAccounts === 'number' &&
    typeof plan?.accountsPerPlatformLabel === 'string' &&
    typeof plan?.multiAccountPerPlatformEnabled === 'boolean' &&
    typeof plan?.aiAutopilot === 'boolean' &&
    (typeof plan?.aiAutopilotRunsLimit === 'number' || plan?.aiAutopilotRunsLimit === null) &&
    typeof plan?.aiAutopilotLabel === 'string' &&
    Array.isArray(plan?.perks)
  ));
}

function resolveAiAutopilotLabel(plan: typeof PAID_PLAN_ORDER[number]) {
  const limit = PLAN_LIMITS[plan].ai_autopilot_runs;

  if (limit === 0) {
    return 'Niedostępny';
  }

  if (limit === null) {
    return 'Bez limitu';
  }

  return `${limit} / mies.`;
}

const PAID_PLAN_ORDER = ['STARTER', 'PRO', 'BUSINESS'] as const;

function resolveMonthlyVideoLabel(plan: typeof PAID_PLAN_ORDER[number]) {
  const limits = PLAN_LIMITS[plan];

  if (limits.video_uploads !== null) {
    return `${limits.video_uploads}`;
  }

  if (limits.soft_video_uploads_limit !== null) {
    return `Limit miekki ${limits.soft_video_uploads_limit}`;
  }

  return 'Brak twardego limitu';
}

export function buildBillingCapabilities(): BillingCapabilitiesResponse {
  const plans = PAID_PLAN_ORDER.map((tier) => {
    const catalog = PLAN_CATALOG.find((item) => item.tier === tier);
    if (!catalog) {
      throw new Error(`Missing catalog for ${tier}`);
    }

    return {
      name: catalog.title,
      slug: tier.toLowerCase() as 'starter' | 'pro' | 'business',
      priceMonthly: catalog.priceMonthly,
      priceYearly: catalog.priceYearly,
      featured: tier === 'PRO',
      platformsLabel: 'YT / TikTok / Instagram / Facebook',
      maxSocialAccounts: PLAN_LIMITS[tier].social_accounts,
      accountsPerPlatformLabel: 'W ramach limitu planu',
      multiAccountPerPlatformEnabled: PLAN_LIMITS[tier].social_accounts > 1,
      monthlyVideoLabel: resolveMonthlyVideoLabel(tier),
      aiAutopilot: PLAN_LIMITS[tier].ai_autopilot_runs !== 0,
      aiAutopilotRunsLimit: PLAN_LIMITS[tier].ai_autopilot_runs,
      aiAutopilotLabel: resolveAiAutopilotLabel(tier),
      perks: PLAN_FEATURES[tier],
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    free: {
      socialAccounts: PLAN_LIMITS.FREE.social_accounts,
      videoUploads: PLAN_LIMITS.FREE.video_uploads,
      maxScheduleAheadHours: PLAN_LIMITS.FREE.max_schedule_ahead_hours,
      subtitle: `Free: ${PLAN_LIMITS.FREE.social_accounts} kanał social, planowanie do ${PLAN_LIMITS.FREE.max_schedule_ahead_hours}h`,
    },
    trial: {
      days: NEW_USER_PRO_TRIAL_DAYS,
      eligibilityNote: 'Dla nowych kont.',
    },
    plans,
  };
}

export const FALLBACK_BILLING_CAPABILITIES: BillingCapabilitiesResponse = {
  generatedAt: new Date(0).toISOString(),
  free: {
    socialAccounts: 1,
    videoUploads: 3,
    maxScheduleAheadHours: 72,
    subtitle: 'Free: 1 kanał social, planowanie do 72h',
  },
  trial: {
    days: 7,
    eligibilityNote: 'Dla nowych kont.',
  },
  plans: [
    {
      name: 'Starter',
      slug: 'starter',
      priceMonthly: '49 PLN',
      priceYearly: '39 PLN',
      featured: false,
      platformsLabel: 'YT / TikTok / Instagram / Facebook',
      maxSocialAccounts: 3,
      accountsPerPlatformLabel: 'W ramach limitu planu',
      multiAccountPerPlatformEnabled: true,
      monthlyVideoLabel: '15',
      aiAutopilot: false,
      aiAutopilotRunsLimit: 0,
      aiAutopilotLabel: 'Niedostępny',
      perks: [
        'Do 3 kont social lacznie (takze wiele kont na jednej platformie)',
        'Do 15 wideo / miesiac',
        'Podstawowy planer',
      ],
    },
    {
      name: 'Pro',
      slug: 'pro',
      priceMonthly: '129 PLN',
      priceYearly: '99 PLN',
      featured: true,
      platformsLabel: 'YT / TikTok / Instagram / Facebook',
      maxSocialAccounts: 10,
      accountsPerPlatformLabel: 'W ramach limitu planu',
      multiAccountPerPlatformEnabled: true,
      monthlyVideoLabel: 'Limit miekki 100',
      aiAutopilot: true,
      aiAutopilotRunsLimit: 15,
      aiAutopilotLabel: '15 / mies.',
      perks: [
        'Do 10 kont social lacznie (takze wiele kont na jednej platformie)',
        'Brak twardego limitu publikacji',
        'Limit miekki: 100 wideo / miesiac',
        'AI Autopilot Lite: 15 uruchomien / miesiac (draft mode)',
      ],
    },
    {
      name: 'Business',
      slug: 'business',
      priceMonthly: '299 PLN',
      priceYearly: '239 PLN',
      featured: false,
      platformsLabel: 'YT / TikTok / Instagram / Facebook',
      maxSocialAccounts: 25,
      accountsPerPlatformLabel: 'W ramach limitu planu',
      multiAccountPerPlatformEnabled: true,
      monthlyVideoLabel: 'Brak twardego limitu',
      aiAutopilot: true,
      aiAutopilotRunsLimit: null,
      aiAutopilotLabel: 'Bez limitu',
      perks: [
        'Do 25 kont social lacznie (takze wiele kont na jednej platformie)',
        'Brak twardego limitu publikacji',
        'AI Autopilot bez limitu uruchomien',
      ],
    },
  ],
};

import { PlanTier } from '@prisma/client';

export const NEW_USER_PRO_TRIAL_DAYS = 14;
export const FREE_MAX_SCHEDULE_AHEAD_HOURS = 72;

export type BillingInterval = 'MONTHLY' | 'YEARLY';

export type PlanLimitConfig = {
  social_accounts: number;
  video_uploads: number | null;
  publish_jobs: number | null;
  ai_autopilot_runs: number | null;
  max_schedule_ahead_hours: number | null;
  soft_video_uploads_limit: number | null;
};

export const PLAN_LIMITS: Record<PlanTier, PlanLimitConfig> = {
  FREE: {
    social_accounts: 1,
    video_uploads: 3,
    publish_jobs: 3,
    ai_autopilot_runs: 0,
    max_schedule_ahead_hours: FREE_MAX_SCHEDULE_AHEAD_HOURS,
    soft_video_uploads_limit: null,
  },
  STARTER: {
    social_accounts: 3,
    video_uploads: 15,
    publish_jobs: 15,
    ai_autopilot_runs: 0,
    max_schedule_ahead_hours: null,
    soft_video_uploads_limit: null,
  },
  PRO: {
    social_accounts: 10,
    video_uploads: null,
    publish_jobs: null,
    ai_autopilot_runs: 0,
    max_schedule_ahead_hours: null,
    soft_video_uploads_limit: 100,
  },
  BUSINESS: {
    social_accounts: 25,
    video_uploads: null,
    publish_jobs: null,
    ai_autopilot_runs: null,
    max_schedule_ahead_hours: null,
    soft_video_uploads_limit: null,
  },
};

export const PLAN_FEATURES: Record<PlanTier, string[]> = {
  FREE: [
    '1 kanał social',
    '3 wideo miesięcznie',
    'Planowanie maksymalnie 3 dni do przodu',
  ],
  STARTER: [
    '3 kanały social',
    '15 wideo miesięcznie',
    'Dla freelancerów i małych marek',
  ],
  PRO: [
    '10 kanałów social',
    'Brak twardego limitu wideo (soft limit: 100/miesiąc)',
    'Plan flagowy do regularnego publikowania',
  ],
  BUSINESS: [
    '25 kanałów social',
    'AI Autopilot',
    'Priorytetowy support',
  ],
};

export const PLAN_CATALOG = [
  {
    tier: PlanTier.FREE,
    title: 'Free',
    description: 'Plan startowy dla pierwszych publikacji.',
    priceMonthly: '0 PLN',
    priceYearly: '0 PLN',
  },
  {
    tier: PlanTier.STARTER,
    title: 'Starter',
    description: 'Dla twórców i małych zespołów.',
    priceMonthly: '49 PLN',
    priceYearly: '39 PLN',
  },
  {
    tier: PlanTier.PRO,
    title: 'Pro',
    description: 'Najlepszy stosunek wartości do ceny.',
    priceMonthly: '129 PLN',
    priceYearly: '99 PLN',
  },
  {
    tier: PlanTier.BUSINESS,
    title: 'Business',
    description: 'Dla skalujących się zespołów i agencji.',
    priceMonthly: '299 PLN',
    priceYearly: '239 PLN',
  },
] as const;

export const PAID_PLAN_TIERS: PlanTier[] = [PlanTier.STARTER, PlanTier.PRO, PlanTier.BUSINESS];

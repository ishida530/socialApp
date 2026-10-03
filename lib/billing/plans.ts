import { PlanTier } from '@prisma/client';

export const NEW_USER_PRO_TRIAL_DAYS = 7;
// AI texts during the free PRO trial (2026-10-03): enough to try the product (~10-15 posts on a
// few platforms), not the full PRO allowance - signing up again with a new address must not be a
// cheap way to 600 AI texts.
export const TRIAL_AI_GENERATIONS = 50;
export const FREE_MAX_SCHEDULE_AHEAD_HOURS = 72;

export type BillingInterval = 'MONTHLY' | 'YEARLY';

export type PlanLimitConfig = {
  social_accounts: number;
  video_uploads: number | null;
  publish_jobs: number | null;
  ai_autopilot_runs: number | null;
  // AI-written post copy and mentor-agent answers per month (2026-10-02, AI review) - caps the
  // Anthropic bill per account. Roughly 1-2 US cents per generation with an image.
  ai_generations: number | null;
  max_schedule_ahead_hours: number | null;
  soft_video_uploads_limit: number | null;
};

export const PLAN_LIMITS: Record<PlanTier, PlanLimitConfig> = {
  FREE: {
    social_accounts: 1,
    video_uploads: 3,
    publish_jobs: 3,
    ai_autopilot_runs: 0,
    ai_generations: 20,
    max_schedule_ahead_hours: FREE_MAX_SCHEDULE_AHEAD_HOURS,
    soft_video_uploads_limit: null,
  },
  STARTER: {
    social_accounts: 3,
    video_uploads: 15,
    publish_jobs: 15,
    ai_autopilot_runs: 0,
    ai_generations: 200,
    max_schedule_ahead_hours: null,
    soft_video_uploads_limit: null,
  },
  PRO: {
    social_accounts: 10,
    video_uploads: null,
    publish_jobs: null,
    ai_autopilot_runs: 15,
    ai_generations: 600,
    max_schedule_ahead_hours: null,
    soft_video_uploads_limit: 100,
  },
  BUSINESS: {
    social_accounts: 25,
    video_uploads: null,
    publish_jobs: null,
    ai_autopilot_runs: null,
    ai_generations: 1500,
    max_schedule_ahead_hours: null,
    soft_video_uploads_limit: null,
  },
};

export const PLAN_FEATURES: Record<PlanTier, string[]> = {
  FREE: [
    '1 kanał social',
    '3 wideo miesięcznie',
    'Planowanie maksymalnie 3 dni do przodu',
    '20 tekstów AI miesięcznie (opisy postów i asystent)',
  ],
  STARTER: [
    'Do 3 kont social łącznie (także wiele kont na jednej platformie)',
    'Do 15 wideo miesiecznie',
    '200 tekstów AI miesięcznie (opisy postów i asystent)',
    'Dla freelancerów i małych marek',
  ],
  PRO: [
    'Do 10 kont social łącznie (także wiele kont na jednej platformie)',
    'Brak twardego limitu publikacji',
    'Limit miękki: 100 wideo/miesiąc',
    '600 tekstów AI miesięcznie (opisy postów i asystent)',
    'AI Autopilot Lite: 15 uruchomień / miesiąc (draft mode)',
    'Plan flagowy do regularnego publikowania',
  ],
  BUSINESS: [
    'Do 25 kont social łącznie (także wiele kont na jednej platformie)',
    'Brak twardego limitu publikacji',
    '1500 tekstów AI miesięcznie (opisy postów i asystent)',
    'AI Autopilot bez limitu uruchomień (pełny)',
    'Priorytetowe wsparcie',
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

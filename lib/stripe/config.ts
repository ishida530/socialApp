import { PlanTier } from '@prisma/client';
import type { BillingInterval } from '@/lib/billing/plans';

type PriceEnvMap = Record<Exclude<PlanTier, 'FREE'>, Record<BillingInterval, string>>;

const STRIPE_PRICE_ENV_MAP: PriceEnvMap = {
  STARTER: {
    MONTHLY: 'STRIPE_PRICE_STARTER_MONTHLY',
    YEARLY: 'STRIPE_PRICE_STARTER_YEARLY',
  },
  PRO: {
    MONTHLY: 'STRIPE_PRICE_PRO_MONTHLY',
    YEARLY: 'STRIPE_PRICE_PRO_YEARLY',
  },
  BUSINESS: {
    MONTHLY: 'STRIPE_PRICE_BUSINESS_MONTHLY',
    YEARLY: 'STRIPE_PRICE_BUSINESS_YEARLY',
  },
};

export function resolveStripePriceEnvKey(plan: Exclude<PlanTier, 'FREE'>, interval: BillingInterval) {
  return STRIPE_PRICE_ENV_MAP[plan][interval];
}

export function resolveStripePriceIdFromEnv(plan: Exclude<PlanTier, 'FREE'>, interval: BillingInterval) {
  const key = resolveStripePriceEnvKey(plan, interval);
  const value = process.env[key];

  if (!value) {
    throw new Error(`Missing required config: ${key}`);
  }

  return value;
}

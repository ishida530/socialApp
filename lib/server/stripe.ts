import Stripe from 'stripe';
import { PlanTier } from '@prisma/client';
import type { BillingInterval } from '@/lib/billing/plans';
import { resolveStripePriceIdFromEnv } from '@/lib/stripe/config';

let stripeClient: Stripe | null = null;

function requireStripeSecret() {
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) {
    throw new Error('Missing required config: STRIPE_SECRET_KEY');
  }

  return secret;
}

export function getStripeClient() {
  if (stripeClient) {
    return stripeClient;
  }

  const apiVersion = process.env.STRIPE_API_VERSION;

  stripeClient = new Stripe(requireStripeSecret(), {
    ...(apiVersion ? { apiVersion: apiVersion as Stripe.LatestApiVersion } : {}),
  });

  return stripeClient;
}

export function resolveStripePriceId(plan: Exclude<PlanTier, 'FREE'>, interval: BillingInterval) {
  return resolveStripePriceIdFromEnv(plan, interval);
}

export function resolveStripeReturnUrls() {
  const successUrl =
    process.env.STRIPE_SUCCESS_URL ??
    `${process.env.FRONTEND_URL ?? 'http://localhost:3000'}/billing?checkout=success`;
  const cancelUrl =
    process.env.STRIPE_CANCEL_URL ??
    `${process.env.FRONTEND_URL ?? 'http://localhost:3000'}/billing?checkout=cancel`;

  return { successUrl, cancelUrl };
}

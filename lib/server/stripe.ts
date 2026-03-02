import Stripe from 'stripe';

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

  stripeClient = new Stripe(requireStripeSecret(), {
    apiVersion: '2026-02-25.clover',
  });

  return stripeClient;
}

export function resolveStripePriceId(plan: 'PRO' | 'PREMIUM') {
  const key = plan === 'PRO' ? 'STRIPE_PRICE_PRO_MONTHLY' : 'STRIPE_PRICE_PREMIUM_MONTHLY';
  const value = process.env[key];

  if (!value) {
    throw new Error(`Missing required config: ${key}`);
  }

  return value;
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

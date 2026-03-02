export type BillingMode = 'mock' | 'live';

export function resolveBillingMode(): BillingMode {
  const configured = (process.env.BILLING_MODE ?? 'auto').toLowerCase();

  if (configured === 'mock') {
    return 'mock';
  }

  if (configured === 'live') {
    return 'live';
  }

  if (process.env.VERCEL === '1' || process.env.NODE_ENV === 'production') {
    return 'live';
  }

  return 'mock';
}

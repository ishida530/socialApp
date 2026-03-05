import type { PlanTier, SubscriptionStatus } from '@/lib/billing/types';

export function planLabel(plan: PlanTier) {
  if (plan === 'FREE') return 'Free';
  if (plan === 'STARTER') return 'Starter';
  if (plan === 'PRO') return 'Pro';
  return 'Business';
}

export function subscriptionStatusLabel(status: SubscriptionStatus) {
  if (status === 'ACTIVE') return 'Aktywna';
  if (status === 'PAST_DUE') return 'Wymaga platnosci';
  return 'Anulowana';
}

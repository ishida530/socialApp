export type PlanTier = 'FREE' | 'STARTER' | 'PRO' | 'BUSINESS';
export type PaidPlanTier = Exclude<PlanTier, 'FREE'>;
export type SubscriptionStatus = 'ACTIVE' | 'CANCELED' | 'PAST_DUE';

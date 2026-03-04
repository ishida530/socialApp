'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/auth-context';
import { apiClient } from '@/lib/api-client';

type BillingSnapshot = {
  subscription: {
    plan: 'FREE' | 'STARTER' | 'PRO' | 'BUSINESS';
    basePlan?: 'FREE' | 'STARTER' | 'PRO' | 'BUSINESS';
    effectivePlan?: 'FREE' | 'STARTER' | 'PRO' | 'BUSINESS';
    status: 'ACTIVE' | 'CANCELED' | 'PAST_DUE';
    currentPeriodEnd?: string | null;
    trial?: {
      isActive: boolean;
      startsAt: string;
      endsAt: string;
    } | null;
  };
  catalog: Array<{
    tier: 'FREE' | 'STARTER' | 'PRO' | 'BUSINESS';
    title: string;
    description: string;
    priceMonthly: string;
    priceYearly: string;
    features: string[];
    limits: {
      social_accounts: number;
      video_uploads: number | null;
      publish_jobs: number | null;
      max_schedule_ahead_hours: number | null;
    };
  }>;
  usage: {
    video_uploads: {
      count: number;
      limit: number | null;
    };
    publish_jobs: {
      count: number;
      limit: number | null;
    };
  };
};

function subscriptionStatusLabel(status: 'ACTIVE' | 'CANCELED' | 'PAST_DUE') {
  if (status === 'ACTIVE') return 'Aktywna';
  if (status === 'PAST_DUE') return 'Wymaga płatności';
  return 'Anulowana';
}

function planLabel(plan: 'FREE' | 'STARTER' | 'PRO' | 'BUSINESS') {
  if (plan === 'FREE') return 'Free';
  if (plan === 'STARTER') return 'Starter';
  if (plan === 'PRO') return 'Pro';
  return 'Business';
}

function BillingPageContent() {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const handledCheckoutState = useRef<string | null>(null);
  const [snapshot, setSnapshot] = useState<BillingSnapshot | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [billingInterval, setBillingInterval] = useState<'MONTHLY' | 'YEARLY'>('MONTHLY');

  const trialEndsAt = snapshot?.subscription.trial?.isActive
    ? new Date(snapshot.subscription.trial.endsAt).getTime()
    : null;

  const trialRemainingMs = trialEndsAt ? Math.max(0, trialEndsAt - now) : 0;
  const trialRemainingDays = Math.floor(trialRemainingMs / (1000 * 60 * 60 * 24));
  const trialRemainingHours = Math.floor(trialRemainingMs / (1000 * 60 * 60));
  const trialRemainingMinutes = Math.floor((trialRemainingMs % (1000 * 60 * 60)) / (1000 * 60));

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace('/login');
    }
  }, [isAuthenticated, isLoading, router]);

  const loadSnapshot = async () => {
    try {
      const response = await apiClient.get<BillingSnapshot>('/billing/subscription');
      setSnapshot(response.data);
    } catch {
      toast.error('Nie udało się pobrać danych subskrypcji.');
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      void loadSnapshot();
    }
  }, [isAuthenticated]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 60 * 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    const checkoutState = searchParams.get('checkout');
    if (!checkoutState || handledCheckoutState.current === checkoutState) {
      return;
    }

    handledCheckoutState.current = checkoutState;

    if (checkoutState === 'success') {
      toast.success('Płatność zakończona pomyślnie.');
      void loadSnapshot();
      router.refresh();
      return;
    }

    if (checkoutState === 'cancel') {
      toast('Płatność anulowana.');
      router.replace(pathname);
    }
  }, [loadSnapshot, pathname, router, searchParams]);

  useEffect(() => {
    const portalState = searchParams.get('portal');
    if (!portalState) {
      return;
    }

    if (portalState === 'mock') {
      toast.info('Portal subskrypcji jest chwilowo niedostępny. Spróbuj ponownie później.');
      router.replace(pathname);
    }
  }, [pathname, router, searchParams]);

  const startCheckout = async (plan: 'STARTER' | 'PRO' | 'BUSINESS') => {
    try {
      setIsSubmitting(true);
      const response = await apiClient.post<{ mode: 'mock' | 'live'; url?: string }>(
        '/billing/checkout',
        {
          plan,
          interval: billingInterval,
        },
      );

      if (response.data.url) {
        window.location.assign(response.data.url);
        return;
      }

      toast.success(`Plan został zaktualizowany do ${planLabel(plan)}.`);
      await loadSnapshot();
    } catch {
      toast.error('Nie udało się uruchomić płatności.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const switchToFree = async () => {
    try {
      setIsSubmitting(true);
      await apiClient.patch('/billing/subscription', { plan: 'FREE' });
      toast.success('Plan został przełączony na Free.');
      await loadSnapshot();
    } catch {
      toast.error('Zmiana planu nie powiodła się.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const openBillingPortal = async () => {
    try {
      setIsSubmitting(true);
      const response = await apiClient.post<{
        mode?: 'mock' | 'live';
        url?: string;
        hasExternalPortal?: boolean;
      }>('/billing/portal');

      if (response.data.mode === 'mock' && !response.data.hasExternalPortal) {
        toast.info('Portal subskrypcji jest chwilowo niedostępny. Spróbuj ponownie później.');
      }

      if (!response.data.url) {
        throw new Error('Brak URL portalu rozliczeń.');
      }

      window.location.assign(response.data.url);
    } catch {
      toast.error('Nie udało się otworzyć portalu rozliczeń.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading || !isAuthenticated) {
    return (
      <main className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-sm text-muted-foreground">Ładowanie sesji...</p>
      </main>
    );
  }

  return (
    <main className="flex-1 overflow-y-auto p-4 sm:p-6 pb-24 lg:pb-6 space-y-6">
          <section className="bg-card border border-border rounded-xl p-6 space-y-4">
            <h2 className="text-lg font-semibold text-foreground">Subskrypcja</h2>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="p-4 rounded-lg border border-border bg-secondary/20">
                <p className="text-xs text-muted-foreground">Plan</p>
                <p className="text-xl font-semibold text-foreground mt-1">
                  {snapshot?.subscription.plan ? planLabel(snapshot.subscription.plan) : '-'}
                </p>
                {snapshot?.subscription.trial?.isActive && snapshot.subscription.basePlan === 'FREE' && (
                  <p className="text-xs text-primary mt-1">
                    Okres próbny PRO (7 dni): {trialRemainingHours}h {trialRemainingMinutes}m (do{' '}
                    {new Date(snapshot.subscription.trial.endsAt).toLocaleString('pl-PL')})
                  </p>
                )}
                {snapshot?.subscription.trial?.isActive && snapshot.subscription.basePlan === 'FREE' && (
                  <p className="text-xs text-muted-foreground mt-1">Pozostało ~{trialRemainingDays} dni okresu próbnego.</p>
                )}
              </div>

              <div className="p-4 rounded-lg border border-border bg-secondary/20">
                <p className="text-xs text-muted-foreground">Status</p>
                <p className="text-xl font-semibold text-foreground mt-1">
                  {snapshot?.subscription.status ? subscriptionStatusLabel(snapshot.subscription.status) : '-'}
                </p>
              </div>

              <div className="p-4 rounded-lg border border-border bg-secondary/20">
                <p className="text-xs text-muted-foreground">Koniec okresu</p>
                <p className="text-sm font-medium text-foreground mt-2">
                  {snapshot?.subscription.currentPeriodEnd
                    ? new Date(snapshot.subscription.currentPeriodEnd).toLocaleString('pl-PL')
                    : '—'}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="p-4 rounded-lg border border-border bg-secondary/20">
                <p className="text-sm text-foreground">Uploady wideo</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {snapshot
                    ? `${snapshot.usage.video_uploads.count} / ${snapshot.usage.video_uploads.limit ?? '∞'}`
                    : '-'}
                </p>
              </div>

              <div className="p-4 rounded-lg border border-border bg-secondary/20">
                <p className="text-sm text-foreground">Zadania publikacji</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {snapshot
                    ? `${snapshot.usage.publish_jobs.count} / ${snapshot.usage.publish_jobs.limit ?? '∞'}`
                    : '-'}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-secondary/20 p-3">
              <p className="text-sm text-foreground">Rozliczenie</p>
              <p className="text-xs text-muted-foreground">Każdy płatny plan obejmuje 7 dni okresu próbnego.</p>
              <div className="inline-flex rounded-lg border border-border overflow-hidden">
                <button
                  onClick={() => setBillingInterval('MONTHLY')}
                  className={`px-3 py-1.5 text-xs ${billingInterval === 'MONTHLY' ? 'bg-primary text-primary-foreground' : 'bg-secondary text-foreground'}`}
                >
                  Miesięcznie
                </button>
                <button
                  onClick={() => setBillingInterval('YEARLY')}
                  className={`px-3 py-1.5 text-xs ${billingInterval === 'YEARLY' ? 'bg-primary text-primary-foreground' : 'bg-secondary text-foreground'}`}
                >
                  Rocznie (2 miesiące gratis)
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              {snapshot?.catalog.map((plan) => {
                const isCurrentPlan = snapshot.subscription.plan === plan.tier;
                const canPurchasePaidPlan = plan.tier !== 'FREE';

                return (
                  <div key={plan.tier} className="p-4 rounded-lg border border-border bg-secondary/20 space-y-3">
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-foreground">{plan.title}</p>
                        {plan.tier === 'PRO' && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/30">
                            Najczęściej wybierany
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">{plan.description}</p>
                      <p className="text-sm text-primary mt-2">
                        {billingInterval === 'MONTHLY' ? plan.priceMonthly : plan.priceYearly} / miesiąc netto
                      </p>
                    </div>

                    <ul className="space-y-1">
                      {plan.features.map((feature) => (
                        <li key={feature} className="text-xs text-muted-foreground">• {feature}</li>
                      ))}
                    </ul>

                    {plan.tier === 'FREE' ? (
                      <button
                        onClick={switchToFree}
                        disabled={isSubmitting || isCurrentPlan}
                        className="w-full px-3 py-2 rounded-lg bg-secondary text-foreground border border-border disabled:opacity-60"
                      >
                        {isCurrentPlan ? 'Aktualny plan' : 'Przełącz na FREE'}
                      </button>
                    ) : (
                      <button
                        onClick={() => {
                          if (plan.tier === 'STARTER' || plan.tier === 'PRO' || plan.tier === 'BUSINESS') {
                            void startCheckout(plan.tier);
                          }
                        }}
                        disabled={isSubmitting || isCurrentPlan}
                        className="w-full px-3 py-2 rounded-lg bg-primary text-primary-foreground disabled:opacity-60"
                      >
                        {isCurrentPlan
                          ? snapshot?.subscription.trial?.isActive && snapshot.subscription.basePlan === 'FREE'
                            ? 'Okres próbny aktywny'
                            : 'Aktualny plan'
                          : `Kup ${plan.title}`}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="pt-2">
              <button
                onClick={openBillingPortal}
                disabled={isSubmitting}
                className="px-4 py-2 rounded-lg bg-secondary text-foreground border border-border disabled:opacity-60"
              >
                Zarządzaj subskrypcją
              </button>
            </div>
          </section>
    </main>
  );
}

export default function BillingPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-background flex items-center justify-center">
          <p className="text-sm text-muted-foreground">Ładowanie...</p>
        </main>
      }
    >
      <BillingPageContent />
    </Suspense>
  );
}
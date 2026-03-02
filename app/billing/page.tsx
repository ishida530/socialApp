'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { Sidebar } from '@/components/Sidebar';
import { Header } from '@/components/Header';
import { useAuth } from '@/contexts/auth-context';
import { apiClient } from '@/lib/api-client';

type BillingSnapshot = {
  subscription: {
    plan: 'FREE' | 'PRO' | 'PREMIUM';
    status: 'ACTIVE' | 'CANCELED' | 'PAST_DUE';
    currentPeriodEnd?: string | null;
  };
  catalog: Array<{
    tier: 'FREE' | 'PRO' | 'PREMIUM';
    title: string;
    description: string;
    priceMonthly: string;
    features: string[];
    limits: {
      video_uploads: number | null;
      publish_jobs: number | null;
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

function BillingPageContent() {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const handledCheckoutState = useRef<string | null>(null);
  const [snapshot, setSnapshot] = useState<BillingSnapshot | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

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
    const checkoutState = searchParams.get('checkout');
    if (!checkoutState || handledCheckoutState.current === checkoutState) {
      return;
    }

    handledCheckoutState.current = checkoutState;

    if (checkoutState === 'success') {
      toast.success('Payment successful');
      void loadSnapshot();
      router.refresh();
      return;
    }

    if (checkoutState === 'cancel') {
      toast('Payment cancelled');
      router.replace(pathname);
    }
  }, [loadSnapshot, pathname, router, searchParams]);

  useEffect(() => {
    const portalState = searchParams.get('portal');
    if (!portalState) {
      return;
    }

    if (portalState === 'mock') {
      toast.info('Portal subskrypcji nie jest aktywny w trybie mock. Skonfiguruj Stripe Billing Portal URL.');
      router.replace(pathname);
    }
  }, [pathname, router, searchParams]);

  const startCheckout = async (plan: 'PRO' | 'PREMIUM') => {
    try {
      setIsSubmitting(true);
      const response = await apiClient.post<{ mode: 'mock' | 'live'; url?: string }>(
        '/billing/checkout',
        { plan },
      );

      if (response.data.url) {
        window.location.assign(response.data.url);
        return;
      }

      toast.success(`Plan został zaktualizowany do ${plan}.`);
      await loadSnapshot();
    } catch {
      toast.error('Uruchomienie checkout nie powiodło się.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const switchToFree = async () => {
    try {
      setIsSubmitting(true);
      await apiClient.patch('/billing/subscription', { plan: 'FREE' });
      toast.success('Plan został przełączony na FREE.');
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
        toast.info('Portal subskrypcji jest dostępny po włączeniu Stripe mode i BILLING_PORTAL_URL.');
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
    <div className="size-full flex bg-background dark">
      <Sidebar />

      <div className="flex-1 flex flex-col min-w-0">
        <Header />

        <main className="flex-1 overflow-y-auto p-6 space-y-6">
          <section className="bg-card border border-border rounded-xl p-6 space-y-4">
            <h2 className="text-lg font-semibold text-foreground">Subskrypcja</h2>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="p-4 rounded-lg border border-border bg-secondary/20">
                <p className="text-xs text-muted-foreground">Plan</p>
                <p className="text-xl font-semibold text-foreground mt-1">
                  {snapshot?.subscription.plan ?? '-'}
                </p>
              </div>

              <div className="p-4 rounded-lg border border-border bg-secondary/20">
                <p className="text-xs text-muted-foreground">Status</p>
                <p className="text-xl font-semibold text-foreground mt-1">
                  {snapshot?.subscription.status ?? '-'}
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

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {snapshot?.catalog.map((plan) => {
                const isCurrentPlan = snapshot.subscription.plan === plan.tier;
                const canPurchasePaidPlan = plan.tier === 'PRO' || plan.tier === 'PREMIUM';

                return (
                  <div key={plan.tier} className="p-4 rounded-lg border border-border bg-secondary/20 space-y-3">
                    <div>
                      <p className="text-sm font-semibold text-foreground">{plan.title}</p>
                      <p className="text-xs text-muted-foreground mt-1">{plan.description}</p>
                      <p className="text-sm text-primary mt-2">{plan.priceMonthly} / miesiąc</p>
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
                          if (plan.tier === 'PRO' || plan.tier === 'PREMIUM') {
                            void startCheckout(plan.tier);
                          }
                        }}
                        disabled={isSubmitting || isCurrentPlan}
                        className="w-full px-3 py-2 rounded-lg bg-primary text-primary-foreground disabled:opacity-60"
                      >
                        {isCurrentPlan ? 'Aktualny plan' : `Kup ${plan.title}`}
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
      </div>
    </div>
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
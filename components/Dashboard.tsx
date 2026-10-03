"use client";

import { useEffect, useMemo, useState } from 'react';
import { ConnectedPlatforms } from './ConnectedPlatforms';
import { RecentActivity } from './RecentActivity';
import { DashboardAIAdvisor } from './DashboardAIAdvisor';
import { OnboardingChecklist } from './OnboardingChecklist';
import { apiClient } from '@/lib/api-client';
import type { OnboardingProgress } from '@/lib/server/dashboard-data';

type DashboardAnalytics = {
  totals: {
    videosUploaded: number;
    jobsCreated: number;
    jobsSucceeded: number;
    jobsFailed: number;
    connectedAccounts: number;
    successRate: number;
  };
};

// `initialAnalytics` / `initialOnboarding` come from the dashboard Server Component (rendered with
// the page HTML, 2026-10-01 performance phase 2) - when present, the first client-side fetches are
// skipped entirely. Without them (any other caller) the component fetches as before.
export function Dashboard({
  initialAnalytics,
  initialOnboarding,
}: {
  initialAnalytics?: DashboardAnalytics | null;
  initialOnboarding?: OnboardingProgress;
} = {}) {
  const [analytics, setAnalytics] = useState<DashboardAnalytics | null>(initialAnalytics ?? null);
  const [isLoadingAnalytics, setIsLoadingAnalytics] = useState(initialAnalytics === undefined);

  useEffect(() => {
    if (initialAnalytics !== undefined) {
      return;
    }

    const loadAnalytics = async () => {
      try {
        setIsLoadingAnalytics(true);
        const response = await apiClient.get<DashboardAnalytics>('/analytics?range=30d');
        setAnalytics(response.data);
      } catch {
        setAnalytics(null);
      } finally {
        setIsLoadingAnalytics(false);
      }
    };

    void loadAnalytics();
  }, [initialAnalytics]);

  const metricCards = useMemo(() => {
    const totals = analytics?.totals;

    return [
      {
        label: 'Opublikowane (30 dni)',
        value: totals?.jobsSucceeded,
        hint: 'Posty opublikowane bez błędów',
        className:
          'bg-gradient-to-br from-primary/10 to-accent/10 backdrop-blur-sm border border-primary/20 rounded-xl p-5',
        hintClassName: 'text-xs text-green-500 mt-2',
      },
      {
        label: 'W kolejce (30 dni)',
        value: totals ? Math.max(0, totals.jobsCreated - totals.jobsSucceeded - totals.jobsFailed) : undefined,
        hint: 'Utworzone - zakończone',
        className:
          'bg-gradient-to-br from-blue-500/10 to-cyan-500/10 backdrop-blur-sm border border-blue-500/20 rounded-xl p-5',
        hintClassName: 'text-xs text-blue-500 mt-2',
      },
      {
        label: 'Przesłane wideo (30 dni)',
        value: totals?.videosUploaded,
        hint: 'Nowe materiały',
        className:
          'bg-gradient-to-br from-green-500/10 to-emerald-500/10 backdrop-blur-sm border border-green-500/20 rounded-xl p-5',
        hintClassName: 'text-xs text-green-500 mt-2',
      },
      {
        label: 'Skuteczność publikacji',
        value: totals ? `${totals.successRate}%` : undefined,
        hint: `Połączone konta: ${totals?.connectedAccounts ?? 0}`,
        className:
          'bg-gradient-to-br from-yellow-500/10 to-orange-500/10 backdrop-blur-sm border border-yellow-500/20 rounded-xl p-5',
        hintClassName: 'text-xs text-yellow-500 mt-2',
      },
    ];
  }, [analytics]);

  return (
    <main className="flex-1 overflow-hidden">
      <div className="h-full overflow-y-auto p-4 sm:p-6 pb-24 lg:pb-6 space-y-6">
        <OnboardingChecklist initialProgress={initialOnboarding} />

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {metricCards.map((card) => (
            <div key={card.label} className={card.className}>
              <p className="text-sm text-muted-foreground mb-1">{card.label}</p>
              <p className="text-3xl font-bold text-foreground">
                {isLoadingAnalytics ? '...' : card.value ?? '-'}
              </p>
              <p className={card.hintClassName}>{card.hint}</p>
            </div>
          ))}
        </div>

        <DashboardAIAdvisor />

        <ConnectedPlatforms />
        <RecentActivity />
      </div>
    </main>
  );
}

'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { apiClient } from '@/lib/api-client';

type JobsProbeResponse = {
  totalCount: number;
};

type Step = {
  id: 'accounts' | 'media' | 'draft' | 'schedule';
  label: string;
  done: boolean;
  href: string;
  cta: string;
};

export function OnboardingChecklist() {
  const [isLoading, setIsLoading] = useState(true);
  const [hasAccounts, setHasAccounts] = useState(false);
  const [hasMedia, setHasMedia] = useState(false);
  const [hasDrafts, setHasDrafts] = useState(false);
  const [hasSchedule, setHasSchedule] = useState(false);

  useEffect(() => {
    const loadProgress = async () => {
      try {
        setIsLoading(true);

        const [accountsResponse, videosResponse, draftsResponse, jobsResponse] = await Promise.all([
          apiClient.get<Array<{ id: string }>>('/social-accounts'),
          apiClient.get<Array<{ id: string }>>('/videos'),
          apiClient.get<Array<{ id: string }>>('/drafts'),
          apiClient.get<JobsProbeResponse>('/jobs?limit=1&offset=0'),
        ]);

        setHasAccounts(accountsResponse.data.length > 0);
        setHasMedia(videosResponse.data.length > 0);
        setHasDrafts(draftsResponse.data.length > 0);
        setHasSchedule((jobsResponse.data.totalCount ?? 0) > 0);
      } catch {
        setHasAccounts(false);
        setHasMedia(false);
        setHasDrafts(false);
        setHasSchedule(false);
      } finally {
        setIsLoading(false);
      }
    };

    void loadProgress();
  }, []);

  const steps = useMemo<Step[]>(
    () => [
      {
        id: 'accounts',
        label: 'Połącz konto social',
        done: hasAccounts,
        href: '/social-accounts',
        cta: 'Połącz konto',
      },
      {
        id: 'media',
        label: 'Dodaj pierwszy materiał',
        done: hasMedia,
        href: '/media-library',
        cta: 'Dodaj materiał',
      },
      {
        id: 'draft',
        label: 'Przygotuj pierwszy szkic',
        done: hasDrafts,
        href: '/',
        cta: 'Utwórz szkic',
      },
      {
        id: 'schedule',
        label: 'Zaplanuj publikację',
        done: hasSchedule,
        href: '/schedule',
        cta: 'Zaplanuj',
      },
    ],
    [hasAccounts, hasDrafts, hasMedia, hasSchedule],
  );

  const completedCount = steps.filter((step) => step.done).length;
  const nextStep = steps.find((step) => !step.done) || null;

  if (isLoading) {
    return (
      <section className="bg-card border border-border rounded-xl p-5">
        <p className="text-sm text-muted-foreground">Ładowanie checklisty startowej...</p>
      </section>
    );
  }

  return (
    <section className="bg-card border border-border rounded-xl p-5 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-foreground">Start w 4 krokach</h2>
          <p className="text-xs text-muted-foreground mt-1">
            Ukończone: {completedCount}/4
          </p>
        </div>

        {nextStep ? (
          <Link
            href={nextStep.href}
            className="inline-flex items-center justify-center px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm"
          >
            {nextStep.cta}
          </Link>
        ) : (
          <p className="text-xs text-primary font-medium">Checklist ukończona ✅</p>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2">
        {steps.map((step, index) => (
          <div
            key={step.id}
            className={`rounded-lg border px-3 py-2 text-sm ${
              step.done
                ? 'border-primary/30 bg-primary/10 text-foreground'
                : 'border-border bg-secondary/20 text-muted-foreground'
            }`}
          >
            <p className="text-[11px] opacity-80">Krok {index + 1}</p>
            <p className="mt-1">{step.label}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

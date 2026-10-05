'use client';

import { useEffect, useRef, useState } from 'react';
import { apiClient } from '@/lib/api-client';
import { PostResultsSection } from '@/components/PostResultsSection';

type RangeKey = '7d' | '30d' | '90d';

export type AnalyticsResponse = {
  range: RangeKey;
  days: number;
  totals: {
    videosUploaded: number;
    jobsCreated: number;
    jobsSucceeded: number;
    jobsFailed: number;
    connectedAccounts: number;
    successRate: number;
  };
  trend: Array<{
    date: string;
    videos: number;
    jobsCreated: number;
    success: number;
    failed: number;
  }>;
};

// `initialMetrics` (30 days) is rendered by the analytics Server Component - the first view needs
// no client fetch; changing the range fetches as before. Session is checked by the section layout.
export function AnalyticsView({ initialMetrics }: { initialMetrics: AnalyticsResponse | null }) {
  const [metrics, setMetrics] = useState<AnalyticsResponse | null>(initialMetrics);
  const [selectedRange, setSelectedRange] = useState<RangeKey>('30d');
  const [loadingMetrics, setLoadingMetrics] = useState(!initialMetrics);
  const skipFirstFetch = useRef(Boolean(initialMetrics));

  useEffect(() => {
    if (skipFirstFetch.current) {
      skipFirstFetch.current = false;
      return;
    }

    const load = async () => {
      try {
        setLoadingMetrics(true);
        const response = await apiClient.get<AnalyticsResponse>(
          `/analytics?range=${selectedRange}`,
        );
        setMetrics(response.data);
      } catch {
        setMetrics({
          range: selectedRange,
          days: selectedRange === '7d' ? 7 : selectedRange === '90d' ? 90 : 30,
          totals: {
            videosUploaded: 0,
            jobsCreated: 0,
            jobsSucceeded: 0,
            jobsFailed: 0,
            connectedAccounts: 0,
            successRate: 0,
          },
          trend: [],
        });
      } finally {
        setLoadingMetrics(false);
      }
    };

    void load();
  }, [selectedRange]);

  return (
    <main className="flex-1 overflow-y-auto p-4 sm:p-6 pb-24 lg:pb-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
            <h2 className="text-lg font-semibold text-foreground">Analityka</h2>
            <select
              value={selectedRange}
              onChange={(event) => setSelectedRange(event.target.value as RangeKey)}
              className="w-full sm:w-auto px-3 py-2 bg-secondary/30 border border-border rounded-lg text-sm text-foreground"
            >
              <option value="7d">Ostatnie 7 dni</option>
              <option value="30d">Ostatnie 30 dni</option>
              <option value="90d">Ostatnie 90 dni</option>
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
            <div className="bg-card border border-border rounded-xl p-5">
              <p className="text-sm text-muted-foreground">Wideo ({selectedRange})</p>
              <p className="text-3xl font-semibold text-foreground mt-2">
                {metrics?.totals.videosUploaded ?? '-'}
              </p>
            </div>

            <div className="bg-card border border-border rounded-xl p-5">
              <p className="text-sm text-muted-foreground">Zadania publikacji ({selectedRange})</p>
              <p className="text-3xl font-semibold text-foreground mt-2">
                {metrics?.totals.jobsCreated ?? '-'}
              </p>
            </div>

            <div className="bg-card border border-border rounded-xl p-5">
              <p className="text-sm text-muted-foreground">Opublikowane / Nieudane</p>
              <p className="text-3xl font-semibold text-foreground mt-2">
                {metrics
                  ? `${metrics.totals.jobsSucceeded} / ${metrics.totals.jobsFailed}`
                  : '-'}
              </p>
            </div>

            <div className="bg-card border border-border rounded-xl p-5">
              <p className="text-sm text-muted-foreground">Skuteczność</p>
              <p className="text-3xl font-semibold text-foreground mt-2">
                {metrics ? `${metrics.totals.successRate}%` : '-'}
              </p>
            </div>

            <div className="bg-card border border-border rounded-xl p-5">
              <p className="text-sm text-muted-foreground">Połączone konta</p>
              <p className="text-3xl font-semibold text-foreground mt-2">
                {metrics?.totals.connectedAccounts ?? '-'}
              </p>
            </div>
          </div>

          <section className="bg-card border border-border rounded-xl p-5 mt-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-medium text-foreground">Trend dzienny</h3>
              {loadingMetrics && (
                <p className="text-xs text-muted-foreground">Ładowanie danych...</p>
              )}
            </div>

            <div className="space-y-2">
              {metrics?.trend.slice(-14).map((row) => {
                const dayTotal = row.jobsCreated + row.videos;
                const maxTotal =
                  Math.max(...(metrics.trend.map((item) => item.jobsCreated + item.videos)), 1);
                const width = Math.max(4, Math.round((dayTotal / maxTotal) * 100));

                return (
                  <div key={row.date} className="space-y-1">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{row.date}</span>
                      <span>
                        Wideo: {row.videos} • Zadania: {row.jobsCreated} • Opublikowane: {row.success} • Nieudane: {row.failed}
                      </span>
                    </div>
                    <div className="h-2 w-full bg-secondary/40 rounded-full overflow-hidden">
                      <div className="h-2 bg-primary/80" style={{ width: `${width}%` }} />
                    </div>
                  </div>
                );
              })}

              {!metrics?.trend.length && (
                <p className="text-sm text-muted-foreground">Brak danych trendu dla wybranego zakresu.</p>
              )}
            </div>
          </section>

          <PostResultsSection />
    </main>
  );
}
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import { apiClient } from '@/lib/api-client';

type PaginatedAdminJobsResponse = {
  data: PublishJob[];
  totalCount: number;
  hasMore: boolean;
  summary: Record<'PENDING' | 'RUNNING' | 'SUCCESS' | 'FAILED' | 'CANCELED', number>;
};

type PublishJob = {
  id: string;
  status: 'PENDING' | 'RUNNING' | 'SUCCESS' | 'FAILED' | 'CANCELED';
  scheduledFor: string;
};

type PublishOpsResponse = {
  overall: {
    success: number;
    failed: number;
    totalFinished: number;
    successRate: number;
  };
  perPlatform: Array<{
    platform: string;
    success: number;
    failed: number;
    finished: number;
    successRate: number;
  }>;
  recentFailures: Array<{
    id: string;
    at: string;
    platform: string;
    videoTitle: string;
    errorMessage: string | null;
  }>;
  retryReasons: Array<{
    reason: string;
    count: number;
  }>;
};

function statusLabel(status: 'PENDING' | 'RUNNING' | 'SUCCESS' | 'FAILED' | 'CANCELED') {
  if (status === 'PENDING') return 'Oczekujące';
  if (status === 'RUNNING') return 'W trakcie';
  if (status === 'SUCCESS') return 'Sukces';
  if (status === 'FAILED') return 'Błąd';
  return 'Anulowane';
}

export default function AdminJobsPage() {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();
  const [jobs, setJobs] = useState<PublishJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<Record<'PENDING' | 'RUNNING' | 'SUCCESS' | 'FAILED' | 'CANCELED', number>>({
    PENDING: 0,
    RUNNING: 0,
    SUCCESS: 0,
    FAILED: 0,
    CANCELED: 0,
  });
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [ops, setOps] = useState<PublishOpsResponse | null>(null);
  const pageSize = 20;

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace('/login');
    }
  }, [isAuthenticated, isLoading, router]);

  useEffect(() => {
    const load = async () => {
      try {
        const offset = (page - 1) * pageSize;
        const [response, opsResponse] = await Promise.all([
          apiClient.get<PaginatedAdminJobsResponse>(`/admin/jobs?limit=${pageSize}&offset=${offset}`),
          apiClient.get<PublishOpsResponse>('/admin/publish-ops'),
        ]);
        setJobs(response.data.data);
        setSummary(response.data.summary);
        setTotalCount(response.data.totalCount);
        setHasMore(response.data.hasMore);
        setOps(opsResponse.data);
      } finally {
        setLoading(false);
      }
    };

    if (isAuthenticated) {
      setLoading(true);
      void load();
    }
  }, [isAuthenticated, page]);

  if (isLoading || !isAuthenticated) {
    return (
      <main className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-sm text-muted-foreground">Ładowanie sesji...</p>
      </main>
    );
  }

  return (
    <main className="flex-1 overflow-y-auto p-4 sm:p-6 pb-24 lg:pb-6 space-y-4">
          <h2 className="text-lg font-semibold text-foreground">Admin: statusy jobów</h2>

          {loading && <p className="text-sm text-muted-foreground">Ładowanie...</p>}

          {!loading && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                {Object.entries(summary).map(([key, value]) => (
                  <div key={key} className="bg-card border border-border rounded-xl p-4">
                    <p className="text-xs text-muted-foreground">{statusLabel(key as 'PENDING' | 'RUNNING' | 'SUCCESS' | 'FAILED' | 'CANCELED')}</p>
                    <p className="text-2xl font-semibold text-foreground mt-1">{value}</p>
                  </div>
                ))}
              </div>

              <div className="bg-card border border-border rounded-xl p-4 space-y-3">
                <h3 className="text-sm font-medium text-foreground">Panel operacyjny publikacji</h3>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="rounded-lg border border-border p-3">
                    <p className="text-xs text-muted-foreground">Skuteczność (łącznie)</p>
                    <p className="text-xl font-semibold text-foreground mt-1">
                      {ops ? `${ops.overall.successRate}%` : '-'}
                    </p>
                  </div>
                  <div className="rounded-lg border border-border p-3">
                    <p className="text-xs text-muted-foreground">SUKCES / BŁĄD</p>
                    <p className="text-xl font-semibold text-foreground mt-1">
                      {ops ? `${ops.overall.success} / ${ops.overall.failed}` : '-'}
                    </p>
                  </div>
                  <div className="rounded-lg border border-border p-3">
                    <p className="text-xs text-muted-foreground">Zamknięte joby</p>
                    <p className="text-xl font-semibold text-foreground mt-1">
                      {ops?.overall.totalFinished ?? '-'}
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">Skuteczność per platforma</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {(ops?.perPlatform ?? []).map((row) => (
                      <div key={row.platform} className="rounded-lg border border-border p-3">
                        <p className="text-sm text-foreground font-medium">{row.platform}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {row.successRate}% ({row.success} sukces / {row.failed} błąd)
                        </p>
                      </div>
                    ))}
                    {!ops?.perPlatform.length && (
                      <p className="text-sm text-muted-foreground">Brak danych platform.</p>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">Najczęstsze powody ponowień</p>
                  <div className="flex flex-wrap gap-2">
                    {(ops?.retryReasons ?? []).map((item) => (
                      <span
                        key={item.reason}
                        className="inline-flex items-center rounded-md border border-border px-2 py-1 text-xs text-foreground"
                      >
                        {item.reason} ({item.count})
                      </span>
                    ))}
                    {!ops?.retryReasons.length && (
                      <p className="text-sm text-muted-foreground">Brak powodów ponowień.</p>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">Ostatnie błędy</p>
                  <div className="space-y-2">
                    {(ops?.recentFailures ?? []).slice(0, 5).map((item) => (
                      <div key={item.id} className="rounded-lg border border-border p-3">
                        <p className="text-sm text-foreground font-medium">{item.platform} · {item.videoTitle}</p>
                        <p className="text-xs text-muted-foreground mt-1">{new Date(item.at).toLocaleString()}</p>
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                          {item.errorMessage || 'Brak komunikatu błędu'}
                        </p>
                      </div>
                    ))}
                    {!ops?.recentFailures.length && (
                      <p className="text-sm text-muted-foreground">Brak ostatnich błędów.</p>
                    )}
                  </div>
                </div>
              </div>

              <div className="bg-card border border-border rounded-xl p-4 space-y-3">
                <p className="text-sm text-muted-foreground">
                  Pokazano {jobs.length} z {totalCount} jobów (strona {page}/{Math.max(1, Math.ceil(totalCount / pageSize))})
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => setPage((current) => Math.max(1, current - 1))}
                    disabled={page <= 1}
                    className="px-4 py-2 bg-secondary/50 text-foreground rounded-lg hover:bg-secondary transition-all text-sm disabled:opacity-50"
                  >
                    Poprzednia
                  </button>
                  <button
                    onClick={() => setPage((current) => current + 1)}
                    disabled={!hasMore}
                    className="px-4 py-2 bg-primary text-primary-foreground rounded-lg transition-all text-sm disabled:opacity-50"
                  >
                    Następna
                  </button>
                </div>
              </div>
            </>
          )}
    </main>
  );
}
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Sidebar } from '@/components/Sidebar';
import { Header } from '@/components/Header';
import { useAuth } from '@/contexts/auth-context';
import { apiClient } from '@/lib/api-client';

type PaginatedJobsResponse = {
  data: PublishJob[];
  totalCount: number;
  hasMore: boolean;
};

type PublishJob = {
  id: string;
  status: 'PENDING' | 'RUNNING' | 'SUCCESS' | 'FAILED' | 'CANCELED';
  scheduledFor: string;
  socialAccountId?: string;
  remotePostUrl?: string | null;
  errorMessage?: string | null;
  video?: {
    title?: string;
  };
  socialAccount?: {
    platform?: 'YOUTUBE' | 'TIKTOK' | 'INSTAGRAM' | 'FACEBOOK';
  };
};

type JobBadge = {
  label: string;
  className: string;
};

function resolveJobBadge(job: PublishJob): JobBadge {
  if (job.status === 'SUCCESS') {
    return {
      label: 'Opublikowano',
      className: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600',
    };
  }

  if (job.status === 'RUNNING') {
    return {
      label: 'W trakcie',
      className: 'bg-blue-500/10 border-blue-500/30 text-blue-600',
    };
  }

  if (job.status === 'FAILED') {
    return {
      label: 'Błąd publikacji',
      className: 'bg-destructive/10 border-destructive/30 text-destructive',
    };
  }

  if (job.status === 'CANCELED') {
    return {
      label: 'Anulowano',
      className: 'bg-muted/40 border-border text-muted-foreground',
    };
  }

  if (job.errorMessage?.includes('[tiktok-tracking:')) {
    return {
      label: 'TikTok: oczekiwanie',
      className: 'bg-amber-500/10 border-amber-500/30 text-amber-600',
    };
  }

  if (job.errorMessage?.includes('[retry-attempt:')) {
    return {
      label: 'Retry zaplanowany',
      className: 'bg-amber-500/10 border-amber-500/30 text-amber-600',
    };
  }

  return {
    label: 'Zaplanowano',
    className: 'bg-secondary/50 border-border text-foreground',
  };
}

export default function SchedulePage() {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();
  const [jobs, setJobs] = useState<PublishJob[]>([]);
  const [jobsLoading, setJobsLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const pageSize = 10;

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace('/login');
    }
  }, [isAuthenticated, isLoading, router]);

  const loadJobs = async (targetPage: number) => {
    try {
      setJobsLoading(true);
      const offset = (targetPage - 1) * pageSize;
      const response = await apiClient.get<PaginatedJobsResponse>(
        `/jobs?limit=${pageSize}&offset=${offset}`,
      );
      setJobs(response.data.data);
      setTotalCount(response.data.totalCount);
      setHasMore(response.data.hasMore);
    } catch {
      toast.error('Nie udało się pobrać harmonogramu.');
    } finally {
      setJobsLoading(false);
    }
  };

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    void loadJobs(page);
  }, [isAuthenticated, page]);

  const runAction = async (jobId: string, action: 'cancel' | 'retry' | 'trigger') => {
    try {
      setActionId(jobId);
      const response = await apiClient.post<{
        success: boolean;
        immediateOutcome?: 'succeeded' | 'retryScheduled' | 'failed' | 'skipped' | null;
        publishJob?: {
          socialAccountId?: string;
          errorMessage?: string | null;
        };
      }>(`/publish-jobs/${jobId}/${action}`);

      const oauthScopeMissing =
        response.data.publishJob?.errorMessage?.includes('[oauth-scope-missing]') ?? false;

      if (oauthScopeMissing) {
        toast.error('Brak zgód TikTok do publikacji. Kliknij Połącz/Reconnect TikTok i zaakceptuj wszystkie zgody.');
        return;
      }

      toast.success(`Akcja ${action.toUpperCase()} wykonana.`);
      await loadJobs(page);
    } catch {
      toast.error(`Akcja ${action.toUpperCase()} nie powiodła się.`);
    } finally {
      setActionId(null);
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
    <div className="min-h-screen flex bg-background dark">
      <Sidebar />

      <div className="flex-1 flex flex-col min-w-0">
        <Header />

        <main className="flex-1 overflow-y-auto p-4 sm:p-6 pb-24 lg:pb-6">
          <section className="bg-card border border-border rounded-xl p-6 space-y-4">
            <h2 className="text-lg font-semibold text-foreground">Harmonogram publikacji</h2>

            {jobsLoading && (
              <p className="text-sm text-muted-foreground">Ładowanie harmonogramu...</p>
            )}

            {!jobsLoading && jobs.length === 0 && (
              <p className="text-sm text-muted-foreground">Brak zadań publikacji.</p>
            )}

            <div className="space-y-2">
              {jobs.map((job) => (
                (() => {
                  const badge = resolveJobBadge(job);

                  return (
                <div
                  key={job.id}
                  className="p-3 rounded-lg border border-border bg-secondary/20 flex flex-col gap-2"
                >
                  <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {job.video?.title ?? 'Bez nazwy'} • {job.socialAccount?.platform ?? 'N/A'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {job.status} • {new Date(job.scheduledFor).toLocaleString('pl-PL')}
                      </p>
                    </div>

                    <span
                      className={`px-2 py-1 rounded-md border text-xs font-medium ${badge.className}`}
                    >
                      {badge.label}
                    </span>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        onClick={() => runAction(job.id, 'trigger')}
                        disabled={actionId === job.id}
                        className="px-3 py-1.5 text-xs rounded-lg bg-primary/10 border border-primary/30 text-primary disabled:opacity-60"
                      >
                        Trigger
                      </button>
                      <button
                        onClick={() => runAction(job.id, 'retry')}
                        disabled={actionId === job.id}
                        className="px-3 py-1.5 text-xs rounded-lg bg-secondary border border-border text-foreground disabled:opacity-60"
                      >
                        Retry
                      </button>
                      <button
                        onClick={() => runAction(job.id, 'cancel')}
                        disabled={actionId === job.id}
                        className="px-3 py-1.5 text-xs rounded-lg bg-destructive/10 border border-destructive/30 text-destructive disabled:opacity-60"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>

                  {job.errorMessage && (
                    <p className="text-xs text-destructive">{job.errorMessage}</p>
                  )}

                  {job.status === 'SUCCESS' && job.remotePostUrl && (
                    <a
                      href={job.remotePostUrl}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="inline-flex w-fit items-center rounded-md border border-primary/30 bg-primary/10 px-2 py-1 text-xs font-medium text-primary hover:bg-primary/20"
                    >
                      Otwórz post
                    </a>
                  )}
                </div>
                  );
                })()
              ))}
            </div>

            <div className="pt-2 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <p className="text-sm text-muted-foreground">
                Pokazano {jobs.length} z {totalCount} zadań (strona {page}/{Math.max(1, Math.ceil(totalCount / pageSize))})
              </p>
              <div className="flex gap-2 self-end sm:self-auto">
                <button
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  disabled={jobsLoading || page <= 1}
                  className="px-4 py-2 bg-secondary/50 text-foreground rounded-lg hover:bg-secondary transition-all text-sm disabled:opacity-50"
                >
                  Poprzednia
                </button>
                <button
                  onClick={() => setPage((current) => current + 1)}
                  disabled={jobsLoading || !hasMore}
                  className="px-4 py-2 bg-primary text-primary-foreground rounded-lg transition-all text-sm disabled:opacity-50"
                >
                  Następna
                </button>
              </div>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
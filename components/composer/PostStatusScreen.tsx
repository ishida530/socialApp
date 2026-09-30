import { useEffect, useState } from 'react';
import { CheckCircle2, Clock, XCircle, RotateCw, ExternalLink, Info } from 'lucide-react';
import { toast } from 'sonner';
import { apiClient } from '@/lib/api-client';
import { PLATFORM_LABEL } from './types';
import type { DraftJob } from './types';
import { getJobStatusDisplay } from './job-status-display';

// TikTok guideline 5e ("users can understand the status of their posts"): the server already
// polls TikTok's publish/status/fetch - this screen now re-reads the jobs so that progress
// actually reaches the user instead of freezing on the snapshot taken right after "Publish".
const STATUS_POLL_INTERVAL_MS = 10_000;
const STATUS_POLL_MAX_MS = 15 * 60 * 1000;

export function PostStatusScreen({ jobs: initialJobs, onStartNewPost }: { jobs: DraftJob[]; onStartNewPost: () => void }) {
  const [jobs, setJobs] = useState(initialJobs);
  const [busyJobId, setBusyJobId] = useState<string | null>(null);
  const video = jobs[0]?.video;
  const postGroupId = initialJobs[0]?.postGroupId;
  const anyInProgress = jobs.some((job) => getJobStatusDisplay(job).kind === 'processing');
  const hasTikTok = jobs.some((job) => job.socialAccount.platform === 'TIKTOK');

  useEffect(() => {
    setJobs(initialJobs);
  }, [initialJobs]);

  useEffect(() => {
    if (!postGroupId || !anyInProgress) {
      return;
    }

    const startedAt = Date.now();
    let cancelled = false;
    const timer = setInterval(async () => {
      if (Date.now() - startedAt > STATUS_POLL_MAX_MS) {
        clearInterval(timer);
        return;
      }
      try {
        // Runs any TikTok status check that's due now (see status-refresh route) before reading.
        await apiClient.post('/publish-jobs/status-refresh', { postGroupId }).catch(() => null);
        const response = await apiClient.get<DraftJob[]>('/publish-jobs', { params: { postGroupId } });
        if (!cancelled && response.data.length > 0) {
          setJobs(response.data);
        }
      } catch {
        // transient - the next tick retries
      }
    }, STATUS_POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [postGroupId, anyInProgress]);

  const handleRetry = async (jobId: string) => {
    setBusyJobId(jobId);
    try {
      await apiClient.post(`/publish-jobs/${jobId}/retry`);
      toast.success('Ponowiono próbę publikacji.');
      setJobs((current) =>
        current.map((job) =>
          job.id === jobId ? { ...job, status: 'PENDING', errorMessage: null, scheduledFor: new Date().toISOString() } : job,
        ),
      );
    } catch {
      toast.error('Nie udało się ponowić publikacji.');
    } finally {
      setBusyJobId(null);
    }
  };

  const handleReconnect = async (socialAccountId: string) => {
    setBusyJobId(socialAccountId);
    try {
      const response = await apiClient.post<{ url: string }>(`/social-accounts/${socialAccountId}/reconnect`);
      window.location.assign(response.data.url);
    } catch {
      toast.error('Nie udało się rozpocząć ponownego łączenia konta.');
      setBusyJobId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border bg-background/40 p-3">
        <div className="mx-auto w-full max-w-[220px] rounded-2xl overflow-hidden border border-border bg-card aspect-[9/16]">
          {video?.mediaType === 'IMAGE' ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={video.sourceUrl} alt={video.title} className="w-full h-full object-cover" />
          ) : video ? (
            <video src={video.sourceUrl} className="w-full h-full object-cover" muted />
          ) : null}
        </div>
      </div>

      {hasTikTok && (
        <p className="text-xs text-muted-foreground flex items-start gap-1.5">
          <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          TikTok może potrzebować kilku minut na przetworzenie posta, zanim pojawi się on na Twoim profilu. Status
          poniżej odświeża się automatycznie.
        </p>
      )}

      <div className="space-y-2">
        {jobs.map((job) => {
          const platform = job.socialAccount.platform;
          const isBusy = busyJobId === job.id || busyJobId === job.socialAccountId;
          const display = getJobStatusDisplay(job);

          return (
            <div key={job.id} className="rounded-xl border border-border bg-secondary/20 p-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                {display.kind === 'success' ? (
                  <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" />
                ) : display.kind === 'failed' ? (
                  <XCircle className="w-5 h-5 text-destructive shrink-0" />
                ) : (
                  <Clock className="w-5 h-5 text-amber-500 shrink-0" />
                )}
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">
                    {PLATFORM_LABEL[platform]}
                    {job.socialAccount.handle ? (
                      <span className="text-muted-foreground font-normal"> · {job.socialAccount.handle}</span>
                    ) : null}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {display.kind === 'failed' ? `${platform}: ${display.label}` : display.label}
                  </p>
                  {display.kind === 'success' && display.url && (
                    <a
                      href={display.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-primary inline-flex items-center gap-1 mt-0.5 hover:underline"
                    >
                      Zobacz post <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              </div>

              {display.kind === 'failed' && (
                <button
                  onClick={() => (display.needsReconnect ? handleReconnect(job.socialAccountId) : handleRetry(job.id))}
                  disabled={isBusy}
                  className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium disabled:opacity-60"
                >
                  <RotateCw className="w-3.5 h-3.5" />
                  {display.needsReconnect ? 'Połącz ponownie' : 'Ponów'}
                </button>
              )}
            </div>
          );
        })}
      </div>

      <button
        onClick={onStartNewPost}
        className="w-full px-4 py-3 rounded-xl bg-secondary/60 text-foreground text-sm font-medium"
      >
        Dodaj kolejny post
      </button>
    </div>
  );
}

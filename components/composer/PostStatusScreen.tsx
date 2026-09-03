import { useState } from 'react';
import { CheckCircle2, Clock, XCircle, RotateCw } from 'lucide-react';
import { toast } from 'sonner';
import { apiClient } from '@/lib/api-client';
import { PLATFORM_LABEL } from './types';
import type { DraftJob } from './types';

function needsReconnect(errorMessage: string | null) {
  if (!errorMessage) {
    return false;
  }
  return (
    errorMessage.includes('oauth-scope-missing') ||
    errorMessage.includes('permission-missing') ||
    errorMessage.includes('unaudited-client')
  );
}

function friendlyError(errorMessage: string | null) {
  if (!errorMessage) {
    return 'Publikacja nie powiodła się.';
  }
  const withoutTags = errorMessage.replace(/^\[[a-z0-9-]+\]\s*/i, '');
  return withoutTags || 'Publikacja nie powiodła się.';
}

export function PostStatusScreen({ jobs, onStartNewPost }: { jobs: DraftJob[]; onStartNewPost: () => void }) {
  const [busyJobId, setBusyJobId] = useState<string | null>(null);
  const video = jobs[0]?.video;

  const handleRetry = async (jobId: string) => {
    setBusyJobId(jobId);
    try {
      await apiClient.post(`/publish-jobs/${jobId}/retry`);
      toast.success('Ponowiono próbę publikacji.');
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

      <div className="space-y-2">
        {jobs.map((job) => {
          const platform = job.socialAccount.platform;
          const isBusy = busyJobId === job.id || busyJobId === job.socialAccountId;

          return (
            <div key={job.id} className="rounded-xl border border-border bg-secondary/20 p-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                {job.status === 'SUCCESS' ? (
                  <CheckCircle2 className="w-5 h-5 text-green-500" />
                ) : job.status === 'FAILED' ? (
                  <XCircle className="w-5 h-5 text-destructive" />
                ) : (
                  <Clock className="w-5 h-5 text-amber-500" />
                )}
                <div>
                  <p className="text-sm font-medium text-foreground">{PLATFORM_LABEL[platform]}</p>
                  <p className="text-xs text-muted-foreground">
                    {job.status === 'SUCCESS'
                      ? 'Opublikowano'
                      : job.status === 'FAILED'
                        ? `${platform}: ${friendlyError(job.errorMessage)}`
                        : 'Zaplanowane — publikacja tego dnia (patrz uwaga o cronie)'}
                  </p>
                </div>
              </div>

              {job.status === 'FAILED' && (
                <button
                  onClick={() =>
                    needsReconnect(job.errorMessage) ? handleReconnect(job.socialAccountId) : handleRetry(job.id)
                  }
                  disabled={isBusy}
                  className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium disabled:opacity-60"
                >
                  <RotateCw className="w-3.5 h-3.5" />
                  {needsReconnect(job.errorMessage) ? 'Połącz ponownie' : 'Ponów'}
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

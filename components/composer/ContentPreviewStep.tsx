import { PLATFORM_LABEL } from './types';
import type { DraftJob, Platform } from './types';
import { PlatformCaptionTab } from './PlatformCaptionTab';

export function ContentPreviewStep({
  jobs,
  activeTab,
  askExplicit,
  onSetActiveTab,
  onUpdateField,
  onSaveNow,
  onRegenerate,
  onAnswerExplicit,
}: {
  jobs: DraftJob[];
  activeTab: Platform | null;
  askExplicit: boolean;
  onSetActiveTab: (platform: Platform) => void;
  onUpdateField: (jobId: string, patch: Record<string, unknown>) => void;
  onSaveNow: (jobId: string, patch: Record<string, unknown>) => Promise<unknown>;
  onRegenerate: (jobId: string) => Promise<void>;
  onAnswerExplicit: (isExplicit: boolean) => void;
}) {
  const activeJob = jobs.find((job) => job.socialAccount.platform === activeTab) ?? jobs[0] ?? null;
  const video = activeJob?.video;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[240px_minmax(0,1fr)] gap-4 items-start">
      {askExplicit && (
        <div className="lg:col-span-2 rounded-2xl border border-primary/30 bg-primary/5 p-4 space-y-2">
          <p className="text-sm font-medium text-foreground">Czy ta treść zawiera wulgaryzmy (explicit)?</p>
          <p className="text-xs text-muted-foreground">
            Pytamy raz — zapamiętamy Twoją odpowiedź jako domyślną dla kolejnych postów.
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => onAnswerExplicit(true)}
              className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium"
            >
              Tak, explicit
            </button>
            <button
              onClick={() => onAnswerExplicit(false)}
              className="px-3 py-1.5 rounded-lg bg-secondary/60 text-foreground text-xs"
            >
              Nie
            </button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        <div className="rounded-2xl border border-border bg-background/40 p-3">
          <p className="text-xs text-muted-foreground mb-2">Podgląd materiału</p>
          <div className="mx-auto w-full rounded-2xl overflow-hidden border border-border bg-card aspect-[9/16]">
            {video?.mediaType === 'IMAGE' ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={video.sourceUrl} alt={video.title} className="w-full h-full object-cover" />
            ) : video ? (
              <video src={video.sourceUrl} className="w-full h-full object-cover" muted />
            ) : null}
          </div>
        </div>

        <div className="flex lg:flex-col gap-2 overflow-x-auto lg:overflow-visible">
          {jobs.map((job) => {
            const platform = job.socialAccount.platform;
            const hasCaption = job.caption.trim().length > 0;
            const hasWarnings = job.contentWarnings.length > 0;

            return (
              <button
                key={job.id}
                onClick={() => onSetActiveTab(platform)}
                className={`min-w-[140px] lg:min-w-0 rounded-xl border px-3 py-2 text-left transition-all ${
                  activeTab === platform
                    ? 'bg-primary/10 border-primary/30'
                    : 'bg-secondary/40 border-border hover:bg-secondary/60'
                }`}
              >
                <p className="text-sm font-medium text-foreground">{PLATFORM_LABEL[platform]}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1">
                  {hasWarnings ? '⚠ Uwaga' : hasCaption ? 'Gotowe' : 'Generuję...'}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-secondary/20 p-4">
        {activeJob ? (
          <PlatformCaptionTab
            key={activeJob.id}
            job={activeJob}
            onUpdateField={onUpdateField}
            onSaveNow={onSaveNow}
            onRegenerate={onRegenerate}
          />
        ) : (
          <p className="text-sm text-muted-foreground">Brak platform do edycji.</p>
        )}
      </div>
    </div>
  );
}

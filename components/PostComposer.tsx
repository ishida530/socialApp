import Link from 'next/link';
import { Sparkles, Link2 } from 'lucide-react';
import { usePostComposerState } from './composer/usePostComposerState';
import { MediaStep } from './composer/MediaStep';
import { ContentPreviewStep } from './composer/ContentPreviewStep';
import { ScheduleStep } from './composer/ScheduleStep';
import { PostStatusScreen } from './composer/PostStatusScreen';

const STEP_LABELS: Record<'media' | 'content' | 'schedule', string> = {
  media: 'Materiał',
  content: 'Treść',
  schedule: 'Kiedy i gdzie',
};

export function PostComposer() {
  const { state, actions } = usePostComposerState();

  if (state.step === 'gate') {
    return (
      <div className="h-full w-full bg-card flex items-center justify-center p-6">
        <p className="text-sm text-muted-foreground">Sprawdzanie połączonych kont...</p>
      </div>
    );
  }

  if (state.step === 'blocked') {
    return (
      <div className="h-full w-full bg-card flex flex-col items-center justify-center p-6 text-center gap-4">
        <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center">
          <Link2 className="w-8 h-8 text-primary" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-foreground">Połącz pierwsze konto</h2>
          <p className="text-sm text-muted-foreground mt-1 max-w-sm">
            Zanim dodasz pierwszy post, podłącz przynajmniej jedną platformę (YouTube, TikTok, Instagram lub
            Facebook).
          </p>
        </div>
        <Link
          href="/social-accounts"
          className="px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium"
        >
          Połącz konto
        </Link>
      </div>
    );
  }

  const showStepNav = state.step === 'media' || state.step === 'content' || state.step === 'schedule';
  const activeStepForNav = state.step === 'media' || state.step === 'content' || state.step === 'schedule' ? state.step : null;

  return (
    <div id="post-composer" className="h-full w-full bg-card flex flex-col">
      <div className="p-6 border-b border-border">
        <h2 className="text-lg font-semibold text-foreground">Nowy post</h2>
        <p className="text-xs text-muted-foreground mt-1">
          {state.step === 'status' ? 'Status publikacji' : 'AI dopasowuje treść pod każdą platformę automatycznie.'}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="space-y-4">
          {showStepNav && (
            <div className="rounded-2xl border border-border bg-secondary/20 p-3">
              <div className="flex gap-2 overflow-x-auto pb-1 sm:grid sm:grid-cols-3 sm:overflow-visible sm:pb-0">
                {(['media', 'content', 'schedule'] as const).map((step, index) => {
                  const isActive = step === activeStepForNav;
                  return (
                    <div
                      key={step}
                      className={`min-w-[110px] sm:min-w-0 rounded-xl border px-3 py-2 text-left ${
                        isActive ? 'bg-primary/10 border-primary/30' : 'bg-secondary/30 border-border'
                      }`}
                    >
                      <p className="text-[11px] text-muted-foreground">Krok {index + 1}</p>
                      <p className="text-sm font-medium text-foreground">{STEP_LABELS[step]}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {state.step === 'media' && (
            <MediaStep
              contentType={state.contentType}
              songTitle={state.songTitle}
              video={state.video}
              isStarting={state.isStarting}
              resumeAvailable={Boolean(state.resumeCandidate)}
              tiktokConnected={state.connectedAccounts.some((account) => account.platform === 'TIKTOK')}
              onContentTypeChange={actions.setContentType}
              onSongTitleChange={actions.setSongTitle}
              onVideoResolved={actions.setVideo}
              onResume={actions.resumeGroup}
              onDiscardResume={actions.discardResume}
              onContinue={actions.startComposing}
            />
          )}

          {state.step === 'adapting' && (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
              <Sparkles className="w-8 h-8 text-primary animate-pulse" />
              <p className="text-sm text-foreground font-medium">AI dopasowuje treść pod każdą platformę...</p>
              <p className="text-xs text-muted-foreground">To zwykle trwa kilka-kilkanaście sekund.</p>
            </div>
          )}

          {state.step === 'content' && (
            <ContentPreviewStep
              jobs={state.jobs}
              activeTab={state.activeTab}
              askExplicit={state.askExplicit}
              onSetActiveTab={actions.setActiveTab}
              onUpdateField={actions.updateJobField}
              onSaveNow={actions.saveJobFieldNow}
              onRegenerate={actions.regenerateJob}
              onAnswerExplicit={actions.answerDefaultExplicit}
            />
          )}

          {state.step === 'schedule' && (
            <ScheduleStep
              jobs={state.jobs}
              selectedPlatforms={state.selectedPlatforms}
              scheduledAt={state.scheduledAt}
              isSubmitting={state.isSubmitting}
              youtubeExcludedForImage={
                state.video?.mediaType === 'IMAGE' &&
                state.connectedAccounts.some((account) => account.platform === 'YOUTUBE') &&
                !state.jobs.some((job) => job.socialAccount.platform === 'YOUTUBE')
              }
              onTogglePlatform={actions.togglePlatform}
              onScheduledAtChange={actions.setScheduledAt}
              onSubmit={actions.finalize}
            />
          )}

          {state.step === 'status' && state.finalizedJobs && (
            <PostStatusScreen jobs={state.finalizedJobs} onStartNewPost={actions.startNewPost} />
          )}
        </div>
      </div>

      {state.step === 'content' && (
        <div className="border-t border-border p-3 sm:p-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
          <div className="flex items-center justify-between gap-3">
            <button onClick={actions.goBack} className="px-4 py-2.5 rounded-lg bg-secondary/50 text-foreground text-sm">
              Wstecz
            </button>
            <button
              onClick={actions.goToSchedule}
              className="px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm"
            >
              Dalej
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

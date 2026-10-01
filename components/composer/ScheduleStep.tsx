import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Calendar, Info, Send } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import {
  PLATFORM_LABEL,
  TIKTOK_BRANDED_CONTENT_POLICY_URL,
  TIKTOK_MUSIC_USAGE_URL,
  YOUTUBE_PRIVACY_OPTIONS,
  YOUTUBE_TERMS_URL,
} from './types';
import type { DraftJob, Platform } from './types';
import { useTikTokCreatorInfo } from './useTikTokCreatorInfo';
import {
  TikTokCannotPostNotice,
  TikTokCreatorBadge,
  TikTokSettingsPanel,
  TIKTOK_PROMPT_BRANDED_NOT_PRIVATE,
  TIKTOK_PROMPT_INCOMPLETE_DISCLOSURE,
} from './TikTokSettingsPanel';

function nextSuggestedSlot(from = new Date()) {
  for (let addDays = 0; addDays < 8; addDays += 1) {
    const candidate = new Date(from);
    candidate.setDate(candidate.getDate() + addDays);
    candidate.setHours(19, 0, 0, 0);
    const dayOfWeek = candidate.getDay();
    if ((dayOfWeek === 4 || dayOfWeek === 5) && candidate.getTime() > from.getTime()) {
      return candidate;
    }
  }

  const fallback = new Date(from);
  fallback.setDate(fallback.getDate() + 1);
  fallback.setHours(19, 0, 0, 0);
  return fallback;
}

function toDatetimeLocalValue(date: Date) {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function ScheduleStep({
  jobs,
  selectedPlatforms,
  scheduledAt,
  isSubmitting,
  youtubeExcludedForImage,
  onTogglePlatform,
  onScheduledAtChange,
  onSaveJobField,
  onSubmit,
}: {
  jobs: DraftJob[];
  selectedPlatforms: Set<Platform>;
  scheduledAt: string;
  isSubmitting: boolean;
  youtubeExcludedForImage?: boolean;
  onTogglePlatform: (platform: Platform) => void;
  onScheduledAtChange: (value: string) => void;
  onSaveJobField: (jobId: string, patch: Record<string, unknown>) => Promise<unknown>;
  onSubmit: (publishNow: boolean, tiktokPostingConsent: boolean) => void;
}) {
  const suggested = useMemo(() => nextSuggestedSlot(), []);
  const [mode, setMode] = useState<'now' | 'schedule'>('now');

  const tiktokJob = jobs.find((job) => job.socialAccount.platform === 'TIKTOK');
  const tiktokSelected = selectedPlatforms.has('TIKTOK');
  // Guideline 1: latest creator info fetched again when rendering the actual "Post to TikTok"
  // step - not reused from the review step, which could be minutes old by now.
  const tiktokCreator = useTikTokCreatorInfo(tiktokSelected ? tiktokJob?.socialAccountId : null);
  const [isSavingConsent, setIsSavingConsent] = useState(false);

  const creatorInfo = tiktokCreator.data?.creatorInfo ?? null;
  const tiktokCanPost = tiktokCreator.data?.canPost === true;
  const tiktokDurationTooLong =
    tiktokJob?.video.mediaType === 'VIDEO' &&
    typeof creatorInfo?.max_video_post_duration_sec === 'number' &&
    tiktokJob.video.durationSec !== null &&
    tiktokJob.video.durationSec > creatorInfo.max_video_post_duration_sec;
  // Commercial Content Disclosure (2026-09-30, TikTok audit rejection ref 20260913074631): if
  // the disclosure toggle is on, at least one of Your Brand / Branded Content must be chosen -
  // "if the toggle is turned on but no options are selected, the publish button should be
  // disabled" (guideline section 3a).
  const tiktokDisclosureReady =
    !tiktokJob?.tiktokDisclosureEnabled || Boolean(tiktokJob?.tiktokBrandOrganic || tiktokJob?.tiktokBrandedContent);
  const tiktokBrandedPrivacyOk = !(tiktokJob?.tiktokBrandedContent && tiktokJob?.tiktokPrivacyLevel === 'SELF_ONLY');
  const tiktokConsented = Boolean(tiktokJob?.tiktokConsentAt);

  // First unmet requirement, shown under the publish button AND as its hover text.
  const tiktokBlockReason: string | null = !tiktokSelected
    ? null
    : tiktokCreator.isLoading
      ? 'Sprawdzanie konta TikTok...'
      : !tiktokCreator.data
        ? tiktokCreator.loadError ?? 'Nie udało się pobrać ustawień konta TikTok.'
        : !tiktokCanPost
          ? tiktokCreator.data.cannotPostReason ?? 'TikTok nie pozwala teraz publikować. Spróbuj ponownie później.'
          : tiktokDurationTooLong
            ? `Materiał przekracza limit długości TikTok dla tego konta (${creatorInfo?.max_video_post_duration_sec}s).`
            : !tiktokJob?.tiktokPrivacyLevel
              ? 'Wybierz, kto może zobaczyć post na TikToku (Who can view this post).'
              : !tiktokDisclosureReady
                ? TIKTOK_PROMPT_INCOMPLETE_DISCLOSURE
                : !tiktokBrandedPrivacyOk
                  ? TIKTOK_PROMPT_BRANDED_NOT_PRIVATE
                  : !tiktokConsented
                    ? 'Zaznacz zgodę TikToka (Music Usage Confirmation) nad przyciskiem.'
                    : null;
  const tiktokReady = tiktokBlockReason === null;

  // YouTube API Services Developer Policies (2026-10-01): the user has final control over what is
  // published - an explicitly chosen visibility (no default) and the exact title/description that
  // will be sent, shown here before Publish.
  const youtubeJob = jobs.find((job) => job.socialAccount.platform === 'YOUTUBE');
  const youtubeSelected = selectedPlatforms.has('YOUTUBE') && Boolean(youtubeJob);
  const youtubeTitle = youtubeJob?.title?.trim() ?? '';
  const youtubeDescription = youtubeJob
    ? [youtubeJob.caption, youtubeJob.hashtags.map((tag) => `#${tag}`).join(' ')].filter(Boolean).join('\n\n')
    : '';
  const youtubeBlockReason: string | null = !youtubeSelected
    ? null
    : !youtubeTitle
      ? 'Uzupełnij tytuł filmu YouTube w kroku przeglądu.'
      : !youtubeJob?.youtubePrivacyStatus
        ? 'Wybierz widoczność filmu na YouTube.'
        : null;
  const [isSavingYoutube, setIsSavingYoutube] = useState(false);

  const handleYoutubePrivacyChange = async (value: string) => {
    if (!youtubeJob) {
      return;
    }
    setIsSavingYoutube(true);
    try {
      await onSaveJobField(youtubeJob.id, { youtubePrivacyStatus: value });
    } catch {
      toast.error('Nie udało się zapisać widoczności YouTube.');
    } finally {
      setIsSavingYoutube(false);
    }
  };

  const canPublishNow = selectedPlatforms.size > 0 && tiktokReady && youtubeBlockReason === null;
  const canSchedule = canPublishNow && Boolean(scheduledAt);
  const canSubmit = mode === 'now' ? canPublishNow : canSchedule;
  const submitBlockReason =
    selectedPlatforms.size === 0
      ? 'Wybierz co najmniej jedną platformę.'
      : tiktokBlockReason ??
        youtubeBlockReason ??
        (mode === 'schedule' && !scheduledAt ? 'Wybierz termin publikacji.' : null);

  const brandedContent = tiktokJob?.tiktokBrandedContent === true;
  const previewVideo = (tiktokJob ?? jobs[0])?.video ?? null;

  const handleConsentChange = async (checked: boolean) => {
    if (!tiktokJob) {
      return;
    }
    setIsSavingConsent(true);
    try {
      await onSaveJobField(tiktokJob.id, { tiktokConsent: checked });
    } catch {
      toast.error('Nie udało się zapisać zgody. Spróbuj ponownie.');
    } finally {
      setIsSavingConsent(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_280px] gap-4 items-start">
      <div className="space-y-4">
        <div className="rounded-2xl border border-border bg-secondary/20 p-3 space-y-3">
          <div>
            <p className="text-sm font-medium text-foreground">Publikuj na</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Domyślnie wszystkie platformy z poprzedniego kroku — odznacz, jeśli którejś teraz nie chcesz.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {jobs.map((job) => {
              const platform = job.socialAccount.platform;
              const isSelected = selectedPlatforms.has(platform);

              return (
                <button
                  key={job.id}
                  onClick={() => onTogglePlatform(platform)}
                  className={`px-3 py-2 rounded-lg text-xs font-medium transition-all border ${
                    isSelected
                      ? 'bg-primary/15 border-primary/40 text-foreground'
                      : 'bg-secondary/40 border-border text-muted-foreground'
                  }`}
                >
                  {PLATFORM_LABEL[platform]}
                </button>
              );
            })}
          </div>


          {youtubeExcludedForImage && (
            <p className="text-xs text-muted-foreground">
              YouTube pominięty — nie obsługuje publikacji zdjęć jako posta.
            </p>
          )}
        </div>

        <div className="rounded-2xl border border-border bg-secondary/20 p-3 space-y-3">
          <p className="text-sm font-medium text-foreground">Kiedy</p>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setMode('now')}
              className={`px-3 py-2 rounded-lg text-sm font-medium border transition-all ${
                mode === 'now' ? 'bg-primary/15 border-primary/40 text-foreground' : 'bg-secondary/40 border-border text-muted-foreground'
              }`}
            >
              Teraz
            </button>
            <button
              onClick={() => setMode('schedule')}
              className={`px-3 py-2 rounded-lg text-sm font-medium border transition-all ${
                mode === 'schedule' ? 'bg-primary/15 border-primary/40 text-foreground' : 'bg-secondary/40 border-border text-muted-foreground'
              }`}
            >
              Zaplanuj
            </button>
          </div>

          {mode === 'schedule' && (
            <div className="space-y-3 pt-1">
              <label className="flex items-center gap-2 text-sm font-medium text-foreground">
                <Calendar className="w-4 h-4" />
                Termin
              </label>

              <input
                type="datetime-local"
                value={scheduledAt}
                onChange={(event) => onScheduledAtChange(event.target.value)}
                className="w-full px-4 py-2.5 bg-secondary/30 border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              />

              <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
                <p className="text-xs text-muted-foreground">
                  Proponowany termin: {suggested.toLocaleString('pl-PL', { dateStyle: 'medium', timeStyle: 'short' })}
                </p>
                <button
                  onClick={() => onScheduledAtChange(toDatetimeLocalValue(suggested))}
                  className="mt-2 px-3 py-1.5 rounded-lg border border-primary/30 bg-primary text-primary-foreground text-xs"
                >
                  Użyj
                </button>
              </div>

              <p className="text-xs text-muted-foreground flex items-start gap-1.5">
                <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                Publikacja tego dnia — dokładna godzina zależy od crona (Vercel Hobby: raz na dobę), więc traktuj
                godzinę jako orientacyjną, nie co-do-minuty.
              </p>
            </div>
          )}
        </div>

        {tiktokSelected && tiktokJob && (
          // TikTok Content Sharing Guidelines 2b/2c/3 (2026-09-30): the post settings sit on the
          // same "Post to TikTok" page as the nickname, the declaration and the Publish button -
          // not on an earlier step the reviewer (or user) has already left.
          <div className="rounded-2xl border border-border bg-secondary/20 p-3">
            <TikTokSettingsPanel
              job={tiktokJob}
              creator={tiktokCreator}
              onSaveNow={(patch) => onSaveJobField(tiktokJob.id, patch)}
            />
          </div>
        )}

        {youtubeSelected && youtubeJob && (
          <div className="rounded-2xl border border-border bg-secondary/20 p-3 space-y-3">
            <p className="text-sm font-medium text-foreground">Publikacja na YouTube (YouTube upload)</p>
            <div className="rounded-lg border border-border bg-background/40 p-2 text-xs text-foreground space-y-1">
              <p>
                <span className="text-muted-foreground">Tytuł (Title): </span>
                {youtubeTitle || <span className="text-destructive">brak - uzupełnij w kroku przeglądu</span>}
              </p>
              <p className="text-muted-foreground">Opis (Description):</p>
              <p className="whitespace-pre-wrap break-words line-clamp-6">{youtubeDescription}</p>
            </div>
            <div>
              <label htmlFor={`youtube-privacy-${youtubeJob.id}`} className="text-xs text-muted-foreground mb-2 block">
                Widoczność filmu (Visibility)
              </label>
              <select
                id={`youtube-privacy-${youtubeJob.id}`}
                value={youtubeJob.youtubePrivacyStatus ?? ''}
                onChange={(event) => handleYoutubePrivacyChange(event.target.value)}
                disabled={isSavingYoutube}
                className="w-full px-3 py-2 bg-secondary/30 border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              >
                <option value="" disabled>
                  -- wybierz (select) --
                </option>
                {YOUTUBE_PRIVACY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <p className="text-xs text-muted-foreground">
              Publikując na YouTube, akceptujesz{' '}
              <a href={YOUTUBE_TERMS_URL} target="_blank" rel="noopener noreferrer" className="text-primary underline">
                Warunki korzystania z YouTube (YouTube Terms of Service)
              </a>
              .
            </p>
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-border bg-secondary/20 p-3 space-y-3">
        {previewVideo && (
          // Guideline 5a: preview of exactly what will be posted, on the publish step itself.
          <div className="mx-auto w-full max-w-[160px] rounded-xl overflow-hidden border border-border bg-card aspect-[9/16]">
            {previewVideo.mediaType === 'IMAGE' ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={previewVideo.sourceUrl} alt={previewVideo.title} className="w-full h-full object-cover" />
            ) : (
              <video src={previewVideo.sourceUrl} className="w-full h-full object-cover" controls muted playsInline />
            )}
          </div>
        )}

        {tiktokSelected && tiktokJob && (
          <div className="rounded-lg border border-border bg-background/40 p-2 text-xs text-foreground space-y-1">
            {tiktokJob.video.mediaType === 'IMAGE' && tiktokJob.title?.trim() && (
              <p className="font-medium">{tiktokJob.title}</p>
            )}
            <p className="whitespace-pre-wrap break-words line-clamp-6">
              {tiktokJob.caption}
              {tiktokJob.hashtags.length > 0 ? ` ${tiktokJob.hashtags.map((tag) => `#${tag}`).join(' ')}` : ''}
            </p>
          </div>
        )}

        {tiktokSelected && tiktokJob && (
          // TikTok's "Post to TikTok" block, directly above the publish button (guidelines 1a, 1b,
          // 4, 5c, 5d): which account, whether it can post now, the exact declaration the user
          // consents to, and the heads-up that processing takes a few minutes.
          <div className="space-y-2">
            {tiktokCreator.isLoading ? (
              <p className="text-xs text-muted-foreground">Sprawdzanie konta TikTok...</p>
            ) : (
              <>
                <TikTokCreatorBadge info={tiktokCreator.data} />
                {tiktokCreator.data && !tiktokCanPost && (
                  <TikTokCannotPostNotice
                    reason={tiktokCreator.data.cannotPostReason ?? 'TikTok nie pozwala teraz publikować.'}
                    onRetry={tiktokCreator.reload}
                  />
                )}
                {!tiktokCreator.data && tiktokCreator.loadError && (
                  <p className="text-xs text-destructive">{tiktokCreator.loadError}</p>
                )}
              </>
            )}

            <label className="flex items-start gap-2 rounded-lg border border-border bg-background/40 p-3">
              <Checkbox
                checked={tiktokConsented}
                onCheckedChange={(checked) => handleConsentChange(checked === true)}
                disabled={isSavingConsent}
                className="mt-0.5"
              />
              <span className="text-xs text-foreground">
                By posting, you agree to TikTok&apos;s{' '}
                {brandedContent && (
                  <>
                    <a
                      href={TIKTOK_BRANDED_CONTENT_POLICY_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary underline"
                    >
                      Branded Content Policy
                    </a>{' '}
                    and{' '}
                  </>
                )}
                <a href={TIKTOK_MUSIC_USAGE_URL} target="_blank" rel="noopener noreferrer" className="text-primary underline">
                  Music Usage Confirmation
                </a>
                .
              </span>
            </label>

          </div>
        )}

        {/* Hover text on the disabled button (guideline 3a) - a disabled <button> swallows pointer
            events in some browsers, so the title lives on this wrapper and the button itself
            ignores the pointer while disabled. */}
        <div title={!canSubmit && submitBlockReason ? submitBlockReason : undefined}>
          <button
            onClick={() => onSubmit(mode === 'now', tiktokSelected && tiktokConsented)}
            disabled={!canSubmit || isSubmitting}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-medium disabled:opacity-60 disabled:pointer-events-none"
          >
            <Send className="w-4 h-4" />
            {isSubmitting ? 'Wysyłanie...' : mode === 'now' ? 'Opublikuj teraz' : 'Zaplanuj'}
          </button>
        </div>
        {!canSubmit && submitBlockReason && <p className="text-xs text-destructive">{submitBlockReason}</p>}

        {tiktokSelected && tiktokJob && (
          <p className="text-xs text-muted-foreground flex items-start gap-1.5">
            <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            Po publikacji TikTok przetwarza materiał — może minąć kilka minut, zanim post pojawi się na Twoim
            profilu. (After publishing, it may take a few minutes for the content to process and be visible on
            your profile.)
          </p>
        )}
      </div>
    </div>
  );
}

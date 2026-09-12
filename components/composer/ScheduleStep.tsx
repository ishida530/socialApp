import { useMemo, useState } from 'react';
import { Calendar, Info, Send } from 'lucide-react';
import { PLATFORM_LABEL } from './types';
import type { DraftJob, Platform } from './types';

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
  onSubmit,
}: {
  jobs: DraftJob[];
  selectedPlatforms: Set<Platform>;
  scheduledAt: string;
  isSubmitting: boolean;
  youtubeExcludedForImage?: boolean;
  onTogglePlatform: (platform: Platform) => void;
  onScheduledAtChange: (value: string) => void;
  onSubmit: (publishNow: boolean, tiktokPostingConsent: boolean) => void;
}) {
  const suggested = useMemo(() => nextSuggestedSlot(), []);
  const [mode, setMode] = useState<'now' | 'schedule'>('now');

  const tiktokJob = jobs.find((job) => job.socialAccount.platform === 'TIKTOK');
  const tiktokSelected = selectedPlatforms.has('TIKTOK');
  const tiktokReady = !tiktokSelected || (Boolean(tiktokJob?.tiktokPrivacyLevel) && Boolean(tiktokJob?.tiktokConsentAt));

  const canPublishNow = selectedPlatforms.size > 0 && tiktokReady;
  const canSchedule = canPublishNow && Boolean(scheduledAt);
  const canSubmit = mode === 'now' ? canPublishNow : canSchedule;

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

          {tiktokSelected && !tiktokReady && (
            <p className="text-xs text-destructive">
              Dla TikToka uzupełnij prywatność i zaznacz zgodę na warunki publikacji w kroku przeglądu.
            </p>
          )}

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
      </div>

      <div className="rounded-2xl border border-border bg-secondary/20 p-3">
        <button
          onClick={() => onSubmit(mode === 'now', tiktokSelected)}
          disabled={!canSubmit || isSubmitting}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-medium disabled:opacity-60"
        >
          <Send className="w-4 h-4" />
          {isSubmitting ? 'Wysyłanie...' : mode === 'now' ? 'Opublikuj teraz' : 'Zaplanuj'}
        </button>
      </div>
    </div>
  );
}

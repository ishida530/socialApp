import { useState } from 'react';
import { Hash, AtSign, RefreshCw, TriangleAlert } from 'lucide-react';
import { MetaFormatPanel } from './MetaFormatPanel';
import { PLATFORM_CAPTION_LIMIT } from './types';
import type { DraftJob } from './types';

const CHAR_WARNING_THRESHOLD = 40;

function ChipInput({
  values,
  placeholder,
  prefix,
  onAdd,
  onRemove,
}: {
  values: string[];
  placeholder: string;
  prefix?: string;
  onAdd: (value: string) => void;
  onRemove: (value: string) => void;
}) {
  const [draft, setDraft] = useState('');

  const commit = () => {
    const trimmed = draft.trim();
    if (trimmed) {
      onAdd(trimmed);
    }
    setDraft('');
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {values.map((value) => (
          <button
            key={value}
            onClick={() => onRemove(value)}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-primary/15 text-foreground hover:bg-destructive/15 hover:text-destructive transition-all"
            title="Kliknij, aby usunąć"
          >
            {prefix ?? ''}
            {value} ×
          </button>
        ))}
      </div>
      <input
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ',') {
            event.preventDefault();
            commit();
          }
        }}
        onBlur={commit}
        placeholder={placeholder}
        className="w-full px-3 py-2 bg-secondary/30 border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
      />
    </div>
  );
}

export function PlatformCaptionTab({
  job,
  onUpdateField,
  onSaveNow,
  onRegenerate,
}: {
  job: DraftJob;
  onUpdateField: (jobId: string, patch: Record<string, unknown>) => void;
  onSaveNow: (jobId: string, patch: Record<string, unknown>) => Promise<unknown>;
  onRegenerate: (jobId: string) => Promise<void>;
}) {
  const [isRegenerating, setIsRegenerating] = useState(false);
  const isTikTok = job.socialAccount.platform === 'TIKTOK';
  const isTikTokPhoto = isTikTok && job.video.mediaType === 'IMAGE';
  // TikTok guideline 2a ("allow users to enter ... Title"): for a TikTok video the caption IS the
  // post title TikTok receives (post_info.title); for a photo post there's a separate title
  // (max 90) plus a description - both labelled as what TikTok calls them.
  const captionLabel = isTikTokPhoto ? 'Opis (Description)' : isTikTok ? 'Tytuł (Title)' : 'Opis';
  const limit = isTikTokPhoto ? 4000 : PLATFORM_CAPTION_LIMIT[job.socialAccount.platform];
  const remaining = limit - job.caption.length;
  const showCounter = remaining <= CHAR_WARNING_THRESHOLD;

  const handleRegenerate = async () => {
    setIsRegenerating(true);
    try {
      await onRegenerate(job.id);
    } finally {
      setIsRegenerating(false);
    }
  };

  return (
    <div className="space-y-4">
      {job.contentWarnings.length > 0 && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 space-y-1">
          {job.contentWarnings.map((warning) => (
            <p key={warning} className="text-xs text-amber-700 dark:text-amber-400 flex items-start gap-1.5">
              <TriangleAlert className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              {warning}
            </p>
          ))}
        </div>
      )}

      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm font-medium text-foreground">{captionLabel}</label>
          <div className="flex items-center gap-3">
            {showCounter && (
              <span className={`text-xs font-medium ${remaining < 0 ? 'text-destructive' : 'text-muted-foreground'}`}>
                {remaining} / {limit}
              </span>
            )}
            <button
              onClick={handleRegenerate}
              disabled={isRegenerating}
              className="text-xs text-primary hover:text-accent transition-colors flex items-center gap-1 disabled:opacity-60"
            >
              <RefreshCw className={`w-3 h-3 ${isRegenerating ? 'animate-spin' : ''}`} />
              Wygeneruj ponownie
            </button>
          </div>
        </div>
        <textarea
          value={job.caption}
          onChange={(event) => onUpdateField(job.id, { caption: event.target.value })}
          placeholder="Caption dla tej platformy..."
          className="w-full h-32 px-4 py-3 bg-secondary/30 border border-border rounded-xl text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:ring-2 focus:ring-primary/50"
        />
        {/* 2026-10-03: say plainly that the text is an AI suggestion the user controls - users
            and platform reviewers (TikTok, Google, Meta) both look for this. */}
        {job.aiCaption && (
          <p className="mt-1.5 text-xs text-muted-foreground">
            Propozycja AI na podstawie Twojej notatki i materiału - sprawdź i popraw przed publikacją.
          </p>
        )}
      </div>

      {(job.socialAccount.platform === 'YOUTUBE' || isTikTokPhoto) && (
        <div>
          <label className="text-sm font-medium text-foreground mb-2 block">
            {isTikTokPhoto ? 'Tytuł (Title)' : 'Tytuł'}
          </label>
          <input
            value={job.title ?? ''}
            maxLength={isTikTokPhoto ? 90 : 100}
            onChange={(event) => onUpdateField(job.id, { title: event.target.value })}
            className="w-full px-3 py-2 bg-secondary/30 border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>
      )}

      <div>
        <label className="flex items-center gap-2 text-sm font-medium text-foreground mb-2">
          <Hash className="w-4 h-4" />
          Hashtagi
        </label>
        <ChipInput
          values={job.hashtags}
          placeholder="Dodaj hashtag i naciśnij Enter"
          onAdd={(value) => {
            const normalized = value.replace(/^#/, '');
            if (!job.hashtags.includes(normalized)) {
              onUpdateField(job.id, { hashtags: [...job.hashtags, normalized] });
            }
          }}
          onRemove={(value) => onUpdateField(job.id, { hashtags: job.hashtags.filter((tag) => tag !== value) })}
        />
      </div>

      {/* Hidden for TikTok: mentions are never sent there (guideline 5b - no field that silently
          does nothing to what gets posted). */}
      {!isTikTok && (
        <div>
          <label className="flex items-center gap-2 text-sm font-medium text-foreground mb-2">
            <AtSign className="w-4 h-4" />
            Oznacz osoby lub konta (@)
          </label>
          <ChipInput
            values={job.mentions}
            placeholder="Dodaj @ i naciśnij Enter"
            prefix="@"
            onAdd={(value) => {
              const normalized = value.replace(/^@/, '');
              if (!job.mentions.includes(normalized)) {
                onUpdateField(job.id, { mentions: [...job.mentions, normalized] });
              }
            }}
            onRemove={(value) => onUpdateField(job.id, { mentions: job.mentions.filter((m) => m !== value) })}
          />
        </div>
      )}

      {isTikTok && (
        // The TikTok settings themselves (privacy, interactions, commercial content disclosure)
        // live on the final "Post to TikTok" step, next to the creator nickname, the declaration
        // and the Publish button - see ScheduleStep.
        <p className="rounded-lg border border-border bg-background/40 p-3 text-xs text-muted-foreground">
          Ustawienia publikacji TikTok (kto może zobaczyć post, komentarze/Duet/Stitch, oznaczenie treści
          komercyjnej) wybierzesz w ostatnim kroku, tuż przed publikacją.
        </p>
      )}

      {(job.socialAccount.platform === 'FACEBOOK' || job.socialAccount.platform === 'INSTAGRAM') &&
        job.video.mediaType === 'VIDEO' && (
          <MetaFormatPanel job={job} onSaveNow={(patch) => onSaveNow(job.id, patch)} />
        )}
    </div>
  );
}

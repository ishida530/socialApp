import { useState } from 'react';
import { Hash, AtSign, RefreshCw, TriangleAlert } from 'lucide-react';
import { TikTokSettingsPanel } from './TikTokSettingsPanel';
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
  const limit = PLATFORM_CAPTION_LIMIT[job.socialAccount.platform];
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
          <label className="text-sm font-medium text-foreground">Caption</label>
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
      </div>

      {job.socialAccount.platform === 'YOUTUBE' && (
        <div>
          <label className="text-sm font-medium text-foreground mb-2 block">Tytuł</label>
          <input
            value={job.title ?? ''}
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

      <div>
        <label className="flex items-center gap-2 text-sm font-medium text-foreground mb-2">
          <AtSign className="w-4 h-4" />
          Oznacz artystę (feat.)
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

      {job.socialAccount.platform === 'TIKTOK' && (
        <TikTokSettingsPanel job={job} onSaveNow={(patch) => onSaveNow(job.id, patch)} />
      )}
    </div>
  );
}

import type { DraftJob, Platform } from './types';
import {
  effectiveMetaPostFormat,
  metaPostFormatOptions,
  type MetaPostFormat,
} from '@/lib/meta-post-format';

const OPTION_COPY: Partial<Record<Platform, Partial<Record<MetaPostFormat, { title: string; description: string }>>>> = {
  FACEBOOK: {
    REELS: { title: 'Reels', description: 'Krótkie, pionowe wideo publikowane jako Reels. Większy potencjalny zasięg.' },
    FEED: { title: 'Zwykły post', description: 'Zwykły post wideo na stronie, jak dotychczas.' },
    BOTH: { title: 'Oba', description: 'Dwie osobne publikacje z tego samego materiału - Reels i zwykły post.' },
  },
};

// Allowed formats come from lib/meta-post-format.ts (shared with Telegram and the draft API), so the
// web composer never offers an option the server would reject or the platform would refuse.
export function MetaFormatPanel({
  job,
  onSaveNow,
}: {
  job: DraftJob;
  onSaveNow: (patch: Record<string, unknown>) => Promise<unknown>;
}) {
  const platform = job.socialAccount.platform;
  const options = metaPostFormatOptions(platform, job.video.mediaType);
  const selected = effectiveMetaPostFormat(platform, job.video.mediaType, job.metaPostFormat);

  if (options.length === 0 || !selected) {
    return null;
  }

  // Instagram: every video is a Reel (media_type=VIDEO is retired) - nothing to choose, just say so.
  if (options.length === 1) {
    return (
      <div className="rounded-lg border border-border bg-background/40 p-3">
        <p className="text-sm font-medium text-foreground">Format publikacji: Reels</p>
        <p className="text-xs text-muted-foreground mt-1">
          Instagram publikuje każdy film jako Reels. Film pojawi się też w siatce Twojego profilu i w aktualnościach obserwujących.
        </p>
      </div>
    );
  }

  const copy = OPTION_COPY[platform] ?? {};

  return (
    <div className="space-y-3 rounded-lg border border-border bg-background/40 p-3">
      <p className="text-sm font-medium text-foreground">Format publikacji</p>

      <div className={`grid grid-cols-1 gap-2 ${options.length === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
        {options.map((format) => (
          <button
            key={format}
            onClick={() => onSaveNow({ metaPostFormat: format })}
            className={`text-left rounded-lg border p-3 transition-all ${
              selected === format ? 'bg-primary/10 border-primary/40' : 'bg-secondary/30 border-border hover:bg-secondary/50'
            }`}
          >
            <p className="text-sm font-medium text-foreground">{copy[format]?.title ?? format}</p>
            {copy[format]?.description && <p className="text-xs text-muted-foreground mt-1">{copy[format]!.description}</p>}
          </button>
        ))}
      </div>
    </div>
  );
}

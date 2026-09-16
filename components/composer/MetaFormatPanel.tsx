import type { DraftJob, Platform } from './types';

const FORMAT_COPY: Record<Platform, { reels: string; feed: string }> = {
  INSTAGRAM: {
    reels: 'Krótkie, pionowe wideo. Większy potencjalny zasięg, trafia też do zakładki Reels.',
    feed: 'Wideo w standardowym feedzie, jak klasyczny post.',
  },
  FACEBOOK: {
    reels: 'Krótkie, pionowe wideo publikowane jako Reels. Większy potencjalny zasięg.',
    feed: 'Zwykły post wideo na stronie, jak dotychczas.',
  },
  YOUTUBE: { reels: '', feed: '' },
  TIKTOK: { reels: '', feed: '' },
  LINKEDIN: { reels: '', feed: '' },
};

export function MetaFormatPanel({
  job,
  onSaveNow,
}: {
  job: DraftJob;
  onSaveNow: (patch: Record<string, unknown>) => Promise<unknown>;
}) {
  const platform = job.socialAccount.platform;
  const copy = FORMAT_COPY[platform];
  const selected = job.metaPostFormat ?? 'REELS';
  // "Oba" only makes sense on Facebook - a Reel and a plain post are genuinely separate
  // publications there. Instagram Reels already reach the feed too (share_to_feed), so there's
  // no separate surface left to also publish to.
  const showBothOption = platform === 'FACEBOOK';

  return (
    <div className="space-y-3 rounded-lg border border-border bg-background/40 p-3">
      <p className="text-sm font-medium text-foreground">Format publikacji</p>

      <div className={`grid grid-cols-1 gap-2 ${showBothOption ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
        <button
          onClick={() => onSaveNow({ metaPostFormat: 'REELS' })}
          className={`text-left rounded-lg border p-3 transition-all ${
            selected === 'REELS' ? 'bg-primary/10 border-primary/40' : 'bg-secondary/30 border-border hover:bg-secondary/50'
          }`}
        >
          <p className="text-sm font-medium text-foreground">Reels</p>
          <p className="text-xs text-muted-foreground mt-1">{copy.reels}</p>
        </button>
        <button
          onClick={() => onSaveNow({ metaPostFormat: 'FEED' })}
          className={`text-left rounded-lg border p-3 transition-all ${
            selected === 'FEED' ? 'bg-primary/10 border-primary/40' : 'bg-secondary/30 border-border hover:bg-secondary/50'
          }`}
        >
          <p className="text-sm font-medium text-foreground">Zwykły post</p>
          <p className="text-xs text-muted-foreground mt-1">{copy.feed}</p>
        </button>
        {showBothOption && (
          <button
            onClick={() => onSaveNow({ metaPostFormat: 'BOTH' })}
            className={`text-left rounded-lg border p-3 transition-all ${
              selected === 'BOTH' ? 'bg-primary/10 border-primary/40' : 'bg-secondary/30 border-border hover:bg-secondary/50'
            }`}
          >
            <p className="text-sm font-medium text-foreground">Oba</p>
            <p className="text-xs text-muted-foreground mt-1">
              Dwie osobne publikacje z tego samego materiału - Reels i zwykły post.
            </p>
          </button>
        )}
      </div>
    </div>
  );
}

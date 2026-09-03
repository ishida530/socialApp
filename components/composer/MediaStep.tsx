import { useState } from 'react';
import { toast } from 'sonner';
import { apiClient } from '@/lib/api-client';
import { VideoUploader } from '@/components/VideoUploader';

type UploadedVideo = {
  id: string;
  title: string;
  sourceUrl: string;
  mediaType: 'VIDEO' | 'IMAGE';
  durationSec: number | null;
};

type VideoDto = {
  id: string;
  title: string;
  sourceUrl: string;
  mediaType: 'VIDEO' | 'IMAGE';
  durationSec: number | null;
};

const CONTENT_TYPE_SUGGESTIONS = ['Nowy kawałek', 'Zapowiedź', 'Freestyle', 'Behind the scenes', 'Clip z koncertu'];

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function measureVideoDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    if (!file.type.startsWith('video/')) {
      resolve(null);
      return;
    }

    const videoEl = document.createElement('video');
    videoEl.preload = 'metadata';
    videoEl.onloadedmetadata = () => {
      URL.revokeObjectURL(videoEl.src);
      resolve(Number.isFinite(videoEl.duration) ? videoEl.duration : null);
    };
    videoEl.onerror = () => resolve(null);
    videoEl.src = URL.createObjectURL(file);
  });
}

async function pollForVideoBySourceUrl(sourceUrl: string): Promise<VideoDto | null> {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    try {
      const response = await apiClient.get<VideoDto[]>('/videos');
      const match = response.data.find((video) => video.sourceUrl === sourceUrl);
      if (match) {
        return match;
      }
    } catch {
      // keep polling
    }

    await wait(700);
  }

  return null;
}

export function MediaStep({
  contentType,
  songTitle,
  video,
  isStarting,
  resumeAvailable,
  tiktokConnected,
  onContentTypeChange,
  onSongTitleChange,
  onVideoResolved,
  onResume,
  onDiscardResume,
  onContinue,
}: {
  contentType: string;
  songTitle: string;
  video: UploadedVideo | null;
  isStarting: boolean;
  resumeAvailable: boolean;
  tiktokConnected: boolean;
  onContentTypeChange: (value: string) => void;
  onSongTitleChange: (value: string) => void;
  onVideoResolved: (video: UploadedVideo | null) => void;
  onResume: () => void;
  onDiscardResume: () => void;
  onContinue: () => void;
}) {
  const [isResolvingUpload, setIsResolvingUpload] = useState(false);
  const [tiktokDurationWarning, setTiktokDurationWarning] = useState<string | null>(null);

  const checkTiktokDurationLimit = async (durationSec: number) => {
    if (!tiktokConnected) {
      return;
    }

    try {
      const response = await apiClient.get<{ creatorInfo: { max_video_post_duration_sec?: number } | null }>(
        '/social-accounts/tiktok/creator-info',
      );
      const maxDuration = response.data.creatorInfo?.max_video_post_duration_sec;

      if (typeof maxDuration === 'number' && durationSec > maxDuration) {
        setTiktokDurationWarning(
          `Ten materiał (${Math.round(durationSec)}s) przekracza maksymalny limit TikTok (${maxDuration}s) dla Twojego konta — publikacja na TikTok się nie powiedzie, dopóki nie skrócisz materiału albo nie odznaczysz TikToka w kroku "Kiedy i gdzie".`,
        );
      }
    } catch {
      // soft check — connectivity/API issues here shouldn't block the upload flow
    }
  };

  const handleUploaded = async (info: { sourceUrl: string; mediaType: 'video' | 'image'; file: File }) => {
    setIsResolvingUpload(true);
    setTiktokDurationWarning(null);
    onVideoResolved(null);

    try {
      const [resolvedVideo, durationSec] = await Promise.all([
        pollForVideoBySourceUrl(info.sourceUrl),
        measureVideoDuration(info.file),
      ]);

      if (!resolvedVideo) {
        toast.error('Materiał się przesłał, ale nie udało się go odnaleźć. Odśwież i spróbuj ponownie.');
        return;
      }

      if (durationSec !== null) {
        try {
          await apiClient.patch(`/videos/${resolvedVideo.id}`, { durationSec });
        } catch {
          // non-critical — only used for the soft TikTok duration warning below
        }

        void checkTiktokDurationLimit(durationSec);
      }

      onVideoResolved({
        id: resolvedVideo.id,
        title: resolvedVideo.title,
        sourceUrl: resolvedVideo.sourceUrl,
        mediaType: resolvedVideo.mediaType,
        durationSec: durationSec !== null ? Math.round(durationSec) : resolvedVideo.durationSec,
      });
    } finally {
      setIsResolvingUpload(false);
    }
  };

  return (
    <div className="space-y-4">
      {resumeAvailable && (
        <div className="rounded-2xl border border-primary/30 bg-primary/5 p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <p className="text-sm text-foreground">Masz niedokończony post. Wrócić do niego?</p>
          <div className="flex gap-2">
            <button
              onClick={onResume}
              className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium"
            >
              Wróć do posta
            </button>
            <button
              onClick={onDiscardResume}
              className="px-3 py-1.5 rounded-lg bg-secondary/60 text-foreground text-xs"
            >
              Zacznij nowy
            </button>
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-border bg-secondary/20 p-3">
        <p className="text-sm font-medium text-foreground">Wgraj materiał</p>
        <p className="text-xs text-muted-foreground mt-1">Wideo lub zdjęcie — okładka singla, grafika promo czy screenshot z sesji też się nadają.</p>
        <div className="mt-3">
          <VideoUploader compact onUploaded={handleUploaded} />
        </div>
        {isResolvingUpload && (
          <p className="text-xs text-muted-foreground mt-2">Finalizowanie przesyłania...</p>
        )}
        {video && (
          <p className="text-xs text-primary mt-2">
            Gotowe: {video.title} ({video.mediaType === 'IMAGE' ? 'zdjęcie' : 'wideo'})
          </p>
        )}
        {tiktokDurationWarning && (
          <p className="text-xs text-destructive mt-2">{tiktokDurationWarning}</p>
        )}
      </div>

      <div className="rounded-2xl border border-border bg-secondary/20 p-3 space-y-3">
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">Co to za treść?</label>
          <input
            list="content-type-suggestions"
            value={contentType}
            onChange={(event) => onContentTypeChange(event.target.value)}
            placeholder="Nowy kawałek, zapowiedź, freestyle..."
            className="w-full px-4 py-2.5 bg-secondary/30 border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
          <datalist id="content-type-suggestions">
            {CONTENT_TYPE_SUGGESTIONS.map((suggestion) => (
              <option key={suggestion} value={suggestion} />
            ))}
          </datalist>
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-2">Tytuł utworu / projektu (opcjonalnie)</label>
          <input
            value={songTitle}
            onChange={(event) => onSongTitleChange(event.target.value)}
            placeholder="np. Cień miasta"
            className="w-full px-4 py-2.5 bg-secondary/30 border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>
      </div>

      <button
        onClick={onContinue}
        disabled={!video || isStarting || isResolvingUpload}
        className="w-full px-4 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-medium disabled:opacity-60"
      >
        {isStarting ? 'AI dopasowuje treść...' : 'Dalej'}
      </button>
    </div>
  );
}

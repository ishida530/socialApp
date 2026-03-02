import { Hash, Calendar, Clock, Send } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { apiClient } from '@/lib/api-client';

const platformLimits = {
  youtube: 5000,
  tiktok: 2200,
};

const hashtagPresets = [
  '#viral',
  '#trending',
  '#contentcreator',
  '#socialmedia',
  '#videomarketing',
  '#digitalmarketing',
];

export function PostComposer() {
  const [caption, setCaption] = useState('');
  const [selectedPlatform, setSelectedPlatform] = useState<keyof typeof platformLimits>('youtube');
  const [selectedHashtags, setSelectedHashtags] = useState<string[]>([]);
  const [scheduledDate, setScheduledDate] = useState('');
  const [scheduledTime, setScheduledTime] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [videos, setVideos] = useState<Array<{ id: string; title: string; createdAt?: string }>>([]);
  const [selectedVideoId, setSelectedVideoId] = useState<string>('');
  const [connectedPlatforms, setConnectedPlatforms] = useState<Set<string>>(new Set());
  const [drafts, setDrafts] = useState<
    Array<{
      id: string;
      caption: string;
      platform: 'YOUTUBE' | 'TIKTOK' | 'INSTAGRAM' | 'FACEBOOK';
      hashtags: string[];
      scheduledFor: string | null;
      createdAt: string;
      videoId: string | null;
      video?: { id: string; title: string } | null;
    }>
  >([]);

  useEffect(() => {
    const bootstrapComposerData = async () => {
      try {
        const [videosResponse, accountsResponse, draftsResponse] = await Promise.all([
          apiClient.get<Array<{ id: string; title: string; createdAt?: string }>>('/videos'),
          apiClient.get<Array<{ platform: 'YOUTUBE' | 'TIKTOK' | 'INSTAGRAM' | 'FACEBOOK' }>>('/social-accounts'),
          apiClient.get<
            Array<{
              id: string;
              caption: string;
              platform: 'YOUTUBE' | 'TIKTOK' | 'INSTAGRAM' | 'FACEBOOK';
              hashtags: string[];
              scheduledFor: string | null;
              createdAt: string;
              videoId: string | null;
              video?: { id: string; title: string } | null;
            }>
          >('/drafts'),
        ]);

        const nextVideos = videosResponse.data;
        setVideos(nextVideos);

        const nextSelectedVideo = nextVideos[0]?.id ?? '';
        setSelectedVideoId(nextSelectedVideo);

        const nextConnectedPlatforms = new Set(
          accountsResponse.data.map((account) => account.platform.toLowerCase()),
        );
        setConnectedPlatforms(nextConnectedPlatforms);
        setDrafts(draftsResponse.data);

        if (nextSelectedVideo === '') {
          toast.error('Brak dostępnego filmu. Najpierw prześlij wideo.');
        }
      } catch {
        setVideos([]);
        setSelectedVideoId('');
        setConnectedPlatforms(new Set());
        setDrafts([]);
      }
    };

    void bootstrapComposerData();
  }, []);

  const currentLimit = platformLimits[selectedPlatform];
  const remainingChars = currentLimit - caption.length;

  const scheduledDateTime = useMemo(() => {
    if (!scheduledDate || !scheduledTime) {
      return null;
    }

    return `${scheduledDate}T${scheduledTime}:00`;
  }, [scheduledDate, scheduledTime]);

  const selectedVideo = useMemo(
    () => videos.find((video) => video.id === selectedVideoId),
    [selectedVideoId, videos],
  );

  const selectedPlatformConnected = connectedPlatforms.has(selectedPlatform);

  const toggleHashtag = (tag: string) => {
    if (selectedHashtags.includes(tag)) {
      setSelectedHashtags(selectedHashtags.filter((t) => t !== tag));
    } else {
      setSelectedHashtags([...selectedHashtags, tag]);
    }
  };

  const enqueuePublishJob = async () => {
    if (!selectedVideoId) {
      toast.error('Brak dostępnego filmu. Najpierw prześlij wideo.');
      return;
    }

    if (!selectedPlatformConnected) {
      toast.error('Najpierw połącz konto dla wybranej platformy.');
      return;
    }

    if (!scheduledDateTime) {
      toast.error('Wybierz datę i godzinę publikacji.');
      return;
    }

    try {
      setIsSubmitting(true);

      await apiClient.post('/publish-jobs/enqueue', {
        videoId: selectedVideoId,
        scheduledDate: new Date(scheduledDateTime).toISOString(),
        platformSettings: {
          platform: selectedPlatform,
          description: caption,
          tags: selectedHashtags,
        },
      });

      toast.success('Film został dodany do kolejki!');
      window.dispatchEvent(new Event('publish-jobs:refresh'));
    } catch {
      toast.error('Nie udało się dodać filmu do kolejki.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const saveDraft = async () => {
    if (!caption.trim()) {
      toast.error('Wpisz treść posta przed zapisaniem szkicu.');
      return;
    }

    try {
      setIsSubmitting(true);
      await apiClient.post('/drafts', {
        caption: caption.trim(),
        platform: selectedPlatform,
        hashtags: selectedHashtags,
        scheduledFor: scheduledDateTime
          ? new Date(scheduledDateTime).toISOString()
          : null,
        videoId: selectedVideoId || null,
      });
      toast.success('Szkic został zapisany.');

      const refreshedDrafts = await apiClient.get<
        Array<{
          id: string;
          caption: string;
          platform: 'YOUTUBE' | 'TIKTOK' | 'INSTAGRAM' | 'FACEBOOK';
          hashtags: string[];
          scheduledFor: string | null;
          createdAt: string;
          videoId: string | null;
          video?: { id: string; title: string } | null;
        }>
      >('/drafts');
      setDrafts(refreshedDrafts.data);
    } catch {
      toast.error('Nie udało się zapisać szkicu.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const restoreDraft = (draft: {
    id: string;
    caption: string;
    platform: 'YOUTUBE' | 'TIKTOK' | 'INSTAGRAM' | 'FACEBOOK';
    hashtags: string[];
    scheduledFor: string | null;
    videoId: string | null;
  }) => {
    const platformLower = draft.platform.toLowerCase();
    if (platformLower !== 'youtube' && platformLower !== 'tiktok') {
      toast.error('Ten szkic używa platformy, która nie jest jeszcze wspierana w composerze.');
      return;
    }

    setCaption(draft.caption);
    setSelectedPlatform(platformLower as keyof typeof platformLimits);
    setSelectedHashtags(Array.isArray(draft.hashtags) ? draft.hashtags : []);

    if (draft.videoId && videos.some((video) => video.id === draft.videoId)) {
      setSelectedVideoId(draft.videoId);
    }

    if (draft.scheduledFor) {
      const parsed = new Date(draft.scheduledFor);
      if (!Number.isNaN(parsed.getTime())) {
        setScheduledDate(parsed.toISOString().slice(0, 10));
        setScheduledTime(parsed.toISOString().slice(11, 16));
      }
    } else {
      setScheduledDate('');
      setScheduledTime('');
    }

    toast.success('Szkic odtworzony w composerze.');
  };

  return (
    <div id="post-composer" className="w-96 bg-card border-l border-border flex flex-col">
      <div className="p-6 border-b border-border">
        <h2 className="text-lg font-semibold text-foreground">Komponuj post</h2>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Platform selector */}
        <div>
          <label className="block text-sm font-medium text-foreground mb-3">
            Wybierz platformę
          </label>
          <div className="grid grid-cols-2 gap-2">
            {Object.keys(platformLimits).map((platform) => (
              <button
                key={platform}
                onClick={() => setSelectedPlatform(platform as keyof typeof platformLimits)}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                  selectedPlatform === platform
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-secondary/50 text-muted-foreground hover:bg-secondary'
                }`}
              >
                {platform.charAt(0).toUpperCase() + platform.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-3">Wybierz wideo</label>
          <select
            value={selectedVideoId}
            onChange={(e) => setSelectedVideoId(e.target.value)}
            className="w-full px-4 py-2.5 bg-secondary/30 border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
          >
            {videos.length === 0 ? (
              <option value="">Brak dostępnych filmów</option>
            ) : (
              videos.map((video) => (
                <option key={video.id} value={video.id}>
                  {video.title}
                </option>
              ))
            )}
          </select>
          {selectedVideo && (
            <p className="text-xs text-muted-foreground mt-2">
              Wybrane: {selectedVideo.title}
            </p>
          )}
        </div>

        {/* Caption input */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <label className="text-sm font-medium text-foreground">Opis wideo</label>
            <span
              className={`text-xs font-medium ${
                remainingChars < 0 ? 'text-destructive' : 'text-muted-foreground'
              }`}
            >
              {remainingChars} / {currentLimit}
            </span>
          </div>
          <textarea
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder="Napisz opis swojego wideo..."
            className="w-full h-32 px-4 py-3 bg-secondary/30 border border-border rounded-xl text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>

        {/* Hashtag presets */}
        <div>
          <label className="flex items-center gap-2 text-sm font-medium text-foreground mb-3">
            <Hash className="w-4 h-4" />
            Gotowe hashtagi
          </label>
          <div className="flex flex-wrap gap-2">
            {hashtagPresets.map((tag) => (
              <button
                key={tag}
                onClick={() => toggleHashtag(tag)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  selectedHashtags.includes(tag)
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-secondary/50 text-muted-foreground hover:bg-secondary'
                }`}
              >
                {tag}
              </button>
            ))}
          </div>
          {selectedHashtags.length > 0 && (
            <div className="mt-3 p-3 bg-primary/5 border border-primary/20 rounded-lg">
              <p className="text-xs text-muted-foreground mb-1">Wybrane:</p>
              <p className="text-sm text-foreground">{selectedHashtags.join(' ')}</p>
            </div>
          )}
        </div>

        {/* Schedule picker */}
        <div>
          <label className="flex items-center gap-2 text-sm font-medium text-foreground mb-3">
            <Calendar className="w-4 h-4" />
            Zaplanuj publikację
          </label>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground mb-2 block">Data</label>
              <input
                type="date"
                value={scheduledDate}
                onChange={(e) => setScheduledDate(e.target.value)}
                className="w-full px-4 py-2.5 bg-secondary/30 border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-2 block">Godzina</label>
              <input
                type="time"
                value={scheduledTime}
                onChange={(e) => setScheduledTime(e.target.value)}
                className="w-full px-4 py-2.5 bg-secondary/30 border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-3">Zapisane szkice</label>
          <div className="space-y-2">
            {drafts.slice(0, 6).map((draft) => (
              <button
                key={draft.id}
                onClick={() => restoreDraft(draft)}
                className="w-full text-left rounded-lg border border-border bg-secondary/20 p-3 hover:bg-secondary/40 transition-all"
              >
                <p className="text-sm font-medium text-foreground line-clamp-1">
                  {draft.caption || 'Szkic bez treści'}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {draft.platform} • {new Date(draft.createdAt).toLocaleString('pl-PL')}
                </p>
              </button>
            ))}
            {drafts.length === 0 && (
              <p className="text-xs text-muted-foreground">Brak zapisanych szkiców.</p>
            )}
          </div>
        </div>
      </div>

      {/* Action buttons */}
      <div className="p-6 border-t border-border space-y-3">
        <button
          onClick={enqueuePublishJob}
          disabled={isSubmitting || !selectedVideoId || !selectedPlatformConnected}
          className="w-full flex items-center justify-center gap-2 px-5 py-3 bg-gradient-to-r from-primary to-accent text-primary-foreground rounded-xl hover:shadow-lg hover:shadow-primary/30 transition-all disabled:opacity-60"
        >
          <Send className="w-5 h-5" />
          <span>{isSubmitting ? 'Dodawanie do kolejki...' : 'Zaplanuj publikację'}</span>
        </button>
        {!selectedPlatformConnected && (
          <p className="text-xs text-destructive text-center">
            Brak połączonego konta dla {selectedPlatform}. Połącz konto w sekcji „Połączone konta”.
          </p>
        )}
        <button
          onClick={saveDraft}
          disabled={isSubmitting}
          className="w-full px-5 py-3 bg-secondary/50 text-foreground rounded-xl hover:bg-secondary transition-all disabled:opacity-60"
        >
          Zapisz szkic
        </button>
      </div>
    </div>
  );
}

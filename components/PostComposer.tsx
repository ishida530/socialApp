import { Hash, Calendar, Clock, Send } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { apiClient } from '@/lib/api-client';

const platformLimits = {
  youtube: 5000,
  instagram: 2200,
  tiktok: 2200,
  facebook: 63206,
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
  const [latestVideoId, setLatestVideoId] = useState<string | null>(null);

  useEffect(() => {
    const loadLatestVideo = async () => {
      try {
        const response = await apiClient.get<Array<{ id: string }>>('/videos');
        setLatestVideoId(response.data[0]?.id ?? null);
      } catch {
        setLatestVideoId(null);
      }
    };

    loadLatestVideo();
  }, []);

  const currentLimit = platformLimits[selectedPlatform];
  const remainingChars = currentLimit - caption.length;

  const scheduledDateTime = useMemo(() => {
    if (!scheduledDate || !scheduledTime) {
      return null;
    }

    return `${scheduledDate}T${scheduledTime}:00`;
  }, [scheduledDate, scheduledTime]);

  const toggleHashtag = (tag: string) => {
    if (selectedHashtags.includes(tag)) {
      setSelectedHashtags(selectedHashtags.filter((t) => t !== tag));
    } else {
      setSelectedHashtags([...selectedHashtags, tag]);
    }
  };

  const enqueuePublishJob = async () => {
    if (!latestVideoId) {
      toast.error('Brak dostępnego filmu. Najpierw prześlij wideo.');
      return;
    }

    if (!scheduledDateTime) {
      toast.error('Wybierz datę i godzinę publikacji.');
      return;
    }

    try {
      setIsSubmitting(true);

      await apiClient.post('/publish-jobs/enqueue', {
        videoId: latestVideoId,
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

  return (
    <div className="w-96 bg-card border-l border-border flex flex-col">
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
      </div>

      {/* Action buttons */}
      <div className="p-6 border-t border-border space-y-3">
        <button
          onClick={enqueuePublishJob}
          disabled={isSubmitting}
          className="w-full flex items-center justify-center gap-2 px-5 py-3 bg-gradient-to-r from-primary to-accent text-primary-foreground rounded-xl hover:shadow-lg hover:shadow-primary/30 transition-all disabled:opacity-60"
        >
          <Send className="w-5 h-5" />
          <span>{isSubmitting ? 'Dodawanie do kolejki...' : 'Zaplanuj publikację'}</span>
        </button>
        <button className="w-full px-5 py-3 bg-secondary/50 text-foreground rounded-xl hover:bg-secondary transition-all">
          Zapisz szkic
        </button>
      </div>
    </div>
  );
}

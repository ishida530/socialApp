'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { VideoUploader } from '@/components/VideoUploader';
import { useAuth } from '@/contexts/auth-context';
import { apiClient } from '@/lib/api-client';

type VideoStatus = 'UPLOADED' | 'PROCESSING' | 'READY' | 'FAILED';

type VideoItem = {
  id: string;
  title: string;
  description?: string | null;
  status: VideoStatus;
  createdAt: string;
};

function buildAiTags(video: VideoItem) {
  const source = `${video.title} ${video.description || ''}`.toLowerCase();
  const tags: string[] = [];

  if (source.includes('tutorial') || source.includes('poradnik')) {
    tags.push('#tutorial');
  }

  if (source.includes('tech') || source.includes('technolog') || source.includes('ładowark')) {
    tags.push('#technologia');
  }

  if (source.includes('produkt') || source.includes('review') || source.includes('recenz')) {
    tags.push('#produkt');
  }

  if (source.includes('promocj') || source.includes('sale') || source.includes('oferta')) {
    tags.push('#promocja');
  }

  if (tags.length === 0) {
    tags.push('#content', '#video');
  }

  return Array.from(new Set(tags)).slice(0, 4);
}

const statuses: Array<{ value: '' | VideoStatus; label: string }> = [
  { value: '', label: 'Wszystkie statusy' },
  { value: 'UPLOADED', label: 'Przesłane' },
  { value: 'PROCESSING', label: 'Przetwarzanie' },
  { value: 'READY', label: 'Gotowe' },
  { value: 'FAILED', label: 'Błąd' },
];

function videoStatusLabel(status: VideoStatus) {
  if (status === 'UPLOADED') return 'Przesłane';
  if (status === 'PROCESSING') return 'Przetwarzanie';
  if (status === 'READY') return 'Gotowe';
  return 'Błąd';
}

export default function MediaLibraryPage() {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();

  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [loadingVideos, setLoadingVideos] = useState(true);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<'' | VideoStatus>('');

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace('/login');
    }
  }, [isAuthenticated, isLoading, router]);

  const loadVideos = async () => {
    try {
      setLoadingVideos(true);
      const params = new URLSearchParams();
      if (query.trim()) {
        params.set('q', query.trim());
      }
      if (status) {
        params.set('status', status);
      }

      const response = await apiClient.get<VideoItem[]>(
        `/videos${params.toString() ? `?${params.toString()}` : ''}`,
      );
      setVideos(response.data);
    } catch {
      toast.error('Nie udało się pobrać biblioteki mediów.');
    } finally {
      setLoadingVideos(false);
    }
  };

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    void loadVideos();
  }, [isAuthenticated, query, status]);

  const handleDelete = async (videoId: string) => {
    try {
      await apiClient.delete(`/videos/${videoId}`);
      setVideos((current) => current.filter((video) => video.id !== videoId));
      toast.success('Wideo zostało usunięte.');
    } catch {
      toast.error('Usunięcie wideo nie powiodło się.');
    }
  };

  const itemsCountLabel = useMemo(() => {
    if (loadingVideos) {
      return 'Ładowanie...';
    }

    return `Wyników: ${videos.length}`;
  }, [loadingVideos, videos.length]);

  if (isLoading || !isAuthenticated) {
    return (
      <main className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-sm text-muted-foreground">Ładowanie sesji...</p>
      </main>
    );
  }

  return (
    <main className="flex-1 overflow-y-auto p-4 sm:p-6 pb-24 lg:pb-6 space-y-6">
          <VideoUploader />

          <section className="bg-card border border-border rounded-xl p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Szukaj po tytule/opisie"
                className="w-full sm:w-auto px-3 py-2 rounded-lg bg-background border border-border text-sm text-foreground"
              />

              <select
                value={status}
                onChange={(event) => setStatus(event.target.value as '' | VideoStatus)}
                className="w-full sm:w-auto px-3 py-2 rounded-lg bg-background border border-border text-sm text-foreground"
              >
                {statuses.map((item) => (
                  <option key={item.label} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>

              <span className="text-sm text-muted-foreground">{itemsCountLabel}</span>
            </div>

            <div className="space-y-2">
              {loadingVideos && (
                <p className="text-sm text-muted-foreground">Ładowanie biblioteki...</p>
              )}

              {!loadingVideos && videos.length === 0 && (
                <div className="rounded-lg border border-border bg-secondary/20 p-4 space-y-3">
                  <p className="text-sm text-muted-foreground">Brak filmów w bibliotece.</p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => router.push('/')}
                      className="px-3 py-1.5 text-xs rounded-lg bg-primary text-primary-foreground"
                    >
                      Utwórz pierwszy post
                    </button>
                    <button
                      onClick={() => router.push('/social-accounts')}
                      className="px-3 py-1.5 text-xs rounded-lg bg-secondary border border-border text-foreground"
                    >
                      Połącz konto społecznościowe
                    </button>
                  </div>
                </div>
              )}

              {videos.map((video) => (
                <div
                  key={video.id}
                  className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 p-3 rounded-lg border border-border bg-secondary/20"
                >
                  <div>
                    <p className="text-sm font-medium text-foreground flex items-center gap-2">
                      {video.title}
                      {video.status === 'READY' && (
                        <span className="inline-flex items-center rounded-md border border-primary/30 bg-primary/10 px-2 py-0.5 text-[11px] text-primary">
                          Gotowe do AI
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {videoStatusLabel(video.status)} • {new Date(video.createdAt).toLocaleString('pl-PL')}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {buildAiTags(video).map((tag) => (
                        <span
                          key={`${video.id}-${tag}`}
                          className="inline-flex rounded-md border border-border bg-background/40 px-2 py-0.5 text-[11px] text-muted-foreground"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>

                  <button
                    onClick={() => handleDelete(video.id)}
                    className="px-3 py-1.5 text-xs rounded-lg bg-destructive/10 border border-destructive/30 text-destructive hover:bg-destructive/20"
                  >
                    Usuń
                  </button>
                </div>
              ))}
            </div>
          </section>
    </main>
  );
}
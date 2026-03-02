'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Sidebar } from '@/components/Sidebar';
import { Header } from '@/components/Header';
import { VideoUploader } from '@/components/VideoUploader';
import { useAuth } from '@/contexts/auth-context';
import { apiClient } from '@/lib/api-client';

type VideoStatus = 'UPLOADED' | 'PROCESSING' | 'READY' | 'FAILED';

type VideoItem = {
  id: string;
  title: string;
  status: VideoStatus;
  createdAt: string;
};

const statuses: Array<{ value: '' | VideoStatus; label: string }> = [
  { value: '', label: 'Wszystkie statusy' },
  { value: 'UPLOADED', label: 'UPLOADED' },
  { value: 'PROCESSING', label: 'PROCESSING' },
  { value: 'READY', label: 'READY' },
  { value: 'FAILED', label: 'FAILED' },
];

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
    <div className="size-full flex bg-background dark">
      <Sidebar />

      <div className="flex-1 flex flex-col min-w-0">
        <Header />

        <main className="flex-1 overflow-y-auto p-6 space-y-6">
          <VideoUploader />

          <section className="bg-card border border-border rounded-xl p-6 space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Szukaj po tytule/opisie"
                className="px-3 py-2 rounded-lg bg-background border border-border text-sm text-foreground"
              />

              <select
                value={status}
                onChange={(event) => setStatus(event.target.value as '' | VideoStatus)}
                className="px-3 py-2 rounded-lg bg-background border border-border text-sm text-foreground"
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
                <p className="text-sm text-muted-foreground">Brak filmów.</p>
              )}

              {videos.map((video) => (
                <div
                  key={video.id}
                  className="flex items-center justify-between p-3 rounded-lg border border-border bg-secondary/20"
                >
                  <div>
                    <p className="text-sm font-medium text-foreground">{video.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {video.status} • {new Date(video.createdAt).toLocaleString('pl-PL')}
                    </p>
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
      </div>
    </div>
  );
}
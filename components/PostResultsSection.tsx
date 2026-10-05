'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { apiClient } from '@/lib/api-client';

type PostResult = {
  jobId: string;
  platform: string;
  accountHandle: string | null;
  title: string;
  postUrl: string | null;
  publishedAt: string | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  fetchedAt: string | null;
  metricsAvailable: boolean;
};

const PLATFORM_LABELS: Record<string, string> = {
  FACEBOOK: 'Facebook',
  INSTAGRAM: 'Instagram',
  LINKEDIN: 'LinkedIn',
  TIKTOK: 'TikTok',
  YOUTUBE: 'YouTube',
};

function formatCount(value: number | null) {
  return value === null ? '–' : value.toLocaleString('pl-PL');
}

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleString('pl-PL', { dateStyle: 'short', timeStyle: 'short' }) : '–';
}

// Analytics screen (2026-10-04): statistics of the user's own posts published through Postfly -
// what the platform read permissions are for. Collected daily; "Odśwież statystyki" fetches now.
export function PostResultsSection() {
  const [posts, setPosts] = useState<PostResult[] | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    apiClient
      .get<{ posts: PostResult[] }>('/analytics/posts')
      .then((response) => setPosts(response.data.posts))
      .catch(() => setPosts([]));
  }, []);

  const refresh = async () => {
    try {
      setIsRefreshing(true);
      const response = await apiClient.post<{ posts: PostResult[] }>('/analytics/posts');
      setPosts(response.data.posts);
      toast.success('Statystyki odświeżone.');
    } catch {
      toast.error('Nie udało się odświeżyć statystyk. Spróbuj za kilka minut.');
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <section className="bg-card border border-border rounded-xl p-5 mt-4">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4">
        <div>
          <h3 className="text-sm font-medium text-foreground">Wyniki opublikowanych postów</h3>
          <p className="text-xs text-muted-foreground mt-1">
            Wyświetlenia i reakcje Twoich postów opublikowanych przez Postfly (ostatnie 30 dni). Pobierane codziennie
            z platform; możesz je też odświeżyć teraz.
          </p>
        </div>
        <button
          type="button"
          onClick={refresh}
          disabled={isRefreshing}
          className="px-3 py-1.5 rounded-lg border border-border text-xs text-foreground hover:bg-secondary/40 transition-colors disabled:opacity-50 whitespace-nowrap self-start"
        >
          {isRefreshing ? 'Odświeżanie...' : 'Odśwież statystyki'}
        </button>
      </div>

      {posts === null ? (
        <p className="text-sm text-muted-foreground">Ładowanie...</p>
      ) : posts.length === 0 ? (
        <p className="text-sm text-muted-foreground">Brak opublikowanych postów w ostatnich 30 dniach.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground border-b border-border">
                <th className="py-2 pr-3 font-medium">Post</th>
                <th className="py-2 pr-3 font-medium">Platforma</th>
                <th className="py-2 pr-3 font-medium text-right">Wyświetlenia</th>
                <th className="py-2 pr-3 font-medium text-right">Polubienia</th>
                <th className="py-2 pr-3 font-medium text-right">Komentarze</th>
                <th className="py-2 pr-3 font-medium text-right">Udostępnienia</th>
                <th className="py-2 font-medium">Pobrano</th>
              </tr>
            </thead>
            <tbody>
              {posts.map((post) => (
                <tr key={post.jobId} className="border-b border-border/60 align-top">
                  <td className="py-2 pr-3 max-w-[16rem]">
                    {post.postUrl ? (
                      <a href={post.postUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline break-words">
                        {post.title}
                      </a>
                    ) : (
                      <span className="text-foreground break-words">{post.title}</span>
                    )}
                    <p className="text-xs text-muted-foreground">{formatDate(post.publishedAt)}</p>
                  </td>
                  <td className="py-2 pr-3 whitespace-nowrap text-foreground">
                    {PLATFORM_LABELS[post.platform] ?? post.platform}
                    {post.accountHandle ? <p className="text-xs text-muted-foreground">{post.accountHandle}</p> : null}
                  </td>
                  {post.metricsAvailable ? (
                    <>
                      <td className="py-2 pr-3 text-right text-foreground">{formatCount(post.views)}</td>
                      <td className="py-2 pr-3 text-right text-foreground">{formatCount(post.likes)}</td>
                      <td className="py-2 pr-3 text-right text-foreground">{formatCount(post.comments)}</td>
                      <td className="py-2 pr-3 text-right text-foreground">{formatCount(post.shares)}</td>
                      <td className="py-2 text-xs text-muted-foreground whitespace-nowrap">
                        {post.fetchedAt ? formatDate(post.fetchedAt) : 'jeszcze nie pobrano'}
                      </td>
                    </>
                  ) : (
                    <td colSpan={5} className="py-2 text-xs text-muted-foreground">
                      Statystyki postów TikToka będą dostępne wkrótce.
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

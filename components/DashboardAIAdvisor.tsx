"use client";

import { Sparkles, TrendingUp, Clock3 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { apiClient } from '@/lib/api-client';

type JobPlatform = 'YOUTUBE' | 'TIKTOK' | 'INSTAGRAM' | 'FACEBOOK';

type ScheduledPost = {
  id: string;
  platform: JobPlatform;
  scheduledFor: string;
  status: 'PENDING' | 'RUNNING' | 'SUCCESS' | 'FAILED' | 'CANCELED';
  videoTitle?: string;
};

type AlertCard = {
  id: string;
  type: 'trend' | 'optimization';
  title: string;
  description: string;
  actionLabel: string;
  onAction: () => void;
};

const PLATFORM_COLORS: Record<JobPlatform, string> = {
  YOUTUBE: 'bg-red-500',
  TIKTOK: 'bg-black',
  INSTAGRAM: 'bg-pink-500',
  FACEBOOK: 'bg-blue-600',
};

const PLATFORM_LABELS: Record<JobPlatform, string> = {
  YOUTUBE: 'YouTube',
  TIKTOK: 'TikTok',
  INSTAGRAM: 'Instagram',
  FACEBOOK: 'Facebook',
};

export function DashboardAIAdvisor() {
  const [scheduledPosts, setScheduledPosts] = useState<ScheduledPost[]>([]);
  const [latestReadyVideoTitle, setLatestReadyVideoTitle] = useState<string>('Twój najnowszy materiał');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadAdvisorData = async () => {
      try {
        setIsLoading(true);

        const [jobsResponse, videosResponse] = await Promise.all([
          apiClient.get<{
            data: Array<{
              id: string;
              status: 'PENDING' | 'RUNNING' | 'SUCCESS' | 'FAILED' | 'CANCELED';
              scheduledFor: string;
              video?: { title?: string };
              socialAccount?: { platform?: JobPlatform };
            }>;
          }>('/jobs?limit=50&offset=0'),
          apiClient.get<Array<{ title: string }>>('/videos?status=READY'),
        ]);

        const next24h = Date.now() + 24 * 60 * 60 * 1000;

        const posts = jobsResponse.data.data
          .filter((job) => job.socialAccount?.platform)
          .map((job) => ({
            id: job.id,
            platform: job.socialAccount!.platform!,
            scheduledFor: job.scheduledFor,
            status: job.status,
            videoTitle: job.video?.title,
          }))
          .filter((post) => {
            const ts = new Date(post.scheduledFor).getTime();
            return ts >= Date.now() && ts <= next24h;
          })
          .sort((left, right) => new Date(left.scheduledFor).getTime() - new Date(right.scheduledFor).getTime());

        setScheduledPosts(posts);

        const readyVideo = videosResponse.data[0]?.title;
        if (readyVideo) {
          setLatestReadyVideoTitle(readyVideo);
        }
      } catch {
        setScheduledPosts([]);
      } finally {
        setIsLoading(false);
      }
    };

    void loadAdvisorData();
  }, []);

  const firstGapOver6h = useMemo(() => {
    if (scheduledPosts.length === 0) {
      return {
        from: new Date(),
        to: new Date(Date.now() + 6 * 60 * 60 * 1000),
      };
    }

    const timeline = [new Date(), ...scheduledPosts.map((post) => new Date(post.scheduledFor))];

    for (let index = 0; index < timeline.length - 1; index += 1) {
      const current = timeline[index];
      const next = timeline[index + 1];
      const gapMs = next.getTime() - current.getTime();

      if (gapMs > 6 * 60 * 60 * 1000) {
        return {
          from: current,
          to: next,
        };
      }
    }

    return null;
  }, [scheduledPosts]);

  const alerts = useMemo<AlertCard[]>(() => {
    const cards: AlertCard[] = [];

    cards.push({
      id: 'trend-1',
      type: 'trend',
      title: 'Trend Alert',
      description: `Trend na TikToku przyspiesza. Wideo „${latestReadyVideoTitle}” dobrze pasuje do formatu short.`,
      actionLabel: 'Generuj na podstawie trendu',
      onAction: () => {
        window.dispatchEvent(new Event('post-composer:open'));
      },
    });

    cards.push({
      id: 'opt-1',
      type: 'optimization',
      title: 'Optymalizacja',
      description: 'Twoi odbiorcy na Facebooku są bardziej aktywni rano. Przesunąć jutrzejszy post na 9:00?',
      actionLabel: 'Otwórz harmonogram',
      onAction: () => {
        window.location.assign('/schedule');
      },
    });

    return cards;
  }, [latestReadyVideoTitle]);

  return (
    <section className="space-y-4">
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {alerts.map((alert) => (
          <div key={alert.id} className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-foreground flex items-center gap-2">
                  {alert.type === 'trend' ? <TrendingUp className="w-4 h-4 text-primary" /> : <Sparkles className="w-4 h-4 text-primary" />}
                  {alert.title}
                </p>
                <p className="mt-2 text-sm text-muted-foreground">{alert.description}</p>
              </div>
              <button
                onClick={alert.onAction}
                className="rounded-lg border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/20"
              >
                {alert.actionLabel}
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Clock3 className="w-4 h-4 text-primary" />
            Najbliższe 24h
          </p>
          <button
            onClick={() => window.location.assign('/schedule')}
            className="text-xs text-primary hover:text-accent"
          >
            Otwórz harmonogram →
          </button>
        </div>

        <div className="mt-4 rounded-lg border border-border bg-secondary/20 p-3">
          <div className="relative h-16">
            <div className="absolute inset-x-0 top-7 border-t border-dashed border-border" />

            {scheduledPosts.map((post) => {
              const msFromNow = new Date(post.scheduledFor).getTime() - Date.now();
              const position = Math.max(0, Math.min(100, (msFromNow / (24 * 60 * 60 * 1000)) * 100));

              return (
                <div
                  key={post.id}
                  className="absolute -translate-x-1/2 top-2"
                  style={{ left: `${position}%` }}
                  title={`${PLATFORM_LABELS[post.platform]} • ${new Date(post.scheduledFor).toLocaleString('pl-PL')}`}
                >
                  <span className={`inline-flex h-5 w-5 rounded-full border border-white ${PLATFORM_COLORS[post.platform]}`} />
                </div>
              );
            })}

            {firstGapOver6h && (
              <button
                onClick={() => {
                  toast.message('Sugestia z biblioteki jest gotowa w Harmonogramie.');
                  window.location.assign('/schedule');
                }}
                className="absolute top-9 rounded-md border border-primary/30 bg-primary/10 px-2 py-1 text-[11px] text-primary hover:bg-primary/20"
                style={{ left: '50%', transform: 'translateX(-50%)' }}
              >
                AI Gap Filler: zaplanować {latestReadyVideoTitle}?
              </button>
            )}
          </div>

          <p className="mt-2 text-[11px] text-muted-foreground">
            {isLoading ? 'Analiza harmonogramu...' : `Zaplanowane: ${scheduledPosts.length} publikacji w 24h.`}
          </p>
        </div>
      </div>
    </section>
  );
}

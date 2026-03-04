"use client";

import { Youtube, Instagram, Music2, Facebook, CheckCircle2, Clock, XCircle, Info } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { apiClient } from '@/lib/api-client';

type PlatformKey = 'youtube' | 'instagram' | 'tiktok' | 'facebook';

interface Activity {
  id: string;
  videoName: string;
  platforms: PlatformKey[];
  status: 'success' | 'pending' | 'failed';
  statusLabel: 'ZAPLANOWANE' | 'W KOLEJCE' | 'SUKCES' | 'BŁĄD';
  scheduledDate: string;
  errorMessage?: string;
}

type PublishJobResponse = {
  id: string;
  status: 'PENDING' | 'RUNNING' | 'SUCCESS' | 'FAILED' | 'CANCELED';
  scheduledFor: string;
  errorMessage?: string | null;
  video?: {
    title?: string;
  };
  socialAccount?: {
    platform?: 'YOUTUBE' | 'INSTAGRAM' | 'TIKTOK' | 'FACEBOOK';
  };
};

type PaginatedActivityResponse = {
  data: PublishJobResponse[];
  totalCount: number;
  hasMore: boolean;
};

const platformIcons = {
  youtube: { icon: Youtube, color: 'text-red-500' },
  instagram: { icon: Instagram, color: 'text-pink-500' },
  tiktok: { icon: Music2, color: 'text-slate-400' },
  facebook: { icon: Facebook, color: 'text-blue-500' },
};

export function RecentActivity() {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const pageSize = 8;

  const loadActivities = useCallback(async (targetPage: number) => {
    try {
      const offset = (targetPage - 1) * pageSize;
      const response = await apiClient.get<PaginatedActivityResponse>(
        `/activity?limit=${pageSize}&offset=${offset}`,
      );

      const mapped: Activity[] = response.data.data.map((job) => {
        const platformRaw = job.socialAccount?.platform ?? 'YOUTUBE';
        const platform = platformRaw.toLowerCase() as PlatformKey;
        const scheduledFor = new Date(job.scheduledFor);
        const isScheduled =
          (job.status === 'PENDING' || job.status === 'RUNNING') &&
          scheduledFor.getTime() > Date.now();

        return {
          id: job.id,
          videoName: job.video?.title ?? 'Bez nazwy',
          platforms: [platform],
          status:
            job.status === 'SUCCESS'
              ? 'success'
              : job.status === 'FAILED' || job.status === 'CANCELED'
                ? 'failed'
                : 'pending',
          statusLabel:
            job.status === 'SUCCESS'
              ? 'SUKCES'
              : job.status === 'FAILED' || job.status === 'CANCELED'
                ? 'BŁĄD'
                : isScheduled
                  ? 'ZAPLANOWANE'
                  : 'W KOLEJCE',
          scheduledDate: scheduledFor.toLocaleString('pl-PL'),
          errorMessage: job.errorMessage ?? undefined,
        };
      });

      setActivities(mapped);
      setTotalCount(response.data.totalCount);
      setHasMore(response.data.hasMore);
    } catch {
      toast.error('Nie udało się pobrać ostatniej aktywności.');
    } finally {
      setIsLoading(false);
    }
  }, [pageSize]);

  useEffect(() => {
    setIsLoading(true);
    void loadActivities(page);
  }, [loadActivities, page]);

  useEffect(() => {
    const refreshHandler = () => {
      setPage(1);
      setIsLoading(true);
      void loadActivities(1);
    };

    window.addEventListener('publish-jobs:refresh', refreshHandler);

    return () => {
      window.removeEventListener('publish-jobs:refresh', refreshHandler);
    };
  }, [loadActivities]);

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  return (
    <div className="bg-card border border-border rounded-xl backdrop-blur-sm overflow-hidden">
      <div className="p-6 border-b border-border">
        <h2 className="text-lg font-semibold text-foreground">Ostatnia aktywność</h2>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-secondary/20">
              <th className="px-6 py-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Nazwa wideo
              </th>
              <th className="px-6 py-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Platformy
              </th>
              <th className="px-6 py-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Zaplanowano na
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {isLoading && (
              <tr>
                <td colSpan={4} className="px-6 py-8 text-sm text-muted-foreground text-center">
                  Ładowanie aktywności...
                </td>
              </tr>
            )}
            {!isLoading && activities.length === 0 && (
              <tr>
                <td colSpan={4} className="px-6 py-8 text-sm text-muted-foreground text-center">
                  Brak aktywności do wyświetlenia.
                </td>
              </tr>
            )}
            {activities.map((activity) => (
              <tr key={activity.id} className="hover:bg-secondary/30 transition-colors">
                <td className="px-6 py-4">
                  <p className="text-sm font-medium text-foreground">{activity.videoName}</p>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2">
                    {activity.platforms.map((platform) => {
                      const platformData = platformIcons[platform];
                      return (
                        <div
                          key={platform}
                          className="p-2 bg-secondary/50 rounded-lg"
                          title={platform}
                        >
                          <platformData.icon className={`w-4 h-4 ${platformData.color}`} />
                        </div>
                      );
                    })}
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2">
                    {activity.status === 'success' && (
                      <div className="flex items-center gap-2 px-3 py-1.5 bg-green-500/10 border border-green-500/20 rounded-lg">
                        <CheckCircle2 className="w-4 h-4 text-green-500" />
                        <span className="text-xs font-medium text-green-500">{activity.statusLabel}</span>
                      </div>
                    )}
                    {activity.status === 'pending' && (
                      <div className="flex items-center gap-2 px-3 py-1.5 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                        <Clock className="w-4 h-4 text-yellow-500" />
                        <span className="text-xs font-medium text-yellow-500">{activity.statusLabel}</span>
                      </div>
                    )}
                    {activity.status === 'failed' && (
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-2 px-3 py-1.5 bg-destructive/10 border border-destructive/20 rounded-lg">
                          <XCircle className="w-4 h-4 text-destructive" />
                          <span className="text-xs font-medium text-destructive">{activity.statusLabel}</span>
                        </div>
                        {activity.errorMessage && (
                          <div className="group relative">
                            <Info className="w-4 h-4 text-muted-foreground cursor-help" />
                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-popover border border-border rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all w-64 z-10">
                              <p className="text-xs text-popover-foreground">{activity.errorMessage}</p>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </td>
                <td className="px-6 py-4">
                  <p className="text-sm text-muted-foreground">{activity.scheduledDate}</p>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="p-4 border-t border-border flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Pokazano {activities.length} z {totalCount} aktywności (strona {page}/{totalPages})
        </p>
        <div className="flex gap-2 self-end sm:self-auto">
          <button
            onClick={() => setPage((current) => Math.max(1, current - 1))}
            disabled={page <= 1}
            className="px-4 py-2 bg-secondary/50 text-foreground rounded-lg hover:bg-secondary transition-all text-sm disabled:opacity-50"
          >
            Poprzednia
          </button>
          <button
            onClick={() => setPage((current) => current + 1)}
            disabled={!hasMore}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:shadow-lg hover:shadow-primary/30 transition-all text-sm disabled:opacity-50"
          >
            Następna
          </button>
        </div>
      </div>
    </div>
  );
}

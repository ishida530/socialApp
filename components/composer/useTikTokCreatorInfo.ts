import { useCallback, useEffect, useState } from 'react';
import { apiClient } from '@/lib/api-client';
import type { TikTokCreatorInfoResponse } from './types';

// TikTok Content Sharing Guidelines 1 ("API Clients must retrieve the latest creator info when
// rendering the Post to TikTok page"): fetched fresh on every mount for the exact account the
// post goes to - both the settings panel and the final publish step use it, never a cached copy.
export function useTikTokCreatorInfo(socialAccountId: string | null | undefined) {
  const [data, setData] = useState<TikTokCreatorInfoResponse | null>(null);
  const [isLoading, setIsLoading] = useState(Boolean(socialAccountId));
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!socialAccountId) {
      setData(null);
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setLoadError(null);

    apiClient
      .get<TikTokCreatorInfoResponse>('/social-accounts/tiktok/creator-info', {
        params: { socialAccountId },
      })
      .then((response) => {
        if (!cancelled) {
          setData(response.data);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setData(null);
          setLoadError(
            (error as { response?: { data?: { message?: string } } })?.response?.data?.message ||
              'Nie udało się pobrać ustawień konta TikTok.',
          );
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [socialAccountId, reloadKey]);

  const reload = useCallback(() => setReloadKey((value) => value + 1), []);

  return { data, isLoading, loadError, reload };
}

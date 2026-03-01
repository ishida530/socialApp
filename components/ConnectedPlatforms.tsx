"use client";

import { Youtube, Music2, CheckCircle2, XCircle, RefreshCw } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { apiClient } from '@/lib/api-client';
import { toast } from 'sonner';

type PlatformCard = {
  name: string;
  icon: typeof Youtube;
  color: string;
  apiPlatform: 'youtube' | 'tiktok';
};

const platforms: PlatformCard[] = [
  {
    name: 'YouTube',
    icon: Youtube,
    color: 'text-red-500',
    apiPlatform: 'youtube',
  },
  {
    name: 'TikTok',
    icon: Music2,
    color: 'text-slate-400',
    apiPlatform: 'tiktok',
  },
];

type SocialAccountDto = {
  id: string;
  platform: 'YOUTUBE' | 'TIKTOK' | 'INSTAGRAM' | 'FACEBOOK';
  handle: string;
  createdAt: string;
};

export function ConnectedPlatforms() {
  const [accounts, setAccounts] = useState<SocialAccountDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadingPlatform, setLoadingPlatform] = useState<string | null>(null);

  useEffect(() => {
    const loadAccounts = async () => {
      try {
        const response = await apiClient.get<SocialAccountDto[]>('/social-accounts');
        setAccounts(response.data);
      } catch {
        toast.error('Nie udało się pobrać połączonych platform.');
      } finally {
        setIsLoading(false);
      }
    };

    loadAccounts();
  }, []);

  const accountByPlatform = useMemo(() => {
    const map = new Map<'youtube' | 'tiktok', SocialAccountDto>();

    accounts.forEach((account) => {
      if (account.platform === 'YOUTUBE') {
        map.set('youtube', account);
      }

      if (account.platform === 'TIKTOK') {
        map.set('tiktok', account);
      }
    });

    return map;
  }, [accounts]);

  const connectAccount = async (platform: 'youtube' | 'tiktok') => {
    try {
      setLoadingPlatform(platform);
      const response = await apiClient.get<{ url?: string }>(
        `/social-accounts/auth-url/${platform}`,
      );
      const payload = response.data;

      if (!payload.url) {
        throw new Error('Brak URL autoryzacji w odpowiedzi API');
      }

      window.location.assign(payload.url);
    } catch {
      toast.error('Nie udało się rozpocząć procesu łączenia konta.');
    } finally {
      setLoadingPlatform(null);
    }
  };

  const formatDate = (date: string) =>
    new Date(date).toLocaleString('pl-PL', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });

  return (
    <div className="bg-card border border-border rounded-xl p-6 backdrop-blur-sm">
      <h2 className="text-lg font-semibold text-foreground mb-4">Połączone platformy</h2>
      
      <div className="grid grid-cols-2 gap-4">
        {platforms.map((platform) => (
          (() => {
            const account = accountByPlatform.get(platform.apiPlatform);
            const connected = !!account;

            return (
          <div
            key={platform.name}
            className="bg-secondary/30 border border-border rounded-xl p-4 hover:border-primary/50 transition-all backdrop-blur-sm"
          >
            <div className="flex items-start justify-between mb-3">
              <div className={`p-3 bg-background/50 rounded-lg ${platform.color}`}>
                <platform.icon className="w-6 h-6" />
              </div>
              <div className="flex items-center gap-1.5">
                {connected ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-green-500" />
                    <span className="text-xs font-medium text-green-500">Aktywny</span>
                  </>
                ) : (
                  <>
                    <XCircle className="w-4 h-4 text-muted-foreground" />
                    <span className="text-xs font-medium text-muted-foreground">Rozłączono</span>
                  </>
                )}
              </div>
            </div>
            
            <h3 className="text-sm font-semibold text-foreground mb-3">{platform.name}</h3>

            {connected && account ? (
              <p className="text-xs text-muted-foreground mb-3">
                Połączono: {formatDate(account.createdAt)}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground mb-3">
                {isLoading ? 'Sprawdzanie statusu...' : 'Konto niepołączone'}
              </p>
            )}
            
            <button
              onClick={() => connectAccount(platform.apiPlatform)}
              disabled={loadingPlatform === platform.apiPlatform}
              className={`w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm transition-all ${
                connected
                  ? 'bg-secondary/50 text-foreground hover:bg-secondary'
                  : 'bg-primary/10 text-primary hover:bg-primary/20'
              } ${
                loadingPlatform === platform.apiPlatform
                  ? 'opacity-60 cursor-not-allowed'
                  : ''
              }`}
            >
              <RefreshCw className="w-4 h-4" />
              <span>
                {loadingPlatform === platform.apiPlatform
                  ? 'Przekierowanie...'
                  : connected
                    ? 'Połącz ponownie'
                    : 'Połącz'}
              </span>
            </button>
          </div>
            );
          })()
        ))}
      </div>
    </div>
  );
}

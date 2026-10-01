"use client";

import { CheckCircle2, XCircle, RefreshCw } from 'lucide-react';
import {
  FacebookLogoWhite,
  GoogleGLogo,
  PlatformBrandIcon,
  TikTokLogo,
  type BrandPlatform,
} from '@/components/BrandIcons';
import { useEffect, useMemo, useState } from 'react';
import { apiClient } from '@/lib/api-client';
import { toast } from 'sonner';

type PlatformCard = {
  name: string;
  brand: BrandPlatform;
  apiPlatform: 'youtube' | 'tiktok' | 'instagram' | 'facebook' | 'linkedin';
  // Shown BEFORE connecting (2026-09-30): the platform-side prerequisites that otherwise surface
  // only as a failed connection - most new users hit the Instagram/Facebook ones.
  requirement: string;
};

const platforms: PlatformCard[] = [
  {
    name: 'YouTube',
    brand: 'YOUTUBE',
    apiPlatform: 'youtube',
    requirement: 'Zaloguj się kontem Google, które ma kanał YouTube, i zaznacz wszystkie uprawnienia na ekranie zgody.',
  },
  {
    name: 'TikTok',
    brand: 'TIKTOK',
    apiPlatform: 'tiktok',
    requirement: 'Zaloguj się w oknie TikToka na konto, na którym chcesz publikować. Każdy post zatwierdzasz ręcznie w Postfly.',
  },
  {
    name: 'Instagram',
    brand: 'INSTAGRAM',
    apiPlatform: 'instagram',
    requirement:
      'Wymaga konta Instagram firmowego lub twórcy, połączonego ze Stroną Facebook. Logujesz się przez Facebooka — zaznacz tam tę Stronę i konto Instagram.',
  },
  {
    name: 'Facebook',
    brand: 'FACEBOOK',
    apiPlatform: 'facebook',
    requirement:
      'Publikujemy na Stronie Facebook (nie na profilu prywatnym). Musisz być jej administratorem — w oknie Facebooka wybierz Stronę do podłączenia.',
  },
  {
    name: 'LinkedIn',
    brand: 'LINKEDIN',
    apiPlatform: 'linkedin',
    requirement: 'Publikujemy na Twoim profilu osobistym. LinkedIn wymaga ponownego połączenia co ok. 60 dni.',
  },
];

// Connect buttons follow each provider's sign-in branding (2026-10-01, app review): Meta Platform
// Policy 8.3 requires a clearly branded Facebook Login button (Facebook + Instagram both use
// Facebook Login here), Google's sign-in guidelines the white button with the "G" (YouTube is a
// Google OAuth flow), TikTok's Login Kit the "Continue with TikTok" call to action.
function ConnectCta({ apiPlatform }: { apiPlatform: PlatformCard['apiPlatform'] }) {
  if (apiPlatform === 'youtube') {
    return (
      <>
        <GoogleGLogo className="h-4 w-4" />
        <span>Kontynuuj z Google</span>
      </>
    );
  }
  if (apiPlatform === 'tiktok') {
    return (
      <>
        <TikTokLogo className="h-4 w-4" />
        <span>Kontynuuj z TikTok</span>
      </>
    );
  }
  if (apiPlatform === 'facebook' || apiPlatform === 'instagram') {
    return (
      <>
        <FacebookLogoWhite className="h-4 w-4" />
        <span>Kontynuuj z Facebookiem</span>
      </>
    );
  }
  return (
    <>
      <RefreshCw className="w-4 h-4" />
      <span>Połącz</span>
    </>
  );
}

const CONNECT_BUTTON_STYLE: Record<PlatformCard['apiPlatform'], string> = {
  youtube: 'bg-white text-[#1F1F1F] border border-[#747775] hover:bg-gray-50',
  tiktok: 'bg-black text-white hover:bg-black/85 dark:border dark:border-white/30',
  facebook: 'bg-[#1877F2] text-white hover:bg-[#166FE5]',
  instagram: 'bg-[#1877F2] text-white hover:bg-[#166FE5]',
  linkedin: 'bg-primary/10 text-primary hover:bg-primary/20',
};

type SocialAccountDto = {
  id: string;
  platform: 'YOUTUBE' | 'TIKTOK' | 'INSTAGRAM' | 'FACEBOOK' | 'LINKEDIN';
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

  const accountsByPlatform = useMemo(() => {
    const map = new Map<'youtube' | 'tiktok' | 'instagram' | 'facebook' | 'linkedin', SocialAccountDto[]>();

    map.set('youtube', []);
    map.set('tiktok', []);
    map.set('instagram', []);
    map.set('facebook', []);
    map.set('linkedin', []);

    accounts.forEach((account) => {
      if (account.platform === 'YOUTUBE') {
        map.get('youtube')?.push(account);
      }

      if (account.platform === 'TIKTOK') {
        map.get('tiktok')?.push(account);
      }

      if (account.platform === 'INSTAGRAM') {
        map.get('instagram')?.push(account);
      }

      if (account.platform === 'FACEBOOK') {
        map.get('facebook')?.push(account);
      }

      if (account.platform === 'LINKEDIN') {
        map.get('linkedin')?.push(account);
      }
    });

    map.forEach((value, key) => {
      map.set(
        key,
        [...value].sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        ),
      );
    });

    return map;
  }, [accounts]);

  const connectAccount = async (platform: 'youtube' | 'tiktok' | 'instagram' | 'facebook' | 'linkedin') => {
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
    } catch (error: unknown) {
      toast.error(
        (error as { response?: { data?: { message?: string } } })?.response?.data?.message ||
          'Nie udało się rozpocząć procesu łączenia konta.',
      );
    } finally {
      setLoadingPlatform(null);
    }
  };

  const disconnectAccount = async (accountId: string) => {
    try {
      setLoadingPlatform(accountId);
      await apiClient.delete(`/social-accounts/${accountId}`);
      setAccounts((current) => current.filter((account) => account.id !== accountId));
      toast.success('Konto zostało odłączone.');
    } catch {
      toast.error('Nie udało się odłączyć konta.');
    } finally {
      setLoadingPlatform(null);
    }
  };

  const reconnectAccount = async (accountId: string) => {
    try {
      setLoadingPlatform(accountId);
      const response = await apiClient.post<{ url?: string }>(
        `/social-accounts/${accountId}/reconnect`,
      );

      if (!response.data.url) {
        throw new Error('Brak URL autoryzacji w odpowiedzi API');
      }

      window.location.assign(response.data.url);
    } catch {
      toast.error('Nie udało się rozpocząć ponownej autoryzacji.');
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
      <h2 className="text-lg font-semibold text-foreground mb-1">Połączone platformy</h2>
      <p className="text-xs text-muted-foreground mb-4">Liczba kont: {accounts.length}</p>
      <p className="text-xs text-muted-foreground mb-4">
        Publikacja trafi na ostatnio połączone konto dla danej platformy.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {platforms.map((platform) => {
          const platformAccounts = accountsByPlatform.get(platform.apiPlatform) ?? [];
          const connected = platformAccounts.length > 0;

          return (
          <div
            key={platform.name}
            className="bg-secondary/30 border border-border rounded-xl p-4 hover:border-primary/50 transition-all backdrop-blur-sm"
          >
            <div className="flex items-start justify-between mb-3">
              {platform.brand === 'YOUTUBE' ? (
                // YouTube branding guidelines: the logo links to YouTube.
                <a
                  href="https://www.youtube.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-3 bg-background/50 rounded-lg"
                  aria-label="YouTube"
                >
                  <PlatformBrandIcon platform={platform.brand} className="w-6 h-6" />
                </a>
              ) : (
                <div className="p-3 bg-background/50 rounded-lg text-foreground">
                  <PlatformBrandIcon platform={platform.brand} className="w-6 h-6" />
                </div>
              )}
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
            
            <h3 className="text-sm font-semibold text-foreground mb-1">{platform.name}</h3>
            <p className="text-[11px] text-muted-foreground mb-3">{platform.requirement}</p>

            {connected ? (
              <p className="text-xs text-muted-foreground mb-3">
                Połączonych kont: {platformAccounts.length}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground mb-3">
                {isLoading ? 'Sprawdzanie statusu...' : 'Konto niepołączone'}
              </p>
            )}

            <button
              onClick={() => connectAccount(platform.apiPlatform)}
              disabled={loadingPlatform === platform.apiPlatform}
              className={`w-full mb-3 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${CONNECT_BUTTON_STYLE[platform.apiPlatform]} ${
                loadingPlatform === platform.apiPlatform
                  ? 'opacity-60 cursor-not-allowed'
                  : ''
              }`}
            >
              {loadingPlatform === platform.apiPlatform ? (
                <span>Przekierowanie...</span>
              ) : (
                <ConnectCta apiPlatform={platform.apiPlatform} />
              )}
            </button>
            {connected && (
              <p className="-mt-2 mb-3 text-[11px] text-muted-foreground text-center">
                Przycisk wyżej dodaje kolejne konto.
              </p>
            )}

            {connected && (
              <div className="space-y-2">
                {platformAccounts.map((account) => (
                  <div key={account.id} className="rounded-lg border border-border bg-background/40 p-2.5">
                    <p className="text-xs font-medium text-foreground truncate">{account.handle || 'Konto bez nazwy'}</p>
                    <p className="text-[11px] text-muted-foreground mt-1">Połączono: {formatDate(account.createdAt)}</p>
                    <div className="grid grid-cols-2 gap-2 mt-2">
                      <button
                        onClick={() => reconnectAccount(account.id)}
                        disabled={loadingPlatform === account.id}
                        className={`flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm transition-all bg-secondary/50 text-foreground hover:bg-secondary ${
                          loadingPlatform === account.id
                            ? 'opacity-60 cursor-not-allowed'
                            : ''
                        }`}
                      >
                        <RefreshCw className="w-4 h-4" />
                        <span>Połącz ponownie</span>
                      </button>

                      <button
                        onClick={() => disconnectAccount(account.id)}
                        disabled={loadingPlatform === account.id}
                        className={`px-3 py-2 rounded-lg text-sm transition-all bg-destructive/10 border border-destructive/30 text-destructive hover:bg-destructive/20 ${
                          loadingPlatform === account.id
                            ? 'opacity-60 cursor-not-allowed'
                            : ''
                        }`}
                      >
                        Rozłącz
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          );
        })}
      </div>
    </div>
  );
}

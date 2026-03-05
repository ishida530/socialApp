import { Plus, ChevronDown, Wifi, WifiOff, Moon, Sun } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { apiClient } from '@/lib/api-client';
import { useAuth } from '@/contexts/auth-context';

export function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const [apiConnected, setApiConnected] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const { logout, user } = useAuth();
  const { theme, setTheme } = useTheme();

  const pageTitle =
    pathname === '/dashboard'
      ? 'Pulpit'
      : pathname.startsWith('/schedule') || pathname.startsWith('/campaigns')
        ? 'Kampanie i harmonogram'
        : pathname.startsWith('/social-accounts')
          ? 'Połączone konta'
          : pathname.startsWith('/media-library')
            ? 'Biblioteka mediów'
            : pathname.startsWith('/analytics')
              ? 'Analityka'
              : pathname.startsWith('/billing')
                ? 'Subskrypcja'
                : pathname.startsWith('/admin')
                  ? 'Panel administracyjny'
                  : 'Pulpit';

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    let isMounted = true;

    const checkHealth = async () => {
      try {
        await apiClient.get('/health');
        if (isMounted) {
          setApiConnected(true);
        }
      } catch {
        if (isMounted) {
          setApiConnected(false);
        }
      }
    };

    void checkHealth();
    const intervalId = window.setInterval(() => {
      void checkHealth();
    }, 30000);

    return () => {
      isMounted = false;
      window.clearInterval(intervalId);
    };
  }, []);

  return (
    <header className="min-h-16 bg-card border-b border-border px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3 min-w-0">
        <h1 className="text-base sm:text-xl font-semibold text-foreground truncate">{pageTitle}</h1>
      </div>

      <div className="flex items-center gap-2 sm:gap-4 w-full sm:w-auto justify-end">
        <div className="hidden sm:flex items-center gap-2 px-3 py-2 bg-secondary/50 rounded-lg backdrop-blur-sm">
          {apiConnected ? (
            <>
              <Wifi className="w-4 h-4 text-green-500" />
              <span className="text-sm text-foreground">API Połączone</span>
            </>
          ) : (
            <>
              <WifiOff className="w-4 h-4 text-destructive" />
              <span className="text-sm text-foreground">API Rozłączone</span>
            </>
          )}
        </div>

        <div className="hidden md:flex items-center rounded-lg border border-border bg-card/50 p-1">
          <button
            type="button"
            onClick={() => setTheme('light')}
            className={`rounded-md p-1.5 transition-colors ${mounted && theme === 'light' ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
            aria-label="Wlacz jasny motyw"
            title="Jasny motyw"
          >
            <Sun className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setTheme('dark')}
            className={`rounded-md p-1.5 transition-colors ${mounted && theme === 'dark' ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
            aria-label="Wlacz ciemny motyw"
            title="Ciemny motyw"
          >
            <Moon className="h-4 w-4" />
          </button>
        </div>

        <button
          onClick={() => {
            window.dispatchEvent(new Event('post-composer:open'));
          }}
          className="flex items-center gap-2 px-3 sm:px-5 py-2 sm:py-2.5 bg-primary text-primary-foreground rounded-xl hover:bg-primary/90 hover:shadow-lg hover:shadow-primary/30 transition-all"
        >
          <Plus className="w-4 h-4 sm:w-5 sm:h-5" />
          <span className="text-sm sm:text-base">Nowy post</span>
        </button>

        <div className="relative">
          <button
            onClick={() => setMenuOpen((current) => !current)}
            className="flex items-center gap-2 sm:gap-3 px-2 sm:px-3 py-2 bg-secondary/50 rounded-lg hover:bg-secondary transition-colors backdrop-blur-sm"
          >
            <div className="w-8 h-8 bg-gradient-to-br from-primary to-accent rounded-full flex items-center justify-center">
              <span className="text-sm font-semibold text-primary-foreground">{user?.email?.slice(0, 2).toUpperCase() ?? 'FS'}</span>
            </div>
            <div className="text-left hidden md:block max-w-36">
              <p className="text-sm font-medium text-foreground truncate">{user?.email ?? 'Użytkownik'}</p>
              <p className="text-xs text-muted-foreground">Panel</p>
            </div>
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          </button>

          {menuOpen && (
            <div className="absolute right-0 mt-2 min-w-44 rounded-lg border border-border bg-card p-2 shadow-lg z-20">
              <div className="mb-1 border-b border-border pb-2 md:hidden">
                <p className="px-3 py-1 text-xs text-muted-foreground">Motyw</p>
                <div className="flex items-center gap-1 px-2">
                  <button
                    type="button"
                    onClick={() => setTheme('light')}
                    className={`rounded-md p-1.5 transition-colors ${mounted && theme === 'light' ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                    aria-label="Wlacz jasny motyw"
                    title="Jasny motyw"
                  >
                    <Sun className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setTheme('dark')}
                    className={`rounded-md p-1.5 transition-colors ${mounted && theme === 'dark' ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                    aria-label="Wlacz ciemny motyw"
                    title="Ciemny motyw"
                  >
                    <Moon className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <button
                onClick={() => {
                  setMenuOpen(false);
                  router.push('/billing');
                }}
                className="w-full text-left px-3 py-2 rounded-md text-sm text-foreground hover:bg-secondary"
              >
                Subskrypcja
              </button>
              <button
                onClick={() => {
                  setMenuOpen(false);
                  logout();
                  router.replace('/login');
                }}
                className="w-full text-left px-3 py-2 rounded-md text-sm text-destructive hover:bg-destructive/10"
              >
                Wyloguj
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

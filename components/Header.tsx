import { Plus, ChevronDown, Wifi, WifiOff } from 'lucide-react';
import { useEffect, useState } from 'react';
import { apiClient } from '@/lib/api-client';
import { useAuth } from '@/contexts/auth-context';

export function Header() {
  const [apiConnected, setApiConnected] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const { logout, user } = useAuth();

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
        <h1 className="text-base sm:text-xl font-semibold text-foreground truncate">Dashboard</h1>
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

        <button
          onClick={() => {
            const composer = document.getElementById('post-composer');
            composer?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }}
          className="flex items-center gap-2 px-3 sm:px-5 py-2 sm:py-2.5 bg-gradient-to-r from-primary to-accent text-primary-foreground rounded-xl hover:shadow-lg hover:shadow-primary/30 transition-all"
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
              <span className="text-sm font-semibold text-white">{user?.email?.slice(0, 2).toUpperCase() ?? 'FS'}</span>
            </div>
            <div className="text-left hidden md:block max-w-36">
              <p className="text-sm font-medium text-foreground truncate">{user?.email ?? 'Użytkownik'}</p>
              <p className="text-xs text-muted-foreground">Panel</p>
            </div>
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          </button>

          {menuOpen && (
            <div className="absolute right-0 mt-2 min-w-44 rounded-lg border border-border bg-card p-2 shadow-lg z-20">
              <button
                onClick={() => {
                  setMenuOpen(false);
                  window.location.assign('/billing');
                }}
                className="w-full text-left px-3 py-2 rounded-md text-sm text-foreground hover:bg-secondary"
              >
                Subskrypcja
              </button>
              <button
                onClick={() => {
                  setMenuOpen(false);
                  logout();
                  window.location.assign('/login');
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

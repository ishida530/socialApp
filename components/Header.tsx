import { Plus, ChevronDown, Wifi, WifiOff } from 'lucide-react';
import { useState } from 'react';

export function Header() {
  const [apiConnected, setApiConnected] = useState(true);

  return (
    <header className="h-16 bg-card border-b border-border px-6 flex items-center justify-between">
      <div className="flex items-center gap-4">
        <h1 className="text-xl font-semibold text-foreground">Dashboard</h1>
      </div>

      <div className="flex items-center gap-4">
        {/* API Status */}
        <div className="flex items-center gap-2 px-3 py-2 bg-secondary/50 rounded-lg backdrop-blur-sm">
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

        {/* New Post Button */}
        <button className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-primary to-accent text-primary-foreground rounded-xl hover:shadow-lg hover:shadow-primary/30 transition-all">
          <Plus className="w-5 h-5" />
          <span>Nowy post</span>
        </button>

        {/* Profile Switcher */}
        <button className="flex items-center gap-3 px-3 py-2 bg-secondary/50 rounded-lg hover:bg-secondary transition-colors backdrop-blur-sm">
          <div className="w-8 h-8 bg-gradient-to-br from-primary to-accent rounded-full flex items-center justify-center">
            <span className="text-sm font-semibold text-white">JK</span>
          </div>
          <div className="text-left">
            <p className="text-sm font-medium text-foreground">Jan Kowalski</p>
            <p className="text-xs text-muted-foreground">Admin</p>
          </div>
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        </button>
      </div>
    </header>
  );
}

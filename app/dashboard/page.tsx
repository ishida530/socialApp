'use client';

import { Dashboard } from '@/components/Dashboard';
import { useAuth } from '@/contexts/auth-context';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function DashboardPage() {
  const { isAuthenticated, isLoading, sessionError, retrySession } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !isAuthenticated && !sessionError) {
      router.replace('/login');
    }
  }, [isAuthenticated, isLoading, sessionError, router]);

  if (sessionError) {
    return (
      <main className="min-h-screen bg-background flex flex-col items-center justify-center gap-3">
        <p className="text-sm text-muted-foreground">Nie udało się połączyć z serwerem.</p>
        <button
          type="button"
          onClick={retrySession}
          className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium"
        >
          Spróbuj ponownie
        </button>
      </main>
    );
  }

  if (isLoading || !isAuthenticated) {
    return (
      <main className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-sm text-muted-foreground">Ładowanie sesji...</p>
      </main>
    );
  }

  return <Dashboard />;
}

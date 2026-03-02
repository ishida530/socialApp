'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/Sidebar';
import { Header } from '@/components/Header';
import { ConnectedPlatforms } from '@/components/ConnectedPlatforms';
import { useAuth } from '@/contexts/auth-context';

export default function SocialAccountsPage() {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace('/login');
    }
  }, [isAuthenticated, isLoading, router]);

  if (isLoading || !isAuthenticated) {
    return (
      <main className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-sm text-muted-foreground">Ładowanie sesji...</p>
      </main>
    );
  }

  return (
    <div className="size-full flex bg-background dark">
      <Sidebar />

      <div className="flex-1 flex flex-col min-w-0">
        <Header />

        <main className="flex-1 overflow-y-auto p-6">
          <ConnectedPlatforms />
        </main>
      </div>
    </div>
  );
}
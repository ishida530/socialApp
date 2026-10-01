'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';

// Server-rendered authenticated pages already redirect logged-out visitors before rendering
// (getServerSession). This only covers the session ending WHILE the page is open (token expiry,
// logout in another tab): once the client-side auth context resolves to "not logged in", go to
// /login - the same behavior the old client-only pages had.
export function ClientSessionGuard() {
  const { isAuthenticated, isLoading, sessionError } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !isAuthenticated && !sessionError) {
      router.replace('/login');
    }
  }, [isAuthenticated, isLoading, sessionError, router]);

  return null;
}

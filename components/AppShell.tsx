'use client';

import { usePathname } from 'next/navigation';
import { Header } from '@/components/Header';
import { Sidebar } from '@/components/Sidebar';

const NO_SHELL_PATHS = [
  '/',
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
  '/callback',
  '/privacy',
  '/terms',
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const withShell = !NO_SHELL_PATHS.some((route) => pathname === route || pathname.startsWith(`${route}/`));

  if (!withShell) {
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-dvh overflow-hidden bg-background">
      <Sidebar />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <Header />
        {children}
      </div>
    </div>
  );
}

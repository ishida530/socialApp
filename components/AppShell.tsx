'use client';

import { usePathname } from 'next/navigation';
import { Header } from '@/components/Header';
import { Sidebar } from '@/components/Sidebar';

const NO_SHELL_PATHS = ['/login', '/register', '/callback', '/privacy', '/terms'];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const withShell = !NO_SHELL_PATHS.some((route) => pathname === route || pathname.startsWith(`${route}/`));

  if (!withShell) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen flex bg-background dark">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Header />
        {children}
      </div>
    </div>
  );
}

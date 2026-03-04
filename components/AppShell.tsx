'use client';

import { usePathname } from 'next/navigation';
import { Header } from '@/components/Header';
import { Sidebar } from '@/components/Sidebar';

const NO_SHELL_PATHS = ['/login', '/register', '/callback', '/privacy', '/terms'];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const withShell = !NO_SHELL_PATHS.some((route) => pathname === route || pathname.startsWith(`${route}/`));

  if (!withShell) {
    return <div className="h-full overflow-y-auto">{children}</div>;
  }

  return (
    <div className="flex h-full overflow-hidden bg-background dark">
      <Sidebar />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <Header />
        {children}
      </div>
    </div>
  );
}

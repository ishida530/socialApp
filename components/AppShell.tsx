'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Header } from '@/components/Header';
import { Sidebar } from '@/components/Sidebar';
import { SiteFooter } from '@/components/SiteFooter';
import { Suspense } from 'react';
import { EmailVerificationBanner } from '@/components/EmailVerificationBanner';

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

  // Page transition (2026-10-01): a CSS enter animation keyed by the path, instead of
  // framer-motion's AnimatePresence mode="wait" - that one held every navigation back until the
  // previous page's exit animation finished, and shipped framer-motion with every page.
  // `animate-page-enter` respects prefers-reduced-motion (styles/theme.css).
  if (!withShell) {
    return (
      <div key={pathname} className="animate-page-enter">
        {children}
        <SiteFooter />
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh overflow-hidden bg-background">
      <Sidebar />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col lg:pl-64">
        <div className="fixed left-0 right-0 top-0 z-30 lg:left-64">
          <Header />
        </div>
        <main key={pathname} className="animate-page-enter min-h-0 min-w-0 flex-1 pt-20">
          {/* useSearchParams needs a Suspense boundary of its own. */}
          <Suspense fallback={null}>
            <EmailVerificationBanner />
          </Suspense>
          {children}
        </main>
      </div>

      <nav
        className="hidden fixed bottom-20 right-3 z-50 rounded-full border border-border/70 bg-card/90 px-3 py-2 text-xs shadow-lg backdrop-blur-sm lg:block lg:bottom-4 lg:right-4"
      >
        <div className="flex items-center gap-3 text-muted-foreground">
          <Link href="/" className="transition-colors hover:text-foreground">
            Strona główna
          </Link>
          <span aria-hidden="true" className="text-border">|</span>
          <Link href="/terms" className="transition-colors hover:text-foreground">
            Regulamin
          </Link>
          <span aria-hidden="true" className="text-border">|</span>
          <Link href="/privacy" className="transition-colors hover:text-foreground">
            Prywatność
          </Link>
        </div>
      </nav>

    </div>
  );
}

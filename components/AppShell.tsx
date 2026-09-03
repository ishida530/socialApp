'use client';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Header } from '@/components/Header';
import { Sidebar } from '@/components/Sidebar';
import { SiteFooter } from '@/components/SiteFooter';

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
  const shouldReduceMotion = useReducedMotion();
  const withShell = !NO_SHELL_PATHS.some((route) => pathname === route || pathname.startsWith(`${route}/`));

  const transition = shouldReduceMotion
    ? { duration: 0 }
    : { duration: 0.26, ease: [0.22, 1, 0.36, 1] as const };

  const pageVariants = {
    initial: shouldReduceMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: 10 },
    animate: { opacity: 1, y: 0 },
    exit: shouldReduceMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: -8 },
  };

  if (!withShell) {
    return (
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={pathname}
          variants={pageVariants}
          initial="initial"
          animate="animate"
          exit="exit"
          transition={transition}
        >
          {children}
          <SiteFooter />
        </motion.div>
      </AnimatePresence>
    );
  }

  return (
    <div className="flex min-h-dvh overflow-hidden bg-background">
      <Sidebar />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col lg:pl-64">
        <div className="fixed left-0 right-0 top-0 z-30 lg:left-64">
          <Header />
        </div>
        <AnimatePresence mode="wait" initial={false}>
          <motion.main
            key={pathname}
            variants={pageVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={transition}
            className="min-h-0 min-w-0 flex-1 pt-20"
          >
            {children}
          </motion.main>
        </AnimatePresence>
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

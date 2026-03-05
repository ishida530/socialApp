'use client';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
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
        </motion.div>
      </AnimatePresence>
    );
  }

  return (
    <div className="flex min-h-dvh overflow-hidden bg-background">
      <Sidebar />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <Header />
        <AnimatePresence mode="wait" initial={false}>
          <motion.main
            key={pathname}
            variants={pageVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={transition}
            className="min-h-0 min-w-0 flex-1"
          >
            {children}
          </motion.main>
        </AnimatePresence>
      </div>
    </div>
  );
}

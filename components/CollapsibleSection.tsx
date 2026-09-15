'use client';

import { ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';

// EPIC 10 TASK-10.2 (UI Designer, 2026-09-15) - progressive disclosure building block. The audit
// (docs/UX_AUDIT.md) found app/account/page.tsx stacking 5 unrelated decisions (Telegram link,
// business description, autopilot, 2FA, delete account) as flat always-expanded sections - this
// wraps each one so only its status is visible at a glance, and the actual controls only appear
// once the user asks for them. Controlled (open/onOpenChange), not internal state, so a parent can
// force a section open (e.g. auto-expanding 2FA right after enabling it to show backup codes).
// Same transition curve as components/AppShell.tsx's page transitions, for consistency.
type CollapsibleSectionProps = {
  title: string;
  description?: string;
  badge?: ReactNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  variant?: 'default' | 'destructive';
  children: ReactNode;
};

export function CollapsibleSection({
  title,
  description,
  badge,
  open,
  onOpenChange,
  variant = 'default',
  children,
}: CollapsibleSectionProps) {
  const shouldReduceMotion = useReducedMotion();
  const transition = shouldReduceMotion ? { duration: 0 } : { duration: 0.22, ease: [0.22, 1, 0.36, 1] as const };
  const isDestructive = variant === 'destructive';

  return (
    <section
      className={`bg-card rounded-xl overflow-hidden max-w-2xl border ${
        isDestructive ? 'border-destructive/40' : 'border-border'
      }`}
    >
      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        aria-expanded={open}
        className="w-full flex items-start justify-between gap-4 p-6 text-left"
      >
        <div>
          <h2 className={`text-lg font-semibold ${isDestructive ? 'text-destructive' : 'text-foreground'}`}>{title}</h2>
          {description && <p className="text-sm text-muted-foreground mt-1">{description}</p>}
        </div>
        <div className="flex items-center gap-3 shrink-0 pt-0.5">
          {badge}
          <svg
            aria-hidden="true"
            viewBox="0 0 20 20"
            className={`h-5 w-5 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`}
          >
            <path fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" d="M5 7.5L10 12.5L15 7.5" />
          </svg>
        </div>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={transition}
            className="overflow-hidden"
          >
            <div className="px-6 pb-6 space-y-4">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

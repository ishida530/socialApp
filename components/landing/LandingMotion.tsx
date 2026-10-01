'use client';

import { createContext, useContext, useEffect, useRef, type ReactNode } from 'react';
import { motion, useAnimationControls, useInView, useScroll, type Variants } from 'framer-motion';
import type { sectionFromLeft } from './landing-motion';

// Small client islands for the landing page (2026-10-01, landing split): the static sections are
// Server Components; only these wrappers ship as JS. LandingExperience provides the context.
export type ScrollDirection = 'up' | 'down';

export const LandingMotionContext = createContext<{ scrollDirection: ScrollDirection; motionBudgetReduced: boolean }>({
  scrollDirection: 'down',
  motionBudgetReduced: false,
});

type SectionRevealProps = {
  children: ReactNode;
  className: string;
  variants: typeof sectionFromLeft;
};

// Reveals a section when it scrolls into view (down), hides it again when scrolling back up past it.
export function SectionReveal({ children, className, variants }: SectionRevealProps) {
  const { scrollDirection } = useContext(LandingMotionContext);
  const sectionRef = useRef<HTMLDivElement | null>(null);
  const controls = useAnimationControls();
  const isInView = useInView(sectionRef, { amount: 0.15 });
  const { scrollYProgress } = useScroll({ target: sectionRef, offset: ['start end', 'end start'] });

  useEffect(() => {
    if (isInView && scrollDirection === 'down') {
      controls.start('show');
    }
  }, [controls, isInView, scrollDirection]);

  useEffect(() => {
    const unsubscribe = scrollYProgress.on('change', (latest) => {
      if (scrollDirection === 'up' && latest < 0.20) {
        controls.start('hidden');
      }
    });

    return () => unsubscribe();
  }, [controls, scrollDirection, scrollYProgress]);

  return (
    <motion.div ref={sectionRef} initial="hidden" animate={controls} variants={variants} className={className}>
      {children}
    </motion.div>
  );
}

// Hover lift / tap press, switched off when the visitor prefers reduced motion or on low-power devices.
export function InteractiveMotion({
  children,
  className,
  variants,
}: {
  children: ReactNode;
  className?: string;
  variants?: Variants;
}) {
  const { motionBudgetReduced } = useContext(LandingMotionContext);
  return (
    <motion.div
      variants={variants}
      whileHover={motionBudgetReduced ? undefined : { y: -4, scale: 1.01 }}
      whileTap={motionBudgetReduced ? undefined : { scale: 0.98 }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

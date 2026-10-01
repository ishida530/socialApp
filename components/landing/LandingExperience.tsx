"use client";

import Link from 'next/link';
import { AnimatePresence, motion, useAnimationControls, useInView, useMotionValue, useReducedMotion, useScroll, useSpring, useTransform } from 'framer-motion';
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { ArrowUpRight, CalendarClock, Layers, Sparkles, CircleCheckBig, CircleHelp, Moon, Sun } from 'lucide-react';
import { PlatformBrandIcon } from '@/components/BrandIcons';
import { useTheme } from 'next-themes';
import { trackLandingEvent } from '@/lib/landing-events';
import { BrandLogo } from '@/components/BrandLogo';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import {
  type MarketingPlan,
} from '@/lib/billing/capabilities';
import { useBillingCapabilities } from '@/hooks/useBillingCapabilities';
import { CONTACT_CATEGORIES, type ContactCategory } from '@/lib/contact';
import { useAuth } from '@/contexts/auth-context';
import { LandingMotionContext, SectionReveal, type ScrollDirection } from '@/components/landing/LandingMotion';
import { container, item, sectionFromLeft, sectionFromRight } from '@/components/landing/landing-motion';


const heroHighlights = ['4 platformy', 'AI podpowiedzi', 'Start w 2 minuty'];

const heroProofStrip = [
  { value: '3 • 10 • 25', label: 'Konta social: Starter / Pro / Business' },
  { value: '15 • 100', label: 'Wideo mies.: Starter / Pro' },
  { value: '7 dni', label: 'Trial z subskrypcją Pro' },
];

const heroFlowSteps = [
  'Podłączasz kanały i ustawiasz cele publikacji.',
  'System proponuje okna publikacji i układa kolejkę.',
  'Publikujesz regularnie i monitorujesz wynik w jednym panelu.',
];


const floatingElements = [
  { id: 'orb-1', className: 'left-[6%] top-[14%] h-20 w-20 rounded-full bg-primary/20', x: [0, 64, 118, 82, 0], y: [0, 18, 56, 28, 0], rotate: [0, 10, 16, 8, 0], duration: 20 },
  { id: 'orb-2', className: 'right-[9%] top-[20%] h-16 w-16 rounded-full bg-accent/25', x: [0, -22, -46, -18, 0], y: [0, 34, 84, 46, 0], rotate: [0, -9, -14, -7, 0], duration: 19 },
  { id: 'orb-3', className: 'left-[18%] bottom-[14%] h-14 w-14 rounded-full bg-chart-4/25', x: [0, 12, -8, 0], y: [0, -16, 8, 0], rotate: [0, 6, -4, 0], duration: 14 },
  { id: 'glass-1', className: 'right-[22%] bottom-[18%] h-24 w-24 rounded-2xl border border-white/20 bg-white/5 backdrop-blur-sm', x: [0, -16, 10, 0], y: [0, 14, -10, 0], rotate: [0, 10, -8, 0], duration: 20 },
  { id: 'glass-2', className: 'left-[34%] top-[8%] h-10 w-10 rounded-lg border border-primary/25 bg-primary/10', x: [0, 10, -6, 0], y: [0, -12, 8, 0], rotate: [0, -12, 7, 0], duration: 12 },
  { id: 'ring-1', className: 'right-[35%] top-[36%] h-20 w-20 rounded-full border border-accent/30', x: [0, 14, -10, 0], y: [0, -10, 8, 0], rotate: [0, 12, -10, 0], duration: 22 },
];

function resolvePlanHref(plan: MarketingPlan) {
  return `/register?source=landing&intent=${plan.slug}`;
}

function normalizeMonthlyLabel(label: string) {
  return label
    .replace('Limit miekki', 'Limit miękki')
    .replace('miesiac', 'miesiąc');
}

function metricMonthlyValue(label: string) {
  const normalized = normalizeMonthlyLabel(label);
  return /^\d+$/.test(normalized) ? `${normalized} wideo/mies.` : normalized;
}

function extractFirstNumber(label: string, fallback: number) {
  const match = label.match(/\d+/);
  return match ? Number(match[0]) : fallback;
}

function PlatformIcons() {
  return (
    <div className="flex items-center gap-2" aria-label="YouTube, TikTok, Instagram, Facebook">
      <a href="https://www.youtube.com" target="_blank" rel="noopener noreferrer" aria-label="YouTube">
        <PlatformBrandIcon platform="YOUTUBE" className="h-4 w-4" />
      </a>
      <PlatformBrandIcon platform="TIKTOK" className="h-4 w-4" />
      <PlatformBrandIcon platform="INSTAGRAM" className="h-4 w-4" />
      <PlatformBrandIcon platform="FACEBOOK" className="h-4 w-4" />
    </div>
  );
}

function AiAutopilotLabel() {
  return (
    <div className="inline-flex items-center gap-1.5">
      <span>AI Autopilot</span>
      <HoverCard>
        <HoverCardTrigger asChild>
          <button
            type="button"
            aria-label="Jak działa AI Autopilot"
            className="inline-flex h-4 w-4 items-center justify-center text-muted-foreground hover:text-foreground"
          >
            <CircleHelp className="h-3.5 w-3.5" />
          </button>
        </HoverCardTrigger>
        <HoverCardContent align="start" className="w-72 text-xs leading-relaxed">
          Autopilot AI analizuje oczekujące zadania publikacji (status: oczekujące), proponuje lepsze okna czasowe i może automatycznie zastosować harmonogram.
        </HoverCardContent>
      </HoverCard>
    </div>
  );
}

type ComparisonRow = {
  label: string;
  starter: ReactNode;
  pro: ReactNode;
  business: ReactNode;
};

function getComparisonCellValue(row: ComparisonRow, slug: MarketingPlan['slug']): ReactNode {
  if (slug === 'starter') {
    return row.starter;
  }

  if (slug === 'pro') {
    return row.pro;
  }

  return row.business;
}



function FloatingBackground({ reduceMotion }: { reduceMotion: boolean }) {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      <div className="absolute left-[-10%] top-[-12%] h-[32rem] w-[32rem] rounded-full bg-primary/20 blur-3xl" />
      <div className="absolute right-[-8%] top-[24%] h-[30rem] w-[30rem] rounded-full bg-accent/20 blur-3xl" />
      <div className="absolute bottom-[-20%] left-[20%] h-[28rem] w-[28rem] rounded-full bg-chart-4/15 blur-3xl" />

      {floatingElements.map((element, index) => (
        (() => {
          const isInteractiveOrb = element.id === 'orb-1' || element.id === 'orb-2';

          return (
            <motion.div
              key={element.id}
              className={`absolute ${element.className} ${isInteractiveOrb ? 'pointer-events-auto' : 'pointer-events-none'}`}
              initial={{ opacity: 0.35 }}
              animate={
                reduceMotion
                  ? { opacity: 0.35 }
                  : {
                      opacity: [0.32, 0.7, 0.45, 0.32],
                      x: element.x,
                      y: element.y,
                      rotate: element.rotate,
                    }
              }
              transition={
                reduceMotion
                  ? { duration: 0 }
                  : {
                      duration: element.duration,
                      delay: index * 0.15,
                      repeat: Number.POSITIVE_INFINITY,
                      ease: 'easeInOut',
                    }
              }
              whileHover={isInteractiveOrb && !reduceMotion ? { scale: 1.2 } : undefined}
            />
          );
        })()
      ))}
    </div>
  );
}

function ScrollProgressWithLogo({ mounted }: { mounted: boolean }) {
  const { scrollYProgress } = useScroll();
  const progress = useSpring(scrollYProgress, { stiffness: 120, damping: 24, mass: 0.2 });
  const { theme, setTheme } = useTheme();

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-40 px-3 pt-3 sm:px-6">
      <div className="mx-auto flex w-full max-w-6xl items-start gap-3">
        <div className="inline-flex shrink-0 items-center rounded-2xl border border-border/70 bg-background/82 px-4 py-1 shadow-lg backdrop-blur-md">
          <BrandLogo className="h-10 w-auto" />
        </div>
        <div className="flex-1 flex items-center gap-2">
          <div className="mt-3 h-1.5 flex-1 overflow-hidden rounded-full bg-background/55 ring-1 ring-border/45 backdrop-blur-sm">
            <motion.div className="h-full origin-left rounded-full bg-gradient-to-r from-primary to-accent" style={{ scaleX: progress }} />
          </div>
          {mounted && (
            <div className="pointer-events-auto mt-3 flex items-center gap-1 rounded-lg border border-border/70 bg-background/82 p-1 backdrop-blur-md">
              <button
                type="button"
                onClick={() => {
                  setTheme('light');
                  trackLandingEvent({
                    event: 'landing_cta_click',
                    cta: 'theme_toggle_light',
                    source: 'landing',
                  });
                }}
                className={`rounded-md p-1.5 transition-colors ${
                  theme === 'light' ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground'
                }`}
                aria-label="Light mode"
                title="Jasny motyw"
              >
                <Sun className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setTheme('dark');
                  trackLandingEvent({
                    event: 'landing_cta_click',
                    cta: 'theme_toggle_dark',
                    source: 'landing',
                  });
                }}
                className={`rounded-md p-1.5 transition-colors ${
                  theme === 'dark' ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground'
                }`}
                aria-label="Dark mode"
                title="Ciemny motyw"
              >
                <Moon className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ActivityBubble({ messages, reduceMotion }: { messages: string[]; reduceMotion: boolean }) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (messages.length < 2) {
      return;
    }

    const interval = window.setInterval(() => {
      setIndex((prev) => (prev + 1) % messages.length);
    }, 15000);

    return () => window.clearInterval(interval);
  }, [messages]);

  if (messages.length === 0) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed bottom-4 left-4 z-30 hidden max-w-[17rem] lg:block">
      <div className="rounded-2xl border border-border/70 bg-background/75 p-3 shadow-xl backdrop-blur-md">
        <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Podgląd aktywności</p>
        <AnimatePresence mode="wait">
          <motion.p
            key={index}
            initial={reduceMotion ? { opacity: 1 } : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduceMotion ? { opacity: 1 } : { opacity: 0, y: -8 }}
            transition={{ duration: 0.28 }}
            className="mt-1 text-xs text-foreground"
          >
            {messages[index]}
          </motion.p>
        </AnimatePresence>
      </div>
    </div>
  );
}

function SideLoginTab({ reduceMotion, loginHref }: { reduceMotion: boolean; loginHref: string }) {
  return (
    <motion.div
      initial={reduceMotion ? { x: 0, opacity: 1 } : { x: 120, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ duration: 0.56, delay: 0.18, ease: [0.22, 1, 0.36, 1] }}
      className="fixed right-0 top-1/2 z-40 hidden -translate-y-1/2 md:block"
    >
      <motion.div
        animate={reduceMotion ? undefined : { x: [0, -8, 0] }}
        transition={{ duration: 2.2, repeat: Number.POSITIVE_INFINITY, ease: 'easeInOut' }}
      >
        <Link
          href={loginHref}
          onClick={() =>
            trackLandingEvent({
              event: 'landing_cta_click',
              cta: 'side_login_tab',
              href: loginHref,
              source: 'landing',
            })
          }
          className="group flex items-center gap-2 rounded-l-2xl border border-primary/40 bg-card/92 px-4 py-3 shadow-2xl backdrop-blur-md transition-all hover:-translate-x-1 hover:bg-card"
          aria-label="Zaloguj się do konta"
        >
          <span className="text-xs font-semibold tracking-[0.02em] text-foreground">Zaloguj się</span>
          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary/18 text-primary">
            <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </span>
        </Link>
      </motion.div>
    </motion.div>
  );
}

function MobileLoginChip({ visible, loginHref }: { visible: boolean; loginHref: string }) {
  return (
    <motion.div
      initial={false}
      animate={{ x: visible ? 0 : 90, opacity: visible ? 1 : 0 }}
      transition={{ duration: 0.24, ease: 'easeOut' }}
      className="fixed right-4 top-20 z-40 md:hidden"
    >
      <Link
        href={loginHref}
        onClick={() =>
          trackLandingEvent({
            event: 'landing_cta_click',
            cta: 'mobile_login_chip',
            href: loginHref,
            source: 'landing',
          })
        }
        className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-card/92 px-3 py-2 text-xs font-semibold text-foreground shadow-xl backdrop-blur-md"
        aria-label="Zaloguj się do konta"
      >
        Zaloguj
        <ArrowUpRight className="h-3.5 w-3.5 text-primary" />
      </Link>
    </motion.div>
  );
}

function MobileStickyCTA({ visible }: { visible: boolean }) {
  return (
    <motion.div
      initial={false}
      animate={{ y: visible ? 0 : 120, opacity: visible ? 1 : 0 }}
      transition={{ duration: 0.24, ease: 'easeOut' }}
      className="fixed inset-x-0 bottom-0 z-50 px-4 pb-4 pt-2 lg:hidden"
    >
      <Link
        href="/register?source=landing&intent=trial"
        onClick={() =>
          trackLandingEvent({
            event: 'landing_cta_click',
            cta: 'mobile_sticky_trial',
            href: '/register?source=landing&intent=trial',
            source: 'landing',
          })
        }
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-primary/40 bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-2xl"
      >
        Wypróbuj za darmo przez 7 dni
        <ArrowUpRight className="h-4 w-4" />
      </Link>
    </motion.div>
  );
}

// The static sections (features, use cases, FAQ) are Server Components passed in as slots
// (app/page.tsx) - their content never ships as client JS (2026-10-01, landing split). They animate
// through the small client islands in LandingMotion.tsx, fed by LandingMotionContext below.
export function LandingExperience({
  featuresSection,
  seoSection,
  faqSection,
}: {
  featuresSection?: ReactNode;
  seoSection?: ReactNode;
  faqSection?: ReactNode;
} = {}) {
  const { scrollY } = useScroll();
  const { isAuthenticated, isLoading } = useAuth();
  const capabilities = useBillingCapabilities();
  const shouldReduceMotion = useReducedMotion();
  const reduceMotion = shouldReduceMotion ?? false;
  const [mounted, setMounted] = useState(false);
  const [isLowPowerDevice, setIsLowPowerDevice] = useState(false);
  const [scrollDirection, setScrollDirection] = useState<ScrollDirection>('down');
  const [selectedPlanSlug, setSelectedPlanSlug] = useState<MarketingPlan['slug']>('pro');
  const [showMobileStickyCta, setShowMobileStickyCta] = useState(false);
  const [activeHeroStep, setActiveHeroStep] = useState(0);
  const [heroReady, setHeroReady] = useState(false);
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactCategory, setContactCategory] = useState<ContactCategory>('general');
  const [contactMessage, setContactMessage] = useState('');
  const [contactHpWebsite, setContactHpWebsite] = useState('');
  const [contactFormStartedAt] = useState(() => Date.now());
  const [isContactSubmitting, setIsContactSubmitting] = useState(false);
  const [contactStatus, setContactStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const pricingTableScrollRef = useRef<HTMLDivElement | null>(null);
  const pricingColumnRefs = useRef<Record<string, HTMLTableCellElement | null>>({});

  const plansBySlug = useMemo(
    () => new Map<string, MarketingPlan>(capabilities.plans.map((plan) => [plan.slug, plan])),
    [capabilities.plans],
  );

  const starterPlan = plansBySlug.get('starter');
  const proPlan = plansBySlug.get('pro');
  const businessPlan = plansBySlug.get('business');
  const selectedPlan = plansBySlug.get(selectedPlanSlug) ?? proPlan ?? capabilities.plans[0];
  const freeVideoUploadsLabel =
    capabilities.free.videoUploads === null ? 'Brak limitu' : `${capabilities.free.videoUploads}`;
  const freeScheduleAheadLabel =
    capabilities.free.maxScheduleAheadHours === null
      ? 'Bez limitu planowania'
      : `Planowanie do ${capabilities.free.maxScheduleAheadHours}h`;

  const starterMonthlyVideoLimit = extractFirstNumber(starterPlan?.monthlyVideoLabel ?? '', 15);
  const proMonthlySoftLimit = extractFirstNumber(proPlan?.monthlyVideoLabel ?? '', 100);
  const loginHref = !isLoading && isAuthenticated ? '/dashboard' : '/login?source=landing';

  const comparisonRows = useMemo<ComparisonRow[]>(
    () => [
      {
        label: 'Platformy',
        starter: <PlatformIcons />,
        pro: <PlatformIcons />,
        business: <PlatformIcons />,
      },
      {
        label: 'Konta social (łącznie)',
        starter: starterPlan?.maxSocialAccounts?.toString() ?? '-',
        pro: proPlan?.maxSocialAccounts?.toString() ?? '-',
        business: businessPlan?.maxSocialAccounts?.toString() ?? '-',
      },
      {
        label: 'Wideo / miesiąc',
        starter: `${starterMonthlyVideoLimit}`,
        pro: `${proMonthlySoftLimit}`,
        business: (businessPlan?.monthlyVideoLabel ?? '').toLowerCase().includes('brak') ? 'Brak limitu' : normalizeMonthlyLabel(businessPlan?.monthlyVideoLabel ?? '-'),
      },
      {
        label: 'AI_AUTOPILOT_LABEL',
        starter: starterPlan?.aiAutopilotLabel ?? (starterPlan?.aiAutopilot ? 'Tak' : 'Nie'),
        pro: proPlan?.aiAutopilotLabel ?? (proPlan?.aiAutopilot ? 'Tak' : 'Nie'),
        business: businessPlan?.aiAutopilotLabel ?? (businessPlan?.aiAutopilot ? 'Tak' : 'Nie'),
      },
    ],
    [businessPlan, proMonthlySoftLimit, proPlan, starterMonthlyVideoLimit, starterPlan],
  );

  const activityMessages = useMemo(
    () => [
      `Okres próbny: ${capabilities.trial.days} dni dla nowych kont i pierwszej subskrypcji.`,
      `Starter: do ${starterMonthlyVideoLimit} wideo miesięcznie.`,
      `Pro: limit miękki ${proMonthlySoftLimit} wideo / miesiąc.`,
      `AI Autopilot: Pro ${proPlan?.aiAutopilotLabel ?? '15 / mies.'}, Business bez limitu.`,
      'Konta social: Starter 3, Pro 10, Business 25 (łącznie).',
    ],
    [capabilities.trial.days, proMonthlySoftLimit, proPlan?.aiAutopilotLabel, starterMonthlyVideoLimit],
  );

  useEffect(() => {
    if (!plansBySlug.has(selectedPlanSlug)) {
      setSelectedPlanSlug(proPlan?.slug ?? capabilities.plans[0]?.slug ?? 'pro');
    }
  }, [capabilities.plans, plansBySlug, proPlan?.slug, selectedPlanSlug]);

  useEffect(() => {
    trackLandingEvent({ event: 'landing_view', source: 'landing' });

    const tracked = new Set<string>();
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) {
            return;
          }

          const target = entry.target as HTMLElement;
          const section = target.dataset.section;
          if (!section || tracked.has(section)) {
            return;
          }

          tracked.add(section);
          trackLandingEvent({
            event: 'landing_section_view',
            section,
            source: 'landing',
          });
        });
      },
      { threshold: 0.4 },
    );

    const sections = document.querySelectorAll<HTMLElement>('[data-section]');
    sections.forEach((node) => observer.observe(node));

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(max-width: 1024px), (pointer: coarse)');
    const update = () => setIsLowPowerDevice(mediaQuery.matches);

    update();
    mediaQuery.addEventListener('change', update);

    return () => mediaQuery.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    setShowMobileStickyCta(scrollY.get() > 420);

    const unsubscribe = scrollY.on('change', (latest) => {
      const previous = scrollY.getPrevious() ?? 0;

      if (latest > previous + 5) {
        setScrollDirection('down');
      } else if (latest < previous - 5) {
        setScrollDirection('up');
      }

      setShowMobileStickyCta(latest > 420);
    });

    return () => unsubscribe();
  }, [scrollY]);

  useEffect(() => {
    // Run hero entrance after hydration so hard refresh reliably replays motion.
    setHeroReady(true);
  }, []);

  const scrollToPricing = () => {
    const section = document.getElementById('pricing');
    if (!section) {
      return;
    }

    section.scrollIntoView({
      behavior: motionBudgetReduced ? 'auto' : 'smooth',
      block: 'start',
    });
  };

  const motionBudgetReduced = reduceMotion || isLowPowerDevice;
  const interactiveLift = motionBudgetReduced ? undefined : { y: -4, scale: 1.01 };
  const interactiveTap = motionBudgetReduced ? undefined : { scale: 0.98 };
  const heroEnterDuration = motionBudgetReduced ? 0.3 : 0.68;
  const heroStagger = motionBudgetReduced ? 0.05 : 0.11;

  useEffect(() => {
    const isMobileViewport = window.matchMedia('(max-width: 767px)').matches;
    if (!isMobileViewport) {
      return;
    }

    const container = pricingTableScrollRef.current;
    const column = pricingColumnRefs.current[selectedPlanSlug];

    if (!container || !column) {
      return;
    }

    const targetLeft = column.offsetLeft - (container.clientWidth - column.clientWidth) / 2;
    const boundedLeft = Math.max(0, Math.min(targetLeft, container.scrollWidth - container.clientWidth));

    container.scrollTo({
      left: boundedLeft,
      behavior: motionBudgetReduced ? 'auto' : 'smooth',
    });
  }, [motionBudgetReduced, selectedPlanSlug]);

  const heroContainerVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: heroStagger,
        delayChildren: motionBudgetReduced ? 0.04 : 0.12,
      },
    },
  };

  const heroItemVariants = {
    hidden: {
      opacity: 0,
      y: motionBudgetReduced ? 10 : 24,
      filter: motionBudgetReduced ? 'none' : 'blur(6px)',
    },
    show: {
      opacity: 1,
      y: 0,
      filter: 'blur(0px)',
      transition: { duration: heroEnterDuration, ease: [0.22, 1, 0.36, 1] as const },
    },
  };

  useEffect(() => {
    if (motionBudgetReduced) {
      return;
    }

    const interval = window.setInterval(() => {
      setActiveHeroStep((previous) => (previous + 1) % heroFlowSteps.length);
    }, 2600);

    return () => window.clearInterval(interval);
  }, [motionBudgetReduced]);

  const heroPointerX = useMotionValue(0);
  const heroPointerY = useMotionValue(0);
  const heroPointerXSpring = useSpring(heroPointerX, { stiffness: 120, damping: 20, mass: 0.3 });
  const heroPointerYSpring = useSpring(heroPointerY, { stiffness: 120, damping: 20, mass: 0.3 });
  const heroCardRotateX = useTransform(heroPointerYSpring, [-220, 220], [7, -7]);
  const heroCardRotateY = useTransform(heroPointerXSpring, [-220, 220], [-8, 8]);
  const heroSpotlightX = useTransform(heroPointerXSpring, [-220, 220], [-70, 70]);
  const heroSpotlightY = useTransform(heroPointerYSpring, [-220, 220], [-40, 40]);

  const handleHeroPointerMove = (event: React.MouseEvent<HTMLElement>) => {
    if (motionBudgetReduced) {
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const centeredX = event.clientX - rect.left - rect.width / 2;
    const centeredY = event.clientY - rect.top - rect.height / 2;
    heroPointerX.set(centeredX);
    heroPointerY.set(centeredY);
  };

  const handleHeroPointerLeave = () => {
    heroPointerX.set(0);
    heroPointerY.set(0);
  };

  const handleContactSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setContactStatus(null);

    try {
      setIsContactSubmitting(true);

      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: contactName,
          email: contactEmail,
          category: contactCategory,
          message: contactMessage,
          hpWebsite: contactHpWebsite,
          formStartedAt: contactFormStartedAt,
        }),
      });

      if (!response.ok) {
        setContactStatus({
          type: 'error',
          message: 'Nie udalo sie wyslac wiadomosci. Sprobuj ponownie za chwile.',
        });
        return;
      }

      setContactName('');
      setContactEmail('');
      setContactCategory('general');
      setContactMessage('');
      setContactHpWebsite('');
      setContactStatus({
        type: 'success',
        message: 'Dzieki! Wiadomosc zostala wyslana. Odpowiemy najszybciej jak mozliwe.',
      });

      trackLandingEvent({
        event: 'landing_cta_click',
        cta: 'contact_submit',
        source: 'landing',
      });
    } catch {
      setContactStatus({
        type: 'error',
        message: 'Wystapil blad sieci. Sprobuj ponownie za chwile.',
      });
    } finally {
      setIsContactSubmitting(false);
    }
  };

  return (
    <LandingMotionContext.Provider value={{ scrollDirection, motionBudgetReduced }}>
      <main className="relative min-h-full bg-background text-foreground">
      <ScrollProgressWithLogo mounted={mounted} />
      <FloatingBackground reduceMotion={motionBudgetReduced} />
      <ActivityBubble messages={activityMessages} reduceMotion={motionBudgetReduced} />
      <SideLoginTab reduceMotion={motionBudgetReduced} loginHref={loginHref} />
      <MobileLoginChip visible={!showMobileStickyCta} loginHref={loginHref} />

      <section
        data-section="hero"
        onMouseMove={handleHeroPointerMove}
        onMouseLeave={handleHeroPointerLeave}
        className="relative mx-auto grid min-h-[100svh] w-full max-w-6xl items-center gap-10 px-6 pb-16 pt-24 lg:grid-cols-[1.1fr_0.9fr] lg:pb-20 lg:pt-28"
      >
        <motion.div
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 top-1/2 h-72 w-72 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/20 blur-3xl"
          style={motionBudgetReduced ? undefined : { x: heroSpotlightX, y: heroSpotlightY }}
          animate={motionBudgetReduced ? undefined : { opacity: [0.25, 0.55, 0.25], scale: [1, 1.1, 1] }}
          transition={{ duration: 5, repeat: Number.POSITIVE_INFINITY, ease: 'easeInOut' }}
        />

        <motion.div variants={heroContainerVariants} initial="hidden" animate={heroReady ? 'show' : 'hidden'} className="space-y-7">
          <motion.p
            variants={heroItemVariants}
            className="inline-flex w-fit rounded-full border border-border/70 bg-card/50 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-foreground/85"
          >
            Dla tworcow i zespolow marketingu
          </motion.p>

          <motion.h1 variants={heroItemVariants} className="font-semibold leading-[0.93] text-4xl sm:text-6xl lg:text-7xl">
            Publikuj
            <span className="block sm:hidden">regularnie</span>
            <motion.span
              className="block bg-gradient-to-r from-primary via-chart-4 to-accent bg-clip-text text-transparent"
              animate={motionBudgetReduced ? undefined : { backgroundPosition: ['0% 50%', '100% 50%', '0% 50%'] }}
              transition={{ duration: motionBudgetReduced ? 0 : 7.2, repeat: Number.POSITIVE_INFINITY, ease: 'easeInOut' }}
              style={{ backgroundSize: '220% 220%' }}
            >
              <span className="hidden sm:inline">regularnie i prosto</span>
              <span className="sm:hidden">i prosto</span>
            </motion.span>
          </motion.h1>

          <motion.p variants={heroItemVariants} className="max-w-2xl text-base text-muted-foreground sm:text-lg">
            Planuj i publikuj treści na YouTube, TikTok, Instagram i Facebook z jednego panelu.
            <span className="block text-foreground/85">Mniej chaosu, wiecej regularnych publikacji.</span>
          </motion.p>

          <motion.div variants={heroContainerVariants} className="flex flex-wrap items-center gap-x-4 gap-y-2">
            {heroProofStrip.map((proof, index) => (
              <motion.div key={proof.label} variants={heroItemVariants} className="inline-flex items-baseline gap-1.5">
                <p className="text-sm font-semibold text-foreground">{proof.value}</p>
                <p className="text-xs text-muted-foreground">{proof.label}</p>
                {index < heroProofStrip.length - 1 ? <span aria-hidden="true" className="ml-2 text-muted-foreground/50">|</span> : null}
              </motion.div>
            ))}
          </motion.div>

          <motion.div variants={heroContainerVariants} className="flex flex-wrap gap-2">
            {heroHighlights.map((highlight) => (
              <motion.span
                key={highlight}
                variants={heroItemVariants}
                whileHover={interactiveLift}
                whileTap={interactiveTap}
                className="rounded-full border border-border/80 bg-card/60 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.08em] text-foreground/90"
              >
                {highlight}
              </motion.span>
            ))}
          </motion.div>

          <motion.div variants={heroItemVariants} className="flex flex-wrap gap-3">
            <motion.div whileHover={interactiveLift} whileTap={interactiveTap}>
              <Link
                href="/register?source=landing&intent=trial"
                onClick={() =>
                  trackLandingEvent({
                    event: 'landing_cta_click',
                    cta: 'hero_start_trial',
                    href: '/register?source=landing&intent=trial',
                    source: 'landing',
                  })
                }
                className="group relative inline-flex items-center gap-2 overflow-hidden rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition-transform hover:-translate-y-0.5"
              >
                {!motionBudgetReduced ? (
                  <motion.span
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 rounded-xl border border-white/25"
                    animate={{ opacity: [0.25, 0.7, 0.25], scale: [1, 1.035, 1] }}
                    transition={{ duration: 2.3, repeat: Number.POSITIVE_INFINITY, ease: 'easeInOut' }}
                  />
                ) : null}
                <motion.span
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-y-0 left-[-40%] w-1/3 -skew-x-12 bg-white/30 blur-sm"
                  animate={motionBudgetReduced ? undefined : { x: ['-180%', '420%'] }}
                  transition={{ duration: motionBudgetReduced ? 0 : 2, repeat: Number.POSITIVE_INFINITY, repeatDelay: 1.2, ease: 'easeInOut' }}
                />
                <span className="relative">Wypróbuj za darmo przez 7 dni</span>
                <ArrowUpRight className="h-4 w-4" />
              </Link>
            </motion.div>
            <motion.div whileHover={interactiveLift} whileTap={interactiveTap}>
              <Link
                href="#pricing"
                onClick={(event) => {
                  event.preventDefault();
                  scrollToPricing();
                  trackLandingEvent({
                    event: 'landing_cta_click',
                    cta: 'hero_compare_plans',
                    href: '#pricing',
                    source: 'landing',
                  });
                }}
                className="inline-flex items-center rounded-xl border border-border bg-card/40 px-5 py-3 text-sm font-semibold text-foreground hover:bg-card/70"
              >
                Sprawdź plany
              </Link>
            </motion.div>
          </motion.div>
          <motion.p variants={heroItemVariants} className="text-xs text-muted-foreground">
            Okres próbny: {capabilities.trial.days} dni ({capabilities.trial.eligibilityNote})
          </motion.p>

          <motion.p variants={heroItemVariants} className="inline-flex items-center gap-2 text-xs text-muted-foreground">
            <CircleCheckBig className="h-3.5 w-3.5 text-emerald-400" />
            Widzisz limity i cenę przed zakupem. Bez gwiazdek.
          </motion.p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={heroReady ? { opacity: 1, x: 0 } : { opacity: 0, x: 20 }}
          transition={{ duration: motionBudgetReduced ? 0.42 : 0.9, delay: motionBudgetReduced ? 0.08 : 0.24, ease: 'easeOut' }}
          style={motionBudgetReduced ? undefined : { rotateX: heroCardRotateX, rotateY: heroCardRotateY }}
          className="relative [transform-style:preserve-3d]"
        >
          <div className="absolute -inset-2 rounded-[2rem] bg-gradient-to-br from-primary/40 via-transparent to-accent/35 blur-xl" />
          <motion.div
            aria-hidden="true"
            className="absolute -right-3 -top-3 z-20 rounded-full border border-emerald-400/35 bg-emerald-400/20 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-emerald-100"
            animate={motionBudgetReduced ? undefined : { y: [0, -6, 0], opacity: [0.8, 1, 0.8] }}
            transition={{ duration: 2.6, repeat: Number.POSITIVE_INFINITY, ease: 'easeInOut' }}
          >
                Podgląd
          </motion.div>
          <div className="relative overflow-hidden rounded-[2rem] border border-border bg-card/80 p-6 shadow-2xl">
            <div className="mb-5 flex items-center justify-between">
              <p className="text-sm font-medium text-foreground">Przykładowe KPI po zalogowaniu</p>
            </div>
            <div className="mb-4 rounded-xl border border-border/70 bg-card/55 p-3">
              <div className="mb-2 flex items-center gap-2">
                {heroFlowSteps.map((step, index) => (
                  <motion.span
                    key={step}
                    className={`h-1.5 flex-1 rounded-full ${index === activeHeroStep ? 'bg-primary' : 'bg-secondary'}`}
                    animate={
                      motionBudgetReduced
                        ? undefined
                        : { opacity: index === activeHeroStep ? [0.55, 1, 0.55] : 1 }
                    }
                    transition={{ duration: 0.9, repeat: Number.POSITIVE_INFINITY, ease: 'easeInOut' }}
                  />
                ))}
              </div>
              <AnimatePresence mode="wait">
                <motion.p
                  key={activeHeroStep}
                  initial={motionBudgetReduced ? { opacity: 1 } : { opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={motionBudgetReduced ? { opacity: 1 } : { opacity: 0, y: -8 }}
                  transition={{ duration: 0.25 }}
                  className="text-xs text-foreground/90"
                >
                  {heroFlowSteps[activeHeroStep]}
                </motion.p>
              </AnimatePresence>
            </div>
            <p className="mb-1 text-xs text-muted-foreground">To jest przykład widoku danych po podłączeniu kont.</p>
            <p className="mb-4 text-[11px] text-muted-foreground/80">Rzeczywiste KPI liczymy z publikacji, statusów zadań i podłączonych kanałów.</p>

            <div className="space-y-4">
              {[
                { label: 'Skuteczność publikacji', display: '91%', progress: 91 },
                { label: 'Podłączone kanały', display: '3/4', progress: 75 },
                { label: 'Wideo w ostatnich 30 dniach', display: '42', progress: 84 },
              ].map((kpi, idx) => (
                <motion.div
                  key={kpi.label}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.35 + idx * 0.14 }}
                  className="rounded-xl border border-border bg-card/50 p-4"
                >
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{kpi.label}</span>
                    <span>{kpi.display}</span>
                  </div>
                  <div className="mt-2 h-2 rounded-full bg-secondary">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${kpi.progress}%` }}
                      transition={{ duration: 0.9, delay: 0.45 + idx * 0.12 }}
                      className="h-full rounded-full bg-gradient-to-r from-primary to-accent"
                    />
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </motion.div>
      </section>


      {featuresSection}

      {seoSection}

      <section id="pricing" data-section="pricing" className="relative mx-auto w-full max-w-6xl px-6 pb-24">
        <SectionReveal
          variants={sectionFromLeft}
          className="relative rounded-3xl border border-white/10 bg-gradient-to-br from-card/80 via-card/55 to-accent/15 p-6 shadow-[0_20px_60px_rgba(2,6,23,0.35)] backdrop-blur-xl sm:p-10"
        >
          {!motionBudgetReduced ? (
            <motion.div
              aria-hidden="true"
              className="pointer-events-none absolute -inset-px rounded-3xl border border-primary/20"
              animate={{ opacity: [0.35, 0.8, 0.35] }}
              transition={{ duration: 2.6, repeat: Number.POSITIVE_INFINITY, ease: 'easeInOut' }}
            />
          ) : null}
          <motion.div variants={item} className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-accent">Cennik</p>
              <h2 className="mt-2 text-3xl font-semibold">Wybierz plan</h2>
              <p className="mt-2 text-xs text-muted-foreground">Oszczędzasz ok. 20% przy rozliczeniu rocznym.</p>
            </div>
          </motion.div>

          <motion.div variants={item} className="mt-5 rounded-2xl border border-primary/25 bg-primary/10 p-4 sm:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-primary">Plan Free (na start)</p>
                <p className="mt-1 text-sm text-foreground">{capabilities.free.subtitle}</p>
                <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                  <span className="rounded-full border border-border/70 bg-card/50 px-2.5 py-1">0 PLN / mies.</span>
                  <span className="rounded-full border border-border/70 bg-card/50 px-2.5 py-1">{`${capabilities.free.socialAccounts} konto social łącznie`}</span>
                  <span className="rounded-full border border-border/70 bg-card/50 px-2.5 py-1">{`${freeVideoUploadsLabel} wideo / mies.`}</span>
                  <span className="rounded-full border border-border/70 bg-card/50 px-2.5 py-1">{freeScheduleAheadLabel}</span>
                </div>
              </div>
              <Link
                href="/register?source=landing&intent=free"
                onClick={() =>
                  trackLandingEvent({
                    event: 'landing_cta_click',
                    cta: 'pricing_start_free',
                    href: '/register?source=landing&intent=free',
                    source: 'landing',
                  })
                }
                className="inline-flex items-center justify-center rounded-lg border border-primary/45 bg-card/70 px-4 py-2 text-sm font-semibold text-foreground hover:bg-card"
              >
                Zacznij od Free
              </Link>
            </div>
          </motion.div>

          <motion.div variants={item} className="mt-6 rounded-2xl border border-border bg-card/50 md:hidden">
            <table className="w-full text-sm" aria-label="Porównanie wybranego planu Postfly">
              <caption className="sr-only">Porównanie wybranego planu</caption>
              <thead>
                <tr className="border-b border-border bg-card/70">
                  <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-muted-foreground">Porównanie</th>
                  <th scope="col" className="px-3 py-3 text-left text-xs font-semibold text-foreground">
                    {selectedPlan?.name ?? 'Plan'}
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-border/80">
                  <th scope="row" className="px-3 py-3 text-left text-xs font-medium text-muted-foreground">Cena / miesiąc</th>
                  <td className="px-3 py-3 font-semibold text-foreground">{selectedPlan?.priceMonthly ?? '-'}</td>
                </tr>
                {comparisonRows.map((row) => (
                  <tr key={`mobile-${row.label}`} className="border-b border-border/80 last:border-b-0">
                    <th scope="row" className="px-3 py-3 text-left text-xs font-medium text-muted-foreground">
                      {row.label === 'AI_AUTOPILOT_LABEL' ? 'AI Autopilot' : row.label}
                    </th>
                    <td className="px-3 py-3 text-foreground">
                      {selectedPlan ? getComparisonCellValue(row, selectedPlan.slug) : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </motion.div>

          <motion.div ref={pricingTableScrollRef} variants={item} className="mt-8 hidden overflow-x-auto rounded-2xl border border-border bg-card/50 md:block">
            <table className="min-w-[760px] w-full text-sm" aria-label="Porównanie planów Postfly">
              <caption className="sr-only">Porównanie planów Starter, Pro i Business</caption>
              <thead>
                <tr className="border-b border-border bg-card/70">
                  <th
                    scope="col"
                    className="sticky left-0 z-20 w-36 min-w-36 border-r border-border/70 bg-card px-3 py-3 text-left text-xs font-medium leading-tight text-muted-foreground md:static md:w-auto md:min-w-0 md:border-r-0 md:bg-transparent md:px-4 md:text-sm md:leading-normal"
                  >
                    Porównanie
                  </th>
                  {capabilities.plans.map((plan) => (
                    <th
                      key={plan.slug}
                      ref={(node) => {
                        pricingColumnRefs.current[plan.slug] = node;
                      }}
                      scope="col"
                      className={`min-w-[8.75rem] px-4 py-3 text-left font-semibold transition-colors duration-300 ${
                        plan.slug === selectedPlanSlug
                          ? 'bg-primary/15 text-foreground'
                          : 'text-foreground'
                      }`}
                    >
                      {plan.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-border/80">
                  <th
                    scope="row"
                    className="sticky left-0 z-10 w-36 min-w-36 border-r border-border/70 bg-card px-3 py-3 text-left text-xs font-medium leading-tight text-muted-foreground md:static md:w-auto md:min-w-0 md:border-r-0 md:bg-transparent md:px-4 md:text-sm md:leading-normal"
                  >
                    Cena / miesiąc
                  </th>
                  {capabilities.plans.map((plan) => (
                    <td
                      key={`${plan.slug}-price`}
                      className={`min-w-[8.75rem] px-4 py-3 transition-colors duration-300 ${
                        plan.slug === selectedPlanSlug
                          ? 'bg-primary/10 font-semibold text-foreground'
                          : 'text-foreground'
                      }`}
                    >
                      <span className="mb-1 block text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground md:hidden">
                        Cena / miesiąc
                      </span>
                      {plan.priceMonthly}
                    </td>
                  ))}
                </tr>
                {comparisonRows.map((row) => (
                  <tr key={row.label} className="border-b border-border/80 last:border-b-0">
                    <th
                      scope="row"
                      className="sticky left-0 z-10 w-36 min-w-36 border-r border-border/70 bg-card px-3 py-3 text-left text-xs font-medium leading-tight text-muted-foreground md:static md:w-auto md:min-w-0 md:border-r-0 md:bg-transparent md:px-4 md:text-sm md:leading-normal"
                    >
                      {row.label === 'AI_AUTOPILOT_LABEL' ? <AiAutopilotLabel /> : row.label}
                    </th>
                    {capabilities.plans.map((plan) => (
                      <td
                        key={`${row.label}-${plan.slug}`}
                        className={`min-w-[8.75rem] px-4 py-3 transition-colors duration-300 ${
                          plan.slug === selectedPlanSlug
                            ? 'bg-primary/10 font-semibold text-foreground'
                            : 'text-foreground'
                        }`}
                      >
                        <span className="mb-1 block text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground md:hidden">
                          {row.label === 'AI_AUTOPILOT_LABEL' ? 'AI Autopilot' : row.label}
                        </span>
                        {getComparisonCellValue(row, plan.slug)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </motion.div>

          <motion.div
            variants={container}
            className="mt-5 grid gap-3 sm:grid-cols-3"
          >
            {capabilities.plans.map((plan) => (
              <motion.div
                key={plan.name}
                variants={item}
                whileHover={interactiveLift}
                whileTap={interactiveTap}
              >
                <motion.button
                  type="button"
                  onClick={() =>
                    {
                      setSelectedPlanSlug(plan.slug);
                      trackLandingEvent({
                        event: 'landing_plan_click',
                        plan: plan.slug,
                        href: resolvePlanHref(plan),
                        source: 'landing',
                      });
                    }
                  }
                  aria-pressed={plan.slug === selectedPlanSlug}
                  className={`relative inline-flex w-full items-center justify-center rounded-xl border px-4 py-3 text-sm font-semibold transition-colors duration-300 ${
                    plan.slug === selectedPlanSlug
                      ? 'border-primary/55 text-primary-foreground shadow-[0_0_0_1px_rgba(245,158,11,0.35)]'
                      : plan.featured
                        ? 'border-primary/40 bg-card/25 text-foreground hover:bg-card/45'
                        : 'border-border/70 bg-transparent text-foreground hover:bg-card/40'
                  }`}
                >
                  {plan.slug === selectedPlanSlug ? (
                    <motion.span
                      key={`plan-bg-${plan.slug}-${selectedPlanSlug}`}
                      aria-hidden="true"
                      className="absolute inset-0 rounded-xl bg-primary"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: motionBudgetReduced ? 0 : 0.28, ease: 'easeOut' }}
                    />
                  ) : null}
                  {plan.slug === selectedPlanSlug ? (
                    <span className="absolute -top-2 z-10 rounded-full border border-primary/40 bg-background px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-primary">
                      {plan.featured ? 'Najczęściej wybierany' : 'Wybrany'}
                    </span>
                  ) : null}
                  <span className="relative z-10">{`Odbierz dostęp: ${plan.name}`}</span>
                  <span className="relative z-10 mx-2 text-foreground/45" aria-hidden="true">|</span>
                  <span className="relative z-10 text-xs font-medium opacity-85">{`${plan.priceMonthly} / mies.`}</span>
                </motion.button>
              </motion.div>
            ))}
          </motion.div>

          {selectedPlan ? (
            <motion.div variants={item} className="mt-4 rounded-xl border border-primary/25 bg-primary/10 p-3 sm:p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-foreground">
                  Wybrany plan:
                  {' '}
                  <span className="font-semibold text-primary">{selectedPlan.name}</span>
                  {' '}
                  <span className="text-muted-foreground">{`${selectedPlan.priceMonthly} / mies.`}</span>
                </p>
                <Link
                  href={resolvePlanHref(selectedPlan)}
                  onClick={() =>
                    trackLandingEvent({
                      event: 'landing_cta_click',
                      cta: 'pricing_continue_with_selected_plan',
                      href: resolvePlanHref(selectedPlan),
                      source: 'landing',
                    })
                  }
                  className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-95"
                >
                  Kontynuuj z planem
                  <ArrowUpRight className="ml-1.5 h-4 w-4" />
                </Link>
              </div>
            </motion.div>
          ) : null}
        </SectionReveal>
      </section>


      {faqSection}

      <section id="contact" data-section="contact" className="relative mx-auto w-full max-w-6xl px-6 pb-24">
        <SectionReveal
          variants={sectionFromLeft}
          className="rounded-3xl border border-border bg-card/65 p-6 sm:p-10"
        >
          <motion.p variants={item} className="text-xs uppercase tracking-[0.18em] text-accent">Kontakt</motion.p>
          <motion.h2 variants={item} className="mt-2 text-3xl font-semibold">Napisz do nas</motion.h2>
          <motion.p variants={item} className="mt-2 max-w-3xl text-sm text-muted-foreground">
            Masz pytanie, znalazles blad albo chcesz podzielic sie sugestia? Napisz wiadomosc - odpiszemy.
          </motion.p>

          <motion.form
            variants={container}
            onSubmit={handleContactSubmit}
            className="mt-7 grid gap-4"
          >
            <label className="absolute -left-[9999px] top-auto h-px w-px overflow-hidden" aria-hidden="true" htmlFor="contact-company-website">
              Company website
            </label>
            <input
              id="contact-company-website"
              name="companyWebsite"
              value={contactHpWebsite}
              onChange={(event) => setContactHpWebsite(event.target.value)}
              type="text"
              autoComplete="off"
              tabIndex={-1}
              className="absolute -left-[9999px] top-auto h-px w-px overflow-hidden"
              aria-hidden="true"
            />

            <motion.div variants={item} className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label htmlFor="contact-name" className="text-sm text-foreground">Imie i nazwisko</label>
                <input
                  id="contact-name"
                  value={contactName}
                  onChange={(event) => setContactName(event.target.value)}
                  type="text"
                  required
                  minLength={2}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-foreground"
                  placeholder="Jan Kowalski"
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="contact-email" className="text-sm text-foreground">Email</label>
                <input
                  id="contact-email"
                  value={contactEmail}
                  onChange={(event) => setContactEmail(event.target.value)}
                  type="email"
                  required
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-foreground"
                  placeholder="jan@postfly.app"
                />
              </div>
            </motion.div>

            <motion.div variants={item} className="space-y-2">
              <label htmlFor="contact-category" className="text-sm text-foreground">Kategoria wiadomosci</label>
              <select
                id="contact-category"
                value={contactCategory}
                onChange={(event) => setContactCategory(event.target.value as ContactCategory)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-foreground"
              >
                {CONTACT_CATEGORIES.map((category) => (
                  <option key={category.value} value={category.value}>{category.label}</option>
                ))}
              </select>
            </motion.div>

            <motion.div variants={item} className="space-y-2">
              <label htmlFor="contact-message" className="text-sm text-foreground">Wiadomosc</label>
              <textarea
                id="contact-message"
                value={contactMessage}
                onChange={(event) => setContactMessage(event.target.value)}
                required
                minLength={10}
                maxLength={4000}
                rows={6}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-foreground"
                placeholder="Napisz, w czym mozemy pomoc..."
              />
            </motion.div>

            <motion.div variants={item} className="flex flex-wrap items-center gap-3">
              <button
                type="submit"
                disabled={isContactSubmitting}
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-95 disabled:opacity-60"
              >
                {isContactSubmitting ? 'Wysyłanie...' : 'Wyślij wiadomość'}
                <ArrowUpRight className="h-4 w-4" />
              </button>
              <p className="text-xs text-muted-foreground">Odpowiadamy zwykle w ciągu 1 dnia roboczego.</p>
            </motion.div>

            {contactStatus ? (
              <motion.p
                variants={item}
                className={`text-sm ${contactStatus.type === 'success' ? 'text-emerald-400' : 'text-rose-400'}`}
              >
                {contactStatus.message}
              </motion.p>
            ) : null}
          </motion.form>
        </SectionReveal>
      </section>

      <section data-section="final-cta" className="mx-auto w-full max-w-6xl px-6 pb-24">
        <SectionReveal
          variants={sectionFromRight}
          className="relative overflow-hidden rounded-3xl border border-border bg-card/70 p-8 text-center sm:p-12"
        >
          <motion.div
            className="pointer-events-none absolute inset-0 opacity-40"
            animate={
              motionBudgetReduced
                ? undefined
                : {
                    backgroundPosition: ['0% 0%', '100% 100%', '0% 0%'],
                  }
            }
            transition={{ duration: 16, repeat: Number.POSITIVE_INFINITY, ease: 'easeInOut' }}
            style={{
              backgroundImage:
                'radial-gradient(circle at 10% 20%, var(--primary) 0%, transparent 40%), radial-gradient(circle at 90% 80%, var(--accent) 0%, transparent 35%)',
              backgroundSize: '180% 180%',
            }}
          />
          <motion.div variants={container} className="relative">
            <motion.p variants={item} className="inline-flex items-center gap-2 rounded-full border border-border bg-card/60 px-3 py-1 text-xs uppercase tracking-[0.16em] text-foreground">
              <Sparkles className="h-3.5 w-3.5" />
              Zacznij teraz
            </motion.p>
            <motion.h3 variants={item} className="mx-auto mt-4 max-w-2xl text-3xl font-semibold sm:text-4xl">
              Mniej chaosu, więcej regularnych publikacji.
            </motion.h3>
            <motion.div variants={item} className="mt-7 flex flex-wrap items-center justify-center gap-3">
              <motion.div whileHover={interactiveLift} whileTap={interactiveTap}>
                <Link
                  href="/register?source=landing&intent=trial"
                  onClick={() =>
                    trackLandingEvent({
                      event: 'landing_cta_click',
                      cta: 'final_start_trial',
                      href: '/register?source=landing&intent=trial',
                      source: 'landing',
                    })
                  }
                  className="rounded-xl bg-accent px-5 py-3 text-sm font-semibold text-accent-foreground hover:brightness-95"
                >
                  Wypróbuj za darmo przez 7 dni
                </Link>
              </motion.div>
              <motion.div whileHover={interactiveLift} whileTap={interactiveTap}>
                <Link
                  href={loginHref}
                  onClick={() =>
                    trackLandingEvent({
                      event: 'landing_cta_click',
                      cta: 'final_login',
                      href: loginHref,
                      source: 'landing',
                    })
                  }
                  className="rounded-xl border border-border bg-card/60 px-5 py-3 text-sm font-semibold text-foreground hover:bg-card/80"
                >
                  Mam konto
                </Link>
              </motion.div>
            </motion.div>
          </motion.div>
        </SectionReveal>
      </section>
        <MobileStickyCTA visible={showMobileStickyCta} />
      </main>
    </LandingMotionContext.Provider>
  );
}

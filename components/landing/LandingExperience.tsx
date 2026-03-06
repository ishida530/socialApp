"use client";

import Link from 'next/link';
import { AnimatePresence, animate, motion, useMotionValue, useReducedMotion, useScroll, useSpring, useTransform } from 'framer-motion';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ArrowUpRight, CalendarClock, Layers, Sparkles, Youtube, Music2, Instagram, Facebook, CircleCheckBig, CircleHelp } from 'lucide-react';
import { trackLandingEvent } from '@/lib/landing-events';
import { BrandLogo } from '@/components/BrandLogo';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import {
  type MarketingPlan,
} from '@/lib/billing/capabilities';
import { useBillingCapabilities } from '@/hooks/useBillingCapabilities';

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.08,
    },
  },
};

const item = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6 } },
};

const lanes = [
  {
    icon: CalendarClock,
    title: 'Prosty harmonogram',
    description:
      'Planujesz tydzień publikacji w kilku kliknięciach.',
  },
  {
    icon: Layers,
    title: 'Pełna orkiestracja 4 kanałów',
    description:
      'YouTube, TikTok, Instagram, Facebook. 1 konto na platformę, stabilne sloty API.',
  },
  {
    icon: Sparkles,
    title: 'Wnioski AI',
    description:
      'Szybkie podpowiedzi co publikować i kiedy.',
  },
];

const floatingElements = [
  { id: 'orb-1', className: 'left-[6%] top-[14%] h-20 w-20 rounded-full bg-primary/20', x: [0, 64, 118, 82, 0], y: [0, 18, 56, 28, 0], rotate: [0, 10, 16, 8, 0], duration: 20 },
  { id: 'orb-2', className: 'right-[9%] top-[20%] h-16 w-16 rounded-full bg-accent/25', x: [0, -22, -46, -18, 0], y: [0, 34, 84, 46, 0], rotate: [0, -9, -14, -7, 0], duration: 19 },
  { id: 'orb-3', className: 'left-[18%] bottom-[14%] h-14 w-14 rounded-full bg-chart-4/25', x: [0, 12, -8, 0], y: [0, -16, 8, 0], rotate: [0, 6, -4, 0], duration: 14 },
  { id: 'glass-1', className: 'right-[22%] bottom-[18%] h-24 w-24 rounded-2xl border border-white/20 bg-white/5 backdrop-blur-sm', x: [0, -16, 10, 0], y: [0, 14, -10, 0], rotate: [0, 10, -8, 0], duration: 20 },
  { id: 'glass-2', className: 'left-[34%] top-[8%] h-10 w-10 rounded-lg border border-primary/25 bg-primary/10', x: [0, 10, -6, 0], y: [0, -12, 8, 0], rotate: [0, -12, 7, 0], duration: 12 },
  { id: 'ring-1', className: 'right-[35%] top-[36%] h-20 w-20 rounded-full border border-accent/30', x: [0, 14, -10, 0], y: [0, -10, 8, 0], rotate: [0, 12, -10, 0], duration: 22 },
];

const faqItems = [
  {
    question: 'Czy okres próbny trwa 7 dni dla każdego zakupu?',
    answer:
      'Nie. Okres próbny 7 dni dotyczy nowych kont i pierwszej subskrypcji, zgodnie z aktualnymi zasadami rozliczeń.',
  },
  {
    question: 'Na jakich platformach mogę planować publikacje?',
    answer:
      'W jednym panelu zaplanujesz i opublikujesz treści na YouTube, TikTok, Instagram i Facebook.',
  },
  {
    question: 'Ile kont social mogę podłączyć?',
    answer:
      'Limity kont zależą od planu. W obecnej konfiguracji połączeń aktywnie obsługiwane jest po 1 koncie na platformę (maksymalnie 4 aktywne konta: YT, TikTok, Instagram, Facebook).',
  },
  {
    question: 'Czy plan Pro ma twardy limit publikacji?',
    answer:
      'Plan Pro nie ma twardego limitu publikacji, ale ma limit miękki 100 wideo miesięcznie.',
  },
  {
    question: 'W którym planie dostępny jest AI Autopilot?',
    answer:
      'AI Autopilot Lite jest dostępny od planu Pro (z limitem miesięcznym). W planie Business funkcja jest bez limitu i oferuje pełny tryb.',
  },
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
      <Youtube className="h-4 w-4 text-red-500" aria-hidden="true" />
      <Music2 className="h-4 w-4 text-slate-400" aria-hidden="true" />
      <Instagram className="h-4 w-4 text-pink-500" aria-hidden="true" />
      <Facebook className="h-4 w-4 text-blue-500" aria-hidden="true" />
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

function AnimatedMetricValue({ target, suffix }: { target: number; suffix: string }) {
  const shouldReduceMotion = useReducedMotion();
  const count = useMotionValue(0);
  const rounded = useTransform(count, (latest) => Math.round(latest));
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    if (shouldReduceMotion) {
      setDisplay(target);
      return;
    }

    const controls = animate(count, target, { duration: 1, ease: 'easeOut' });
    const unsubscribe = rounded.on('change', (value) => setDisplay(value));

    return () => {
      controls.stop();
      unsubscribe();
    };
  }, [count, rounded, shouldReduceMotion, target]);

  return (
    <>
      {display}
      {suffix}
    </>
  );
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

function ScrollProgressWithLogo() {
  const { scrollYProgress } = useScroll();
  const progress = useSpring(scrollYProgress, { stiffness: 120, damping: 24, mass: 0.2 });

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-40 px-3 pt-2 sm:px-6">
      <div className="mx-auto flex w-full max-w-6xl items-center gap-3 rounded-full border border-border/60 bg-background/70 px-3 py-2 backdrop-blur-md">
        <BrandLogo className="h-5 w-auto" />
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted/70">
          <motion.div className="h-full origin-left rounded-full bg-gradient-to-r from-primary to-accent" style={{ scaleX: progress }} />
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
    <div className="pointer-events-none fixed bottom-4 left-4 z-30 hidden max-w-[17rem] md:block">
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

function SideLoginTab({ reduceMotion }: { reduceMotion: boolean }) {
  return (
    <motion.div
      initial={reduceMotion ? { x: 0, opacity: 1 } : { x: 88, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ duration: 0.5, delay: 0.25, ease: 'easeOut' }}
      className="fixed right-0 top-1/2 z-40 hidden -translate-y-1/2 md:block"
    >
      <motion.div
        animate={reduceMotion ? undefined : { x: [0, -6, 0] }}
        transition={{ duration: 2.4, repeat: Number.POSITIVE_INFINITY, ease: 'easeInOut' }}
      >
        <Link
          href="/login?source=landing"
          onClick={() =>
            trackLandingEvent({
              event: 'landing_cta_click',
              cta: 'side_login_tab',
              href: '/login?source=landing',
              source: 'landing',
            })
          }
          className="group flex items-center gap-2 rounded-l-2xl border border-primary/35 bg-card/90 px-4 py-3 shadow-2xl backdrop-blur-md transition-colors hover:bg-card"
          aria-label="Zaloguj się do konta"
        >
          <span className="text-xs font-semibold text-foreground">Zaloguj</span>
          <ArrowUpRight className="h-4 w-4 text-primary transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
        </Link>
      </motion.div>
    </motion.div>
  );
}

function MobileLoginChip({ visible }: { visible: boolean }) {
  return (
    <motion.div
      initial={false}
      animate={{ x: visible ? 0 : 80, opacity: visible ? 1 : 0 }}
      transition={{ duration: 0.24, ease: 'easeOut' }}
      className="fixed bottom-24 right-4 z-40 md:hidden"
    >
      <Link
        href="/login?source=landing"
        onClick={() =>
          trackLandingEvent({
            event: 'landing_cta_click',
            cta: 'mobile_login_chip',
            href: '/login?source=landing',
            source: 'landing',
          })
        }
        className="inline-flex items-center gap-1.5 rounded-full border border-primary/35 bg-card/90 px-3 py-2 text-xs font-semibold text-foreground shadow-xl backdrop-blur-md"
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

export function LandingExperience() {
  const capabilities = useBillingCapabilities();
  const shouldReduceMotion = useReducedMotion();
  const reduceMotion = shouldReduceMotion ?? false;
  const [showMobileStickyCta, setShowMobileStickyCta] = useState(false);

  const plansBySlug = useMemo(
    () => new Map(capabilities.plans.map((plan) => [plan.slug, plan])),
    [capabilities.plans],
  );

  const starterPlan = plansBySlug.get('starter');
  const proPlan = plansBySlug.get('pro');
  const businessPlan = plansBySlug.get('business');

  const metrics = useMemo(
    () => [
      {
        label: 'Kanały',
        target: 4,
        suffix: '',
        helper: 'YT, TikTok, IG, FB',
      },
      {
        label: 'Starter',
        target: extractFirstNumber(starterPlan?.monthlyVideoLabel ?? '', 15),
        suffix: '/mies.',
        helper: 'Pakiet startowy',
      },
      {
        label: 'Pro',
        target: extractFirstNumber(proPlan?.monthlyVideoLabel ?? '', 100),
        suffix: '/mies.',
        helper: 'Limit miękki',
      },
    ],
    [proPlan?.monthlyVideoLabel, starterPlan?.monthlyVideoLabel],
  );

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
        starter: `${extractFirstNumber(starterPlan?.monthlyVideoLabel ?? '', 15)}`,
        pro: `${extractFirstNumber(proPlan?.monthlyVideoLabel ?? '', 100)}`,
        business: (businessPlan?.monthlyVideoLabel ?? '').toLowerCase().includes('brak') ? 'Brak limitu' : normalizeMonthlyLabel(businessPlan?.monthlyVideoLabel ?? '-'),
      },
      {
        label: 'AI_AUTOPILOT_LABEL',
        starter: starterPlan?.aiAutopilotLabel ?? (starterPlan?.aiAutopilot ? 'Tak' : 'Nie'),
        pro: proPlan?.aiAutopilotLabel ?? (proPlan?.aiAutopilot ? 'Tak' : 'Nie'),
        business: businessPlan?.aiAutopilotLabel ?? (businessPlan?.aiAutopilot ? 'Tak' : 'Nie'),
      },
    ],
    [businessPlan, proPlan, starterPlan],
  );

  const activityMessages = useMemo(
    () => [
      `Okres próbny: ${capabilities.trial.days} dni dla nowych kont.`,
      `Starter: do ${extractFirstNumber(starterPlan?.monthlyVideoLabel ?? '', 15)} wideo miesięcznie.`,
      `Pro: limit miękki ${extractFirstNumber(proPlan?.monthlyVideoLabel ?? '', 100)} wideo / miesiąc.`,
      `AI Autopilot: Pro ${proPlan?.aiAutopilotLabel ?? '15 / mies.'}, Business bez limitu.`,
      'Obsługiwane platformy: YouTube, TikTok, Instagram i Facebook.',
    ],
    [capabilities.trial.days, proPlan?.aiAutopilotLabel, proPlan?.monthlyVideoLabel, starterPlan?.monthlyVideoLabel],
  );

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
    const handleScroll = () => {
      setShowMobileStickyCta(window.scrollY > 420);
    };

    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToPricing = () => {
    const section = document.getElementById('pricing');
    if (!section) {
      return;
    }

    section.scrollIntoView({
      behavior: reduceMotion ? 'auto' : 'smooth',
      block: 'start',
    });
  };

  return (
    <main className="relative min-h-full bg-background text-foreground">
      <ScrollProgressWithLogo />
      <FloatingBackground reduceMotion={reduceMotion} />
      <ActivityBubble messages={activityMessages} reduceMotion={reduceMotion} />
      <SideLoginTab reduceMotion={reduceMotion} />
      <MobileLoginChip visible={!showMobileStickyCta} />

      <section data-section="hero" className="relative mx-auto grid w-full max-w-6xl gap-10 px-6 pb-20 pt-16 lg:grid-cols-[1.1fr_0.9fr] lg:pt-24">
        <motion.div variants={container} initial="hidden" animate="show" className="space-y-7">
          <motion.h1 variants={item} className="font-semibold leading-[0.95] text-4xl sm:text-6xl lg:text-7xl">
            Publikuj
            <span className="block bg-gradient-to-r from-primary via-chart-4 to-accent bg-clip-text text-transparent">
              regularnie i prosto
            </span>
          </motion.h1>

          <motion.p variants={item} className="max-w-xl text-base text-muted-foreground sm:text-lg">
            Jeden panel do planowania i publikacji treści na 4 platformach.
          </motion.p>

          <motion.div variants={item} className="flex flex-wrap gap-3">
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
              <motion.span
                aria-hidden="true"
                className="pointer-events-none absolute inset-y-0 left-[-40%] w-1/3 -skew-x-12 bg-white/30 blur-sm"
                animate={{ x: ['-180%', '420%'] }}
                transition={{ duration: 2.2, repeat: Number.POSITIVE_INFINITY, repeatDelay: 1.4, ease: 'easeInOut' }}
              />
              <span className="relative">Wypróbuj za darmo przez 7 dni</span>
              <ArrowUpRight className="h-4 w-4" />
            </Link>
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
          <motion.p variants={item} className="text-xs text-muted-foreground">
            Okres próbny: {capabilities.trial.days} dni ({capabilities.trial.eligibilityNote})
          </motion.p>

          <motion.div
            variants={container}
            initial="hidden"
            animate="show"
            className="grid gap-3 sm:grid-cols-3"
          >
            {metrics.map((metric) => (
              <motion.article
                key={metric.label}
                variants={item}
                className="rounded-2xl border border-white/10 bg-card/45 p-4 backdrop-blur-xl shadow-[0_10px_30px_rgba(2,6,23,0.25)]"
              >
                <p className="text-2xl font-semibold text-primary">
                  <AnimatedMetricValue target={metric.target} suffix={metric.suffix} />
                </p>
                <p className="mt-1 text-xs text-muted-foreground">{metric.label}</p>
                <p className="mt-1 text-[11px] text-muted-foreground/80">{metric.helper}</p>
              </motion.article>
            ))}
          </motion.div>

          <motion.p variants={item} className="inline-flex items-center gap-2 text-xs text-muted-foreground">
            <CircleCheckBig className="h-3.5 w-3.5 text-emerald-400" />
            Jasny cennik i przejrzyste limity bez niedomówień.
          </motion.p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="relative"
        >
          <div className="absolute -inset-2 rounded-[2rem] bg-gradient-to-br from-primary/40 via-transparent to-accent/35 blur-xl" />
          <div className="relative overflow-hidden rounded-[2rem] border border-border bg-card/80 p-6 shadow-2xl">
            <div className="mb-5 flex items-center justify-between">
              <p className="text-sm font-medium text-foreground">Przykładowe KPI po zalogowaniu</p>
              <span className="rounded-full border border-accent/30 bg-accent/20 px-2.5 py-1 text-xs text-accent-foreground">
                Podgląd
              </span>
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

      <section data-section="features" className="relative mx-auto w-full max-w-6xl px-6 pb-24">
        <motion.div
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.25 }}
          variants={container}
          className="grid gap-4 md:grid-cols-3"
        >
          {lanes.map((lane) => {
            const Icon = lane.icon;
            return (
              <motion.article
                key={lane.title}
                variants={item}
                className="rounded-2xl border border-border bg-card/50 p-6"
              >
                <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-primary/20 text-primary">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="mt-4 text-lg font-semibold">{lane.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{lane.description}</p>
              </motion.article>
            );
          })}
        </motion.div>
      </section>

      <section id="pricing" data-section="pricing" className="relative mx-auto w-full max-w-6xl px-6 pb-24">
        <motion.div
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.2 }}
          variants={container}
          className="relative rounded-3xl border border-white/10 bg-gradient-to-br from-card/80 via-card/55 to-accent/15 p-6 shadow-[0_20px_60px_rgba(2,6,23,0.35)] backdrop-blur-xl sm:p-10"
        >
          {!shouldReduceMotion ? (
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

          <motion.div variants={item} className="mt-8 overflow-x-auto rounded-2xl border border-border bg-card/50">
            <table className="min-w-[760px] w-full text-sm" aria-label="Porównanie planów Postfly">
              <caption className="sr-only">Porównanie planów Starter, Pro i Business</caption>
              <thead>
                <tr className="border-b border-border bg-card/70">
                  <th scope="col" className="px-4 py-3 text-left font-medium text-muted-foreground">Porównanie</th>
                  {capabilities.plans.map((plan) => (
                    <th key={plan.slug} scope="col" className="px-4 py-3 text-left font-semibold text-foreground">
                      {plan.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-border/80">
                  <th scope="row" className="px-4 py-3 text-left font-medium text-muted-foreground">Cena / miesiąc</th>
                  {capabilities.plans.map((plan) => (
                    <td key={`${plan.slug}-price`} className="px-4 py-3">{plan.priceMonthly}</td>
                  ))}
                </tr>
                {comparisonRows.map((row) => (
                  <tr key={row.label} className="border-b border-border/80 last:border-b-0">
                    <th scope="row" className="px-4 py-3 text-left font-medium text-muted-foreground">
                      {row.label === 'AI_AUTOPILOT_LABEL' ? <AiAutopilotLabel /> : row.label}
                    </th>
                    <td className="px-4 py-3">{row.starter}</td>
                    <td className="px-4 py-3">{row.pro}</td>
                    <td className="px-4 py-3">{row.business}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </motion.div>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            {capabilities.plans.map((plan) => (
              <Link
                key={plan.name}
                href={resolvePlanHref(plan)}
                onClick={() =>
                  trackLandingEvent({
                    event: 'landing_plan_click',
                    plan: plan.slug,
                    href: resolvePlanHref(plan),
                    source: 'landing',
                  })
                }
                className={`relative inline-flex flex-col items-center justify-center rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors ${
                  plan.featured
                    ? 'border border-primary/40 bg-primary text-primary-foreground shadow-[0_0_0_1px_rgba(245,158,11,0.45),0_0_24px_rgba(245,158,11,0.35)] hover:opacity-95'
                    : 'bg-secondary text-foreground hover:bg-secondary/80'
                }`}
              >
                {plan.featured ? (
                  <span className="absolute -top-2 rounded-full border border-primary/40 bg-background px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-primary">
                    Najczęściej wybierany
                  </span>
                ) : null}
                <span>{`Odbierz dostęp: ${plan.name}`}</span>
                <span className="mt-0.5 text-xs font-medium opacity-85">{`${plan.priceMonthly} / mies.`}</span>
              </Link>
            ))}
          </div>
        </motion.div>
      </section>

      <section id="faq" data-section="faq" className="relative mx-auto w-full max-w-6xl px-6 pb-24">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 0.5 }}
          className="rounded-3xl border border-border bg-card/65 p-6 sm:p-10"
        >
          <p className="text-xs uppercase tracking-[0.18em] text-accent">FAQ</p>
          <h2 className="mt-2 text-3xl font-semibold">Najczęstsze pytania o planowanie publikacji</h2>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            Poniżej znajdziesz odpowiedzi oparte na aktualnym działaniu produktu i limitach planów.
          </p>

          <Accordion type="single" collapsible className="mt-6">
            {faqItems.map((item) => (
              <AccordionItem key={item.question} value={item.question}>
                <AccordionTrigger className="text-base">{item.question}</AccordionTrigger>
                <AccordionContent className="text-sm text-muted-foreground">
                  {item.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </motion.div>
      </section>

      <section data-section="final-cta" className="mx-auto w-full max-w-6xl px-6 pb-24">
        <motion.div
          initial={{ opacity: 0, y: 28 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.6 }}
          className="relative overflow-hidden rounded-3xl border border-border bg-card/70 p-8 text-center sm:p-12"
        >
          <div
            className="pointer-events-none absolute inset-0 opacity-40"
            style={{
              backgroundImage:
                'radial-gradient(circle at 10% 20%, var(--primary) 0%, transparent 40%), radial-gradient(circle at 90% 80%, var(--accent) 0%, transparent 35%)',
            }}
          />
          <div className="relative">
            <p className="inline-flex items-center gap-2 rounded-full border border-border bg-card/60 px-3 py-1 text-xs uppercase tracking-[0.16em] text-foreground">
              <Sparkles className="h-3.5 w-3.5" />
              Zacznij teraz
            </p>
            <h3 className="mx-auto mt-4 max-w-2xl text-3xl font-semibold sm:text-4xl">
              Mniej chaosu, więcej regularnych publikacji.
            </h3>
            <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
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
              <Link
                href="/login?source=landing"
                onClick={() =>
                  trackLandingEvent({
                    event: 'landing_cta_click',
                    cta: 'final_login',
                    href: '/login?source=landing',
                    source: 'landing',
                  })
                }
                className="rounded-xl border border-border bg-card/60 px-5 py-3 text-sm font-semibold text-foreground hover:bg-card/80"
              >
                Mam konto
              </Link>
            </div>
          </div>
        </motion.div>
      </section>
      <MobileStickyCTA visible={showMobileStickyCta} />
    </main>
  );
}

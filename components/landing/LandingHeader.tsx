'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { motion, useScroll, useSpring } from 'framer-motion';
import { ArrowUpRight, Menu, Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { BrandLogo } from '@/components/BrandLogo';
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { trackLandingEvent } from '@/lib/landing-events';
import { TRIAL_CTA_LABEL } from '@/lib/landing-copy';

// Landing navbar (2026-10-03, UX review: the landing had no navigation, only a side "Zaloguj się"
// tab). Replaces ScrollProgressWithLogo, SideLoginTab and MobileLoginChip: transparent over the
// hero, solid with blur once scrolled, the scroll progress as a 2px line on its bottom edge.
// Anchor offsets come from `scroll-padding-top` on <html> (app/globals.css).

const NAV_LINKS = [
  { id: 'produkt', label: 'Jak to działa' },
  { id: 'funkcje', label: 'Funkcje' },
  { id: 'integracje', label: 'Integracje' },
  { id: 'pricing', label: 'Cennik' },
  { id: 'faq', label: 'FAQ' },
] as const;

const MOBILE_EXTRA_LINKS = [{ id: 'contact', label: 'Kontakt' }] as const;

const TRIAL_HREF = '/register?source=landing&intent=trial';

function useActiveSection(ids: readonly string[]) {
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    const visible = new Map<string, boolean>();
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => visible.set(entry.target.id, entry.isIntersecting));
        // The first section (in page order) that crosses the band below the header wins.
        setActive(ids.find((id) => visible.get(id)) ?? null);
      },
      { rootMargin: '-96px 0px -55% 0px' },
    );

    ids.forEach((id) => {
      const node = document.getElementById(id);
      if (node) observer.observe(node);
    });

    return () => observer.disconnect();
  }, [ids]);

  return active;
}

export function LandingHeader({
  loginHref,
  isAuthenticated,
  onMenuOpenChange,
}: {
  loginHref: string;
  isAuthenticated: boolean;
  onMenuOpenChange?: (open: boolean) => void;
}) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const { scrollY, scrollYProgress } = useScroll();
  const progress = useSpring(scrollYProgress, { stiffness: 120, damping: 24, mass: 0.2 });
  const active = useActiveSection(NAV_LINKS.map((link) => link.id));
  const loginLabel = isAuthenticated ? 'Przejdź do panelu' : 'Zaloguj się';

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    setScrolled(scrollY.get() > 8);
    return scrollY.on('change', (latest) => setScrolled(latest > 8));
  }, [scrollY]);

  const setMenu = (open: boolean) => {
    setMenuOpen(open);
    onMenuOpenChange?.(open);
    if (open) trackLandingEvent({ event: 'landing_cta_click', cta: 'nav_menu_open', source: 'landing' });
  };

  const goTo = (id: string) => (event: React.MouseEvent<HTMLAnchorElement>) => {
    trackLandingEvent({ event: 'landing_cta_click', cta: `nav_link_${id}`, href: `#${id}`, source: 'landing' });
    if (!menuOpen) return;
    // Close the sheet first, then scroll - Radix restores focus/scroll-lock on close.
    event.preventDefault();
    setMenu(false);
    window.setTimeout(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      history.replaceState(null, '', `#${id}`);
    }, 220);
  };

  const isDark = resolvedTheme === 'dark';
  const toggleTheme = () => {
    const next = isDark ? 'light' : 'dark';
    setTheme(next);
    trackLandingEvent({ event: 'landing_cta_click', cta: `theme_toggle_${next}`, source: 'landing' });
  };

  return (
    <>
      <a
        href="#tresc"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-3 focus:z-[70] focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-primary-foreground"
      >
        Przejdź do treści
      </a>

      <header
        className={`fixed inset-x-0 top-0 z-40 h-16 transition-[background-color,border-color,box-shadow] duration-200 ${
          scrolled ? 'border-b border-border/60 bg-background/80 shadow-sm backdrop-blur-md' : 'border-b border-transparent bg-transparent'
        }`}
      >
        <div className="mx-auto flex h-full w-full max-w-6xl items-center gap-3 px-4 sm:px-6">
          <Link href="/" aria-label="Postfly - strona główna" className="shrink-0">
            <BrandLogo className="h-8 w-auto" priority />
          </Link>

          <nav aria-label="Główna" className="mx-auto hidden lg:block">
            <ul className="flex items-center gap-1">
              {NAV_LINKS.map((link) => {
                const isActive = active === link.id;
                return (
                  <li key={link.id}>
                    <a
                      href={`#${link.id}`}
                      onClick={goTo(link.id)}
                      aria-current={isActive ? 'location' : undefined}
                      className={`relative rounded-lg px-3 py-2 text-sm transition-colors hover:text-foreground ${
                        isActive ? 'text-foreground' : 'text-muted-foreground'
                      }`}
                    >
                      {link.label}
                      {isActive ? (
                        <span aria-hidden="true" className="absolute inset-x-3 -bottom-0.5 h-0.5 rounded-full bg-primary" />
                      ) : null}
                    </a>
                  </li>
                );
              })}
            </ul>
          </nav>

          <div className="ml-auto flex items-center gap-2 lg:ml-0">
            {mounted ? (
              <button
                type="button"
                onClick={toggleTheme}
                className="hidden h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground lg:inline-flex"
                aria-label={isDark ? 'Włącz jasny motyw' : 'Włącz ciemny motyw'}
                title={isDark ? 'Jasny motyw' : 'Ciemny motyw'}
              >
                {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </button>
            ) : null}

            <Link
              href={loginHref}
              onClick={() => trackLandingEvent({ event: 'landing_cta_click', cta: 'nav_login', href: loginHref, source: 'landing' })}
              className="rounded-lg px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
            >
              {loginLabel}
            </Link>

            <Link
              href={TRIAL_HREF}
              onClick={() => trackLandingEvent({ event: 'landing_cta_click', cta: 'nav_trial', href: TRIAL_HREF, source: 'landing' })}
              className="hidden items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground transition-transform hover:-translate-y-0.5 md:inline-flex"
            >
              {TRIAL_CTA_LABEL}
              <ArrowUpRight className="h-4 w-4" />
            </Link>

            <Sheet open={menuOpen} onOpenChange={setMenu}>
              <SheetTrigger asChild>
                <button
                  type="button"
                  className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-foreground transition-colors hover:bg-secondary lg:hidden"
                  aria-label="Otwórz menu"
                >
                  <Menu className="h-5 w-5" />
                </button>
              </SheetTrigger>
              <SheetContent side="right" className="z-[60] w-[min(88vw,360px)] gap-0 p-0">
                <div className="flex h-16 items-center border-b border-border px-5">
                  <SheetTitle className="sr-only">Menu</SheetTitle>
                  <SheetDescription className="sr-only">Nawigacja po stronie Postfly</SheetDescription>
                  <BrandLogo className="h-7 w-auto" />
                </div>
                <nav aria-label="Menu mobilne" className="flex-1 overflow-y-auto px-3 py-3">
                  <ul>
                    {[...NAV_LINKS, ...MOBILE_EXTRA_LINKS].map((link) => (
                      <li key={link.id}>
                        <a
                          href={`#${link.id}`}
                          onClick={goTo(link.id)}
                          aria-current={active === link.id ? 'location' : undefined}
                          className={`flex h-12 items-center rounded-lg px-3 text-base transition-colors hover:bg-secondary ${
                            active === link.id ? 'font-semibold text-foreground' : 'text-foreground/85'
                          }`}
                        >
                          {link.label}
                        </a>
                      </li>
                    ))}
                  </ul>

                  <div className="my-3 border-t border-border" />

                  {mounted ? (
                    <div role="group" aria-label="Motyw" className="mx-3 grid grid-cols-2 gap-1 rounded-lg border border-border p-1">
                      {(['light', 'dark'] as const).map((value) => (
                        <button
                          key={value}
                          type="button"
                          aria-pressed={resolvedTheme === value}
                          onClick={() => setTheme(value)}
                          className={`inline-flex h-9 items-center justify-center gap-1.5 rounded-md text-sm transition-colors ${
                            resolvedTheme === value ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground'
                          }`}
                        >
                          {value === 'light' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                          {value === 'light' ? 'Jasny' : 'Ciemny'}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </nav>
                <div className="space-y-2 border-t border-border p-4">
                  <Link
                    href={loginHref}
                    onClick={() => trackLandingEvent({ event: 'landing_cta_click', cta: 'nav_login', href: loginHref, source: 'landing' })}
                    className="flex h-11 w-full items-center justify-center rounded-xl border border-border text-sm font-semibold text-foreground"
                  >
                    {loginLabel}
                  </Link>
                  <Link
                    href={TRIAL_HREF}
                    onClick={() => trackLandingEvent({ event: 'landing_cta_click', cta: 'nav_trial', href: TRIAL_HREF, source: 'landing' })}
                    className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-primary-foreground"
                  >
                    {TRIAL_CTA_LABEL}
                    <ArrowUpRight className="h-4 w-4" />
                  </Link>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>

        <motion.div
          aria-hidden="true"
          className="absolute inset-x-0 bottom-0 h-0.5 origin-left bg-gradient-to-r from-primary to-accent"
          style={{ scaleX: progress, opacity: scrolled ? 1 : 0 }}
        />
      </header>
    </>
  );
}

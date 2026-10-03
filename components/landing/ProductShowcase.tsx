'use client';

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Play } from 'lucide-react';
import { trackLandingEvent } from '@/lib/landing-events';

// "Produkt w akcji" (2026-10-03, UX review: the landing described the product but never showed it).
// Three short muted loops recorded from the real app on a fictional demo account with Playwright
// (marketing/capture-showcase.spec.ts). Files: /public/landing/showcase/<id>-{desktop,mobile}.{webm,mp4}
// and <id>-{desktop,mobile}.webp posters.
//
// Playback rules: no autoPlay attribute - JS plays the active clip only while it's at least half
// visible and the tab is active; prefers-reduced-motion / Save-Data get the poster and a play button.

const CLIPS = [
  {
    id: 'opis-ai',
    tab: 'Opis AI',
    title: 'Opis AI osobno dla każdej platformy',
    caption: 'Wrzucasz zdjęcie i jedno zdanie. AI proponuje osobny opis z hashtagami na Facebooka, Instagram i LinkedIn - Ty poprawiasz i zatwierdzasz.',
    alt: 'Postfly - edytor posta: zdjęcie kubka i osobne propozycje opisu AI dla Facebooka, Instagrama i LinkedIn (konto demo)',
    url: 'postfly.pl/dashboard',
    description:
      'Nagranie: użytkownik otwiera nowy post ze zdjęciem kubka i notatką o nowej serii. Postfly pokazuje osobne propozycje opisu dla Facebooka, Instagrama i LinkedIn z dopiskiem „Propozycja AI”. Użytkownik poprawia jedno słowo w opisie i przechodzi dalej.',
  },
  {
    id: 'harmonogram',
    tab: 'Harmonogram',
    title: 'Harmonogram publikacji',
    caption: 'Wybierasz dzień i godzinę. Post czeka w zakładce „Zaplanowane” i publikuje się o czasie - nie musisz być wtedy online.',
    alt: 'Postfly - harmonogram publikacji z zakładkami Do akceptacji, Zaplanowane i Opublikowane (konto demo)',
    url: 'postfly.pl/schedule',
    description:
      'Nagranie: ekran harmonogramu z zakładkami Do akceptacji, Zaplanowane i Opublikowane. Na liście zaplanowanych widać kilka postów na najbliższe dni z godzinami i platformami.',
  },
  {
    id: 'rozwoj',
    tab: 'Rozwój',
    title: 'Rozwój kont w jednym miejscu',
    caption: 'Liczba obserwujących z każdej platformy na jednym ekranie. Widzisz, jak rosną Twoje profile.',
    alt: 'Postfly - rozwój kont: liczba obserwujących na Instagramie, Facebooku i LinkedIn w jednym widoku (konto demo)',
    url: 'postfly.pl/growth',
    description:
      'Nagranie: ekran rozwoju kont z liczbą obserwujących na Instagramie, Facebooku i LinkedIn oraz wzrostem z ostatnich 30 dni.',
  },
] as const;

type ClipId = (typeof CLIPS)[number]['id'];

function assetBase(id: ClipId, mobile: boolean) {
  return `/landing/showcase/${id}-${mobile ? 'mobile' : 'desktop'}`;
}

function usePrefersStillMedia() {
  const [still, setStill] = useState(false);

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData === true;
    const update = () => setStill(media.matches || saveData);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  return still;
}

function useIsMobileViewport() {
  const [mobile, setMobile] = useState<boolean | null>(null);

  useEffect(() => {
    const media = window.matchMedia('(max-width: 767px)');
    const update = () => setMobile(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  return mobile;
}

export function ProductShowcase() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [userStarted, setUserStarted] = useState(false);
  const still = usePrefersStillMedia();
  const mobile = useIsMobileViewport();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const active = CLIPS[activeIndex];
  const autoplayAllowed = !still || userStarted;
  const isMobile = mobile === true;

  // Play only while visible and the tab is active.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || mobile === null) return;

    let visible = false;
    const sync = () => {
      if (autoplayAllowed && visible && document.visibilityState === 'visible') {
        void video.play().catch(() => {});
      } else {
        video.pause();
      }
    };

    const observer = new IntersectionObserver(
      ([entry]) => {
        visible = entry.intersectionRatio >= 0.5;
        sync();
      },
      { threshold: [0, 0.5, 1] },
    );
    observer.observe(video);
    document.addEventListener('visibilitychange', sync);

    return () => {
      observer.disconnect();
      document.removeEventListener('visibilitychange', sync);
    };
  }, [activeIndex, mobile, autoplayAllowed]);

  const select = (index: number, focus = false) => {
    setActiveIndex(index);
    setProgress(0);
    if (focus) tabRefs.current[index]?.focus();
    trackLandingEvent({ event: 'landing_cta_click', cta: `showcase_tab_${CLIPS[index].id}`, source: 'landing' });
  };

  const onTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const last = CLIPS.length - 1;
    const keys: Record<string, number> = {
      ArrowRight: activeIndex === last ? 0 : activeIndex + 1,
      ArrowDown: activeIndex === last ? 0 : activeIndex + 1,
      ArrowLeft: activeIndex === 0 ? last : activeIndex - 1,
      ArrowUp: activeIndex === 0 ? last : activeIndex - 1,
      Home: 0,
      End: last,
    };
    if (event.key in keys) {
      event.preventDefault();
      select(keys[event.key], true);
    }
  };

  const base = assetBase(active.id, isMobile);

  return (
    <section id="produkt" data-section="product-demo" className="relative mx-auto w-full max-w-6xl px-4 pb-24 sm:px-6">
      <div className="max-w-3xl">
        <p className="text-xs uppercase tracking-[0.18em] text-accent">Produkt w akcji</p>
        <h2 className="mt-2 text-balance text-2xl font-semibold sm:text-3xl">Zobacz, jak powstaje post w Postfly</h2>
        <p className="mt-3 text-sm text-muted-foreground sm:text-base">
          Prawdziwe ekrany aplikacji nagrane na koncie demonstracyjnym: od zdjęcia i jednego zdania do zaplanowanego posta.
        </p>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,2fr)] lg:items-start">
        <div
          role="tablist"
          aria-label="Funkcje Postfly na nagraniach"
          aria-orientation={isMobile ? 'horizontal' : 'vertical'}
          className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0"
        >
          {CLIPS.map((clip, index) => {
            const selected = index === activeIndex;
            return (
              <button
                key={clip.id}
                ref={(node) => {
                  tabRefs.current[index] = node;
                }}
                type="button"
                role="tab"
                id={`showcase-tab-${clip.id}`}
                aria-selected={selected}
                aria-controls="showcase-panel"
                tabIndex={selected ? 0 : -1}
                onClick={() => select(index)}
                onKeyDown={onTabKeyDown}
                className={`shrink-0 rounded-xl border text-left transition-colors lg:w-full lg:p-4 ${
                  selected
                    ? 'border-primary/50 bg-primary/10 text-foreground'
                    : 'border-border bg-card/40 text-muted-foreground hover:bg-card/70 hover:text-foreground'
                } px-4 py-2 lg:px-4`}
              >
                <span className="flex items-center gap-3">
                  <span
                    aria-hidden="true"
                    className={`hidden h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold lg:inline-flex ${
                      selected ? 'bg-primary text-primary-foreground' : 'bg-secondary text-foreground'
                    }`}
                  >
                    {index + 1}
                  </span>
                  <span className="text-sm font-semibold">
                    <span className="lg:hidden">{clip.tab}</span>
                    <span className="hidden lg:inline">{clip.title}</span>
                  </span>
                </span>
                <span className="mt-2 hidden text-sm leading-relaxed text-muted-foreground lg:block">{clip.caption}</span>
                {selected ? (
                  <span aria-hidden="true" className="mt-3 hidden h-0.5 overflow-hidden rounded-full bg-secondary lg:block">
                    <span className="block h-full bg-primary transition-[width] duration-200" style={{ width: `${progress}%` }} />
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>

        <figure
          id="showcase-panel"
          role="tabpanel"
          aria-labelledby={`showcase-tab-${active.id}`}
          className="min-w-0"
        >
          <div
            className={`relative mx-auto overflow-hidden border border-border bg-card shadow-2xl ${
              isMobile ? 'max-w-[420px] rounded-3xl' : 'rounded-2xl'
            }`}
          >
            {!isMobile ? (
              <div aria-hidden="true" className="flex h-9 items-center gap-2 border-b border-border bg-secondary/60 px-3">
                <span className="h-2.5 w-2.5 rounded-full bg-red-400/80" />
                <span className="h-2.5 w-2.5 rounded-full bg-amber-400/80" />
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/80" />
                <span className="ml-3 truncate rounded-md bg-background/80 px-3 py-0.5 text-xs text-muted-foreground">{active.url}</span>
              </div>
            ) : null}

            <div className={isMobile ? 'aspect-[390/693] max-h-[70svh] mx-auto' : 'aspect-[16/10]'}>
              {mobile === null ? null : (
                <video
                  key={base}
                  ref={videoRef}
                  className="h-full w-full object-cover object-top"
                  muted
                  loop
                  playsInline
                  preload="none"
                  poster={`${base}.webp`}
                  aria-label={active.alt}
                  aria-describedby={`showcase-desc-${active.id}`}
                  onTimeUpdate={(event) => {
                    const video = event.currentTarget;
                    if (video.duration) setProgress((video.currentTime / video.duration) * 100);
                  }}
                >
                  <source src={`${base}.webm`} type="video/webm" />
                  <source src={`${base}.mp4`} type="video/mp4" />
                </video>
              )}
            </div>

            {still && !userStarted ? (
              <button
                type="button"
                onClick={() => {
                  setUserStarted(true);
                  void videoRef.current?.play().catch(() => {});
                }}
                className="absolute inset-0 m-auto inline-flex h-12 w-fit items-center gap-2 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-xl"
              >
                <Play className="h-4 w-4" />
                Odtwórz
              </button>
            ) : null}
          </div>

          <figcaption className="mt-4 lg:hidden">
            <p className="text-sm font-semibold text-foreground">{active.title}</p>
            <p className="mt-1 text-sm text-muted-foreground">{active.caption}</p>
          </figcaption>
          <p id={`showcase-desc-${active.id}`} className="sr-only">
            {active.description}
          </p>
          <p className="mt-3 text-xs text-muted-foreground">Nagranie z konta demo, dane przykładowe.</p>
        </figure>
      </div>
    </section>
  );
}

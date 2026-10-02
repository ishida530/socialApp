import Link from 'next/link';
import { CalendarClock, Layers, Sparkles } from 'lucide-react';
import * as m from 'framer-motion/client';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { LANDING_FAQ_ITEMS } from '@/lib/landing-faq';
import { InteractiveMotion, SectionReveal } from '@/components/landing/LandingMotion';
import { container, item, sectionFromLeft, sectionFromRight } from '@/components/landing/landing-motion';

// Static landing sections as Server Components (2026-10-01, landing split): their markup and data
// are rendered on the server and never ship as client JS. Motion still works - the motion elements
// come from 'framer-motion/client' and the reveal / hover behavior from the LandingMotion islands.

const lanes = [
  {
    icon: CalendarClock,
    title: 'Prosty harmonogram',
    description:
      'Planujesz tydzień publikacji w kilku kliknięciach.',
  },
  {
    icon: Layers,
    title: 'Wszystkie kanały w jednym panelu',
    description:
      'Facebook, Instagram i LinkedIn już teraz, TikTok i YouTube wkrótce. Limity kont zależne od planu: 3, 10 lub 25 łącznie.',
  },
  {
    icon: Sparkles,
    title: 'Wnioski AI',
    description:
      'Szybkie podpowiedzi co publikować i kiedy.',
  },
];

const seoUseCases = [
  {
    title: 'Planowanie publikacji Reels i postów',
    description:
      'Ustal harmonogram publikacji na Facebooku, w Instagram Reels i na LinkedIn z jednego panelu, bez ręcznego przełączania narzędzi. TikTok i YouTube Shorts dołączą po zatwierdzeniu przez platformy.',
  },
  {
    title: 'Kalendarz publikacji social media dla zespołu',
    description:
      'Porządkuj kolejkę treści, monitoruj statusy zadań i trzymaj stały rytm publikacji nawet przy wielu kampaniach miesięcznie.',
  },
  {
    title: 'Automatyzacja publikacji i analiza wyników',
    description:
      'Łącz automatyczne publikowanie z podpowiedziami AI, aby szybciej wyłapywać najlepsze okna czasowe i skalować działania.',
  },
];

export function LandingFeaturesSection() {
  return (
      <section data-section="features" className="relative mx-auto w-full max-w-6xl px-6 pb-24">
        <SectionReveal
          variants={sectionFromLeft}
          className="grid gap-4 md:grid-cols-3"
        >
          {lanes.map((lane, index) => {
            const Icon = lane.icon;
            return (
              <m.article
                key={lane.title}
                variants={item}
                className="rounded-2xl border border-border bg-card/50 p-6"
              >
                <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Krok {index + 1}</p>
                <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-primary/20 text-primary">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="mt-4 text-lg font-semibold">{lane.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{lane.description}</p>
              </m.article>
            );
          })}
        </SectionReveal>
      </section>
  );
}

export function LandingSeoSection() {
  return (
      <section data-section="seo-content" className="relative mx-auto w-full max-w-6xl px-6 pb-24">
        <SectionReveal
          variants={sectionFromRight}
          className="rounded-3xl border border-border bg-card/50 p-6 sm:p-10"
        >
          <m.p variants={item} className="text-xs uppercase tracking-[0.18em] text-accent">Zastosowania</m.p>
          <m.h2 variants={item} className="mt-2 text-3xl font-semibold">
            Narzędzie do planowania publikacji social media dla twórców i marek
          </m.h2>
          <m.p variants={item} className="mt-3 max-w-3xl text-sm text-muted-foreground">
            Postfly pomaga planować publikacje w social media, utrzymywać regularność i skracać czas operacyjny.
            Jeśli szukasz rozwiązania typu social media scheduler dla polskiego rynku, tutaj połączysz harmonogram,
            limity planu i panel publikacji w jednym miejscu. Limity kont social: Starter do 3,
            Pro do 10, Business do 25 łącznie.
          </m.p>

          <m.div variants={container} className="mt-7 grid gap-4 md:grid-cols-3">
            {seoUseCases.map((useCase) => (
              <m.article
                key={useCase.title}
                variants={item}
                className="rounded-2xl border border-border bg-card/40 p-5"
              >
                <h3 className="text-base font-semibold text-foreground">{useCase.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{useCase.description}</p>
              </m.article>
            ))}
          </m.div>

          <m.p variants={item} className="mt-6 text-xs text-muted-foreground">
            Zobacz szczegóły planów w sekcji cennika albo rozpocznij od
            {' '}
            <Link href="/register?source=landing&intent=trial" className="text-primary hover:underline">
              bezpłatnego okresu próbnego
            </Link>
            .
          </m.p>
        </SectionReveal>
      </section>
  );
}

// What each integration does and which data it uses (2026-10-02). Platform reviewers check the
// homepage: Google's OAuth verification requires it to describe the app's functionality behind
// every requested scope, and TikTok verifies the site of the app it audits - so TikTok and
// YouTube are described here in full even while they wait for approval.
const integrations = [
  {
    name: 'Facebook',
    status: 'Dostępne',
    description:
      'Publikujesz posty, zdjęcia i filmy na wybranej przez siebie Stronie na Facebooku. Widzisz liczbę obserwujących Strony i statystyki postów opublikowanych przez Postfly.',
  },
  {
    name: 'Instagram',
    status: 'Dostępne',
    description:
      'Publikujesz zdjęcia i Reels na swoim koncie profesjonalnym Instagram połączonym ze Stroną. Widzisz liczbę obserwujących i statystyki swoich publikacji.',
  },
  {
    name: 'LinkedIn',
    status: 'Dostępne',
    description: 'Publikujesz posty na swoim profilu LinkedIn. Postfly używa nazwy profilu, żeby pokazać, gdzie trafi post.',
  },
  {
    name: 'TikTok',
    status: 'W trakcie zatwierdzania przez TikTok',
    description:
      'Publikujesz własne filmy i zdjęcia na swoim koncie TikTok (Direct Post). Przed publikacją sam wybierasz widoczność, zgody na komentarze, duety i stitch oraz oznaczenie treści komercyjnych. Postfly nie dodaje znaków wodnych. Widzisz liczbę obserwujących i statystyki filmów opublikowanych przez Postfly.',
  },
  {
    name: 'YouTube',
    status: 'W trakcie zatwierdzania przez Google',
    description:
      'Wgrywasz własne filmy na swój kanał YouTube: sam wpisujesz tytuł i opis, wybierasz widoczność i klikasz „Opublikuj”. Postfly odczytuje liczbę subskrybentów kanału i statystyki filmów opublikowanych przez Postfly, żeby pokazać je tylko Tobie.',
  },
];

export function LandingIntegrationsSection() {
  return (
      <section id="integracje" data-section="integrations" className="relative mx-auto w-full max-w-6xl px-6 pb-24">
        <SectionReveal
          variants={sectionFromLeft}
          className="rounded-3xl border border-border bg-card/50 p-6 sm:p-10"
        >
          <m.p variants={item} className="text-xs uppercase tracking-[0.18em] text-accent">Integracje</m.p>
          <m.h2 variants={item} className="mt-2 text-3xl font-semibold">Co Postfly robi z Twoimi kontami</m.h2>
          <m.p variants={item} className="mt-3 max-w-3xl text-sm text-muted-foreground">
            Łączysz konta przez oficjalne logowanie platform (OAuth). Postfly publikuje wyłącznie treści, które sam
            przygotujesz i zatwierdzisz przyciskiem, i pokazuje statystyki tylko Tobie. Nie udostępniamy tych danych osobom
            trzecim i nie wykorzystujemy ich do reklam. Połączenie odłączysz w każdej chwili w ustawieniach,
            a dane z platformy zostaną usunięte. Szczegóły w{' '}
            <Link href="/privacy" className="text-primary hover:underline">
              polityce prywatności
            </Link>
            .
          </m.p>

          <m.div variants={container} className="mt-7 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {integrations.map((integration) => (
              <m.article
                key={integration.name}
                variants={item}
                className="rounded-2xl border border-border bg-card/40 p-5"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-base font-semibold text-foreground">{integration.name}</h3>
                  <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
                    {integration.status}
                  </span>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">{integration.description}</p>
              </m.article>
            ))}
          </m.div>

          <m.p variants={item} lang="en" className="mt-6 text-xs text-muted-foreground">
            In English: Postfly is a social media scheduler. Users connect their own Facebook Page, Instagram
            professional account, LinkedIn profile, TikTok account and YouTube channel via official OAuth, then
            publish their own content only after reviewing it and clicking Publish. TikTok: Direct Post of the
            creator&apos;s own videos and photos with the privacy level and interaction settings chosen by the
            creator, plus follower and post statistics (user.info.basic, video.publish, user.info.stats,
            video.list). YouTube: uploading the user&apos;s own videos with the title, description and visibility they
            set (youtube.upload), and showing them the subscriber count and statistics of their own videos
            (youtube.readonly). Platform data is not shared with third parties or used for advertising, and is
            deleted when the account is disconnected. See the{' '}
            <Link href="/privacy" className="text-primary hover:underline">
              Privacy Policy
            </Link>
            .
          </m.p>
        </SectionReveal>
      </section>
  );
}

export function LandingFaqSection() {
  return (
      <section id="faq" data-section="faq" className="relative mx-auto w-full max-w-6xl px-6 pb-24">
        <SectionReveal
          variants={sectionFromRight}
          className="rounded-3xl border border-border bg-card/65 p-6 sm:p-10"
        >
          <m.p variants={item} className="text-xs uppercase tracking-[0.18em] text-accent">FAQ</m.p>
          <m.h2 variants={item} className="mt-2 text-3xl font-semibold">Najczęstsze pytania o planowanie publikacji</m.h2>
          <m.p variants={item} className="mt-2 max-w-3xl text-sm text-muted-foreground">
            Poniżej znajdziesz odpowiedzi oparte na aktualnym działaniu produktu i limitach planów.
          </m.p>

          <Accordion type="single" collapsible className="mt-6 space-y-2">
            {LANDING_FAQ_ITEMS.map((faqItem) => (
              <InteractiveMotion
                key={faqItem.question}
                variants={item}
                className="rounded-xl border border-border/70 bg-card/35 px-3"
              >
                <AccordionItem value={faqItem.question}>
                  <AccordionTrigger className="text-base">{faqItem.question}</AccordionTrigger>
                  <AccordionContent className="text-sm text-muted-foreground">
                    {faqItem.answer}
                  </AccordionContent>
                </AccordionItem>
              </InteractiveMotion>
            ))}
          </Accordion>
        </SectionReveal>
      </section>
  );
}

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

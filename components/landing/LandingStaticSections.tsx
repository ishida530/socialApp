import Link from 'next/link';
import { CalendarClock, LayoutList, MessageCircle, ShieldCheck, Sparkles, TrendingUp } from 'lucide-react';
import * as m from 'framer-motion/client';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { LANDING_FAQ_ITEMS } from '@/lib/landing-faq';
import { InteractiveMotion, SectionReveal } from '@/components/landing/LandingMotion';
import { container, item, sectionFromLeft, sectionFromRight } from '@/components/landing/landing-motion';

// Static landing sections as Server Components (2026-10-01, landing split): their markup and data
// are rendered on the server and never ship as client JS. Motion still works - the motion elements
// come from 'framer-motion/client' and the reveal / hover behavior from the LandingMotion islands.
//
// Copy (2026-10-03, conversion/SEO review): benefit-first, only what the product does today.

const features = [
  {
    icon: Sparkles,
    title: 'Opis dopasowany do każdej platformy',
    description:
      'Z jednej notatki dostajesz osobne propozycje opisu i hashtagów na Facebooka, Instagram i LinkedIn. Każdą poprawisz przed publikacją.',
    demo: true,
  },
  {
    icon: CalendarClock,
    title: 'Publikuj teraz albo zaplanuj',
    description: 'Wybierasz dzień i godzinę, a post publikuje się o czasie. Nie musisz pamiętać ani siedzieć z telefonem w ręku.',
    demo: true,
  },
  {
    icon: LayoutList,
    title: 'Wszystko w jednym harmonogramie',
    description: 'Zakładki „Do akceptacji”, „Zaplanowane” i „Opublikowane” pokazują, co czeka, co jest w kolejce i co już poszło.',
    demo: true,
  },
  {
    icon: TrendingUp,
    title: 'Rozwój i statystyki w jednym widoku',
    description:
      'Obserwujący z każdej platformy i podstawowe statystyki postów opublikowanych przez Postfly - bez logowania się do trzech aplikacji.',
    demo: false,
  },
  {
    icon: MessageCircle,
    title: 'Asystent na Telegramie',
    description:
      'Wyślij zdjęcie do bota Postfly, zatwierdzaj posty przyciskiem i dostawaj powiadomienia o publikacjach prosto na czacie.',
    demo: false,
  },
  {
    icon: ShieldCheck,
    title: 'AI podpowiada, Ty decydujesz',
    description: 'Żaden opis nie trafi na Twój profil bez Twojego zatwierdzenia. Propozycje AI możesz zmienić, skrócić albo napisać od nowa.',
    demo: false,
  },
];

const useCases = [
  {
    title: 'Salon i usługi lokalne',
    description:
      'Zdjęcie metamorfozy zrobione między klientami, jedno zdanie i post zaplanowany na wieczór. Facebook dla stałych klientów, Instagram dla nowych - każdy z innym opisem.',
  },
  {
    title: 'Sklep i e-commerce',
    description:
      'Nowa dostawa, produkt tygodnia, wyprzedaż: wrzucasz zdjęcie, a AI proponuje opis z hashtagami pod Instagram i Facebook. Posty na cały tydzień zaplanujesz w jedno popołudnie.',
  },
  {
    title: 'Twórca i marka osobista',
    description:
      'Instagram dla społeczności, LinkedIn dla marki zawodowej. Ten sam materiał, dwa różne teksty - bez pisania od zera. TikTok i YouTube dołączą po zatwierdzeniu integracji.',
  },
];

export function LandingFeaturesSection() {
  return (
      <section id="funkcje" data-section="features" className="relative mx-auto w-full max-w-6xl px-4 pb-24 sm:px-6">
        <div className="mb-6 max-w-3xl">
          <p className="text-xs uppercase tracking-[0.18em] text-accent">Funkcje</p>
          <h2 className="mt-2 text-balance text-2xl font-semibold sm:text-3xl">Planowanie postów bez przepisywania opisów</h2>
          <p className="mt-3 text-sm text-muted-foreground sm:text-base">
            Ten sam post na trzy platformy to zwykle trzy różne opisy. Postfly przygotowuje je z jednej notatki, a Ty zostajesz przy
            decyzjach.
          </p>
        </div>
        <SectionReveal
          variants={sectionFromLeft}
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
        >
          {features.map((feature) => {
            const Icon = feature.icon;
            return (
              <m.article
                key={feature.title}
                variants={item}
                className="flex flex-col rounded-2xl border border-border bg-card/50 p-5 sm:p-6"
              >
                <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-primary/20 text-primary">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </div>
                <h3 className="mt-4 text-lg font-semibold">{feature.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{feature.description}</p>
                {feature.demo ? (
                  <a href="#produkt" className="mt-auto pt-3 text-sm font-medium text-primary hover:underline">
                    Zobacz nagranie
                  </a>
                ) : null}
              </m.article>
            );
          })}
        </SectionReveal>
        <p className="mt-4 text-xs text-muted-foreground">
          Wkrótce: podpowiedzi odpowiedzi na komentarze z Facebooka i Instagrama (czekamy na zatwierdzenie przez Meta).
        </p>
      </section>
  );
}

export function LandingSeoSection() {
  return (
      <section id="zastosowania" data-section="seo-content" className="relative mx-auto w-full max-w-6xl px-4 pb-24 sm:px-6">
        <SectionReveal
          variants={sectionFromRight}
          className="rounded-3xl border border-border bg-card/50 p-5 sm:p-10"
        >
          <m.p variants={item} className="text-xs uppercase tracking-[0.18em] text-accent">Zastosowania</m.p>
          <m.h2 variants={item} className="mt-2 text-balance text-2xl font-semibold sm:text-3xl">
            Harmonogram social media dla małych firm i twórców
          </m.h2>
          <m.p variants={item} className="mt-3 max-w-3xl text-sm text-muted-foreground">
            Salony, gastronomia, sklepy, biura nieruchomości, usługi lokalne i twórcy - wszędzie tam, gdzie zdjęcia powstają
            w biegu, a na pisanie opisów brakuje czasu.
          </m.p>

          <m.div variants={container} className="mt-7 grid gap-4 md:grid-cols-3">
            {useCases.map((useCase) => (
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

          <m.p variants={item} className="mt-6 text-sm text-muted-foreground">
            Porównaj plany w{' '}
            <a href="#pricing" className="text-primary hover:underline">
              cenniku
            </a>{' '}
            albo{' '}
            <Link href="/register?source=landing&intent=trial" className="text-primary hover:underline">
              wypróbuj Postfly przez 7 dni bez karty
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
      'Publikujesz zdjęcia i Reels na swoim koncie profesjonalnym Instagram połączonym ze Stroną. Widzisz liczbę obserwujących i statystyki swoich publikacji. Wymagane konto profesjonalne (firmowe lub twórcy) połączone ze Stroną na Facebooku.',
  },
  {
    name: 'LinkedIn',
    status: 'Dostępne',
    description: 'Publikujesz posty na swoim profilu LinkedIn. Postfly używa nazwy profilu, żeby pokazać, gdzie trafi post. Obecnie publikacja na profilu osobistym.',
  },
  {
    name: 'TikTok',
    status: 'Wkrótce - czeka na zatwierdzenie przez TikTok',
    description:
      'Publikujesz własne filmy i zdjęcia na swoim koncie TikTok (Direct Post). Przed publikacją sam wybierasz widoczność, zgody na komentarze, duety i stitch oraz oznaczenie treści komercyjnych. Postfly nie dodaje znaków wodnych. Widzisz liczbę obserwujących i statystyki filmów opublikowanych przez Postfly.',
  },
  {
    name: 'YouTube',
    status: 'Wkrótce - czeka na zatwierdzenie przez Google',
    description:
      'Wgrywasz własne filmy na swój kanał YouTube: sam wpisujesz tytuł i opis, wybierasz widoczność i klikasz „Opublikuj”. Postfly odczytuje liczbę subskrybentów kanału i statystyki filmów opublikowanych przez Postfly, żeby pokazać je tylko Tobie.',
  },
];

export function LandingIntegrationsSection() {
  return (
      <section id="integracje" data-section="integrations" className="relative mx-auto w-full max-w-6xl px-4 pb-24 sm:px-6">
        <SectionReveal
          variants={sectionFromLeft}
          className="rounded-3xl border border-border bg-card/50 p-6 sm:p-10"
        >
          <m.p variants={item} className="text-xs uppercase tracking-[0.18em] text-accent">Integracje</m.p>
          <m.h2 variants={item} className="mt-2 text-balance text-2xl font-semibold sm:text-3xl">Bezpieczne połączenie z Facebookiem, Instagramem i LinkedIn</m.h2>
          <m.p variants={item} className="mt-3 max-w-3xl text-sm text-muted-foreground">
            Logujesz się przez oficjalne okno platformy (OAuth) - Postfly nigdy nie poznaje Twoich haseł. Postfly publikuje wyłącznie treści, które sam
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

          <m.details variants={item} className="mt-6 text-xs text-muted-foreground">
            <summary className="cursor-pointer select-none">In English (for platform reviewers)</summary>
            <p lang="en" className="mt-2">
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
            {' '}TikTok and YouTube integrations are pending platform approval and are marked "wkrótce" (coming soon) until then.
            </p>
          </m.details>
        </SectionReveal>
      </section>
  );
}

export function LandingFaqSection() {
  return (
      <section id="faq" data-section="faq" className="relative mx-auto w-full max-w-6xl px-4 pb-24 sm:px-6">
        <SectionReveal
          variants={sectionFromRight}
          className="rounded-3xl border border-border bg-card/65 p-6 sm:p-10"
        >
          <m.p variants={item} className="text-xs uppercase tracking-[0.18em] text-accent">FAQ</m.p>
          <m.h2 variants={item} className="mt-2 text-balance text-2xl font-semibold sm:text-3xl">Pytania o Postfly i planowanie postów</m.h2>
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

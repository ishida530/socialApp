import { isFreeBeta } from '@/lib/beta';

const BETA = isFreeBeta();

export type LandingFaqItem = {
  question: string;
  answer: string;
};

// Landing FAQ (2026-10-03, conversion/SEO review): objection-first, every answer checked against
// the code (plans.ts limits, subscription.ts trial, billing webhook). Also feeds the FAQPage JSON-LD
// in app/page.tsx, so the visible text and the structured data always match.
export const LANDING_FAQ_ITEMS: LandingFaqItem[] = [
  {
    question: 'Czym jest Postfly?',
    answer:
      'Postfly to polska aplikacja do planowania i publikowania postów na Facebooku, Instagramie i LinkedIn. Wgrywasz zdjęcie lub film, dopisujesz jedno zdanie, a AI proponuje osobny opis i hashtagi dla każdej platformy. Po Twojej akceptacji post publikuje się od razu albo w wybranym terminie.',
  },
  {
    question: 'Na jakich platformach mogę publikować?',
    answer:
      'Dziś: Facebook (Strony), Instagram (konta profesjonalne połączone ze Stroną) i LinkedIn (profil osobisty). TikTok i YouTube udostępnimy, gdy platformy zatwierdzą integrację - do tego czasu są oznaczone jako „wkrótce”.',
  },
  {
    question: 'Czy AI publikuje posty samo?',
    answer:
      'Nie. AI przygotowuje propozycję opisu i hashtagów na podstawie Twojej notatki i zdjęcia (lub kadru z filmu), osobno dla każdej platformy. Każdą propozycję możesz edytować, a publikację zawsze zatwierdzasz sam.',
  },
  {
    question: BETA ? 'Czy Postfly jest płatny?' : 'Czy do okresu próbnego potrzebuję karty płatniczej?',
    answer:
      BETA
      ? 'Teraz nie. Postfly jest w darmowej becie: po założeniu konta i potwierdzeniu adresu e-mail masz plan PRO bez opłat i bez podawania karty. Płatne plany uruchomimy później i uprzedzimy o tym e-mailem z wyprzedzeniem - nic nie zostanie pobrane automatycznie.'
      : 'Nie. Po założeniu konta i potwierdzeniu adresu e-mail masz plan PRO przez 7 dni, z limitem 50 tekstów AI. Nie podajesz karty.',
  },
  {
    question: BETA ? 'Co się stanie po zakończeniu bety?' : 'Co się stanie po 7 dniach okresu próbnego?',
    answer:
      BETA
      ? 'Zanim włączymy płatne plany, napiszemy do Ciebie e-mailem. Bez wybrania płatnego planu konto przejdzie na darmowy plan Free (1 konto, 3 publikacje w miesiącu, planowanie do 3 dni naprzód, 20 tekstów AI) - niczego nie pobierzemy automatycznie.'
      : 'Konto automatycznie przechodzi na darmowy plan Free (1 konto, 3 publikacje w miesiącu, planowanie do 3 dni naprzód, 20 tekstów AI). Nic nie jest pobierane. Płatny plan wybierasz sam, kiedy chcesz.',
  },
  {
    question: 'Czy Postfly zna moje hasła do Facebooka czy Instagrama?',
    answer:
      'Nie. Konta łączysz przez oficjalne logowanie platform (OAuth), więc hasło wpisujesz tylko na stronie Facebooka, Instagrama lub LinkedIn. Połączenie odłączysz w każdej chwili w ustawieniach, a dane z platformy zostaną usunięte - szczegóły w polityce prywatności.',
  },
  {
    question: 'Jakie konto na Instagramie jest potrzebne?',
    answer:
      'Konto profesjonalne (firmowe lub twórcy) połączone ze Stroną na Facebooku. Zmiana typu konta jest bezpłatna i robi się ją w ustawieniach Instagrama.',
  },
  {
    question: 'Ile kont social mogę podłączyć?',
    answer:
      'Free 1, Starter do 3, Pro do 10, Business do 25 kont łącznie. W ramach limitu możesz podłączyć kilka kont na jednej platformie, np. kilka Stron na Facebooku.',
  },
  {
    question: 'Jak liczone są limity publikacji?',
    answer:
      'Jedna publikacja to jeden post na jednym koncie, więc post wysłany na Facebooka, Instagram i LinkedIn liczy się jako 3. Free: 3, Starter: 15 publikacji miesięcznie. Pro: orientacyjnie do 100 materiałów miesięcznie. Business nie ma limitu publikacji.',
  },
  {
    question: 'Ile tekstów AI mam w planie?',
    answer:
      BETA
      ? 'W czasie bety masz limit planu PRO: 600 tekstów AI miesięcznie. Po becie: Free 20, Starter 200, Pro 600, Business 1500. Limit obejmuje opisy postów i odpowiedzi asystenta. Gdy się wyczerpie, nadal publikujesz - opis piszesz wtedy sam.'
      : 'Miesięcznie: Free 20, Starter 200, Pro 600, Business 1500; w okresie próbnym 50. Limit obejmuje opisy postów i odpowiedzi asystenta. Gdy się wyczerpie, nadal publikujesz - opis piszesz wtedy sam.',
  },
  {
    question: 'Czym jest AI Autopilot?',
    answer:
      'Autopilot przegląda oczekujące publikacje i proponuje lepsze godziny ich wysłania na podstawie wyników Twoich wcześniejszych postów. Nie zmienia treści postów. Dostępny od planu Pro (Lite, 15 uruchomień miesięcznie); w planie Business bez limitu.',
  },
  {
    question: 'Jak zrezygnować z subskrypcji?',
    answer:
      BETA
      ? 'W czasie bety nie ma subskrypcji ani opłat - po prostu przestajesz korzystać, a konto możesz usunąć w ustawieniach (dane zostaną usunięte). Po włączeniu płatnych planów zrezygnujesz w panelu płatności w każdej chwili.'
      : 'W panelu płatności w aplikacji (obsługiwanym przez Stripe). Subskrypcja odnawia się automatycznie, dopóki nie zrezygnujesz przed kolejnym okresem rozliczeniowym; po rezygnacji konto wraca na plan Free.',
  },
];

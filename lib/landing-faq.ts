export type LandingFaqItem = {
  question: string;
  answer: string;
};

export const LANDING_FAQ_ITEMS: LandingFaqItem[] = [
  {
    question: 'Czy okres próbny trwa 7 dni dla każdego zakupu?',
    answer:
      'Nie. Okres próbny 7 dni dotyczy nowych kont i pierwszej subskrypcji, zgodnie z aktualnymi zasadami rozliczeń.',
  },
  {
    question: 'Na jakich platformach mogę planować publikacje?',
    answer:
      'W jednym panelu zaplanujesz i opublikujesz treści na Facebooku, Instagramie i LinkedIn. TikTok i YouTube udostępnimy, gdy platformy zatwierdzą integrację.',
  },
  {
    question: 'Ile kont social mogę podłączyć?',
    answer:
      'Limity kont zależą od planu: Starter do 3, Pro do 10, Business do 25 kont social łącznie. W ramach limitu planu możesz podłączać wiele kont na jednej platformie (np. kilka Stron na Facebooku albo kont na Instagramie).',
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
  {
    question: 'Jak działa generowanie opisów przez AI?',
    answer:
      'AI przygotowuje propozycję opisu i hashtagów na podstawie Twojej notatki i zdjęcia (albo miniatury filmu), osobno dla każdej platformy. To zawsze tylko propozycja: edytujesz ją i sam klikasz „Opublikuj”. Miesięczny limit tekstów AI zależy od planu: Free 20, Starter 200, Pro 600, Business 1500.',
  },
];

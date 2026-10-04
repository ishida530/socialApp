import { isFreeBeta } from '@/lib/beta';

// Copy that depends on the free beta (lib/beta.ts, 2026-10-03). One place, so ending the beta
// (NEXT_PUBLIC_FREE_BETA=0) switches every CTA and promise on the landing at once.
const BETA = isFreeBeta();

export const TRIAL_CTA_LABEL = BETA ? 'Załóż darmowe konto' : 'Wypróbuj 7 dni za darmo';

export const OFFER_CHIP = BETA ? 'Teraz bezpłatnie: plan PRO bez karty' : '7 dni PRO za darmo, bez karty';

export const HERO_RISK_LINES: [string, string] = BETA
  ? [
      'Bez karty i bez opłat. Po potwierdzeniu e-maila masz pełny plan PRO za darmo.',
      'Płatne plany uruchomimy później - uprzedzimy e-mailem, nic nie zostanie pobrane automatycznie.',
    ]
  : [
      'Bez karty płatniczej. Plan PRO włącza się po potwierdzeniu e-maila i działa przez 7 dni.',
      'Potem konto samo przechodzi na darmowy plan Free - nic nie zapłacisz bez wybrania planu.',
    ];

export const FINAL_CTA_SUB = BETA
  ? 'Załóż konto, potwierdź e-mail i korzystaj z planu PRO za darmo. Płatne plany wprowadzimy później i uprzedzimy Cię e-mailem 14 dni wcześniej.'
  : 'Załóż konto, potwierdź e-mail i przez 7 dni korzystaj z planu PRO. Bez karty - potem zostajesz na Free albo wybierasz plan.';

export const USE_CASES_TRIAL_LINK = BETA ? 'załóż bezpłatne konto' : 'wypróbuj Postfly przez 7 dni bez karty';

export const IS_FREE_BETA = BETA;

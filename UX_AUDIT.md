# Audyt UX/UI panelu — EPIC 10 (2026-09-15)

## Status tego dokumentu

Oryginalny `UX_AUDIT.md` (audyt Fazy 1, z realnymi screenshotami Playwright na koncie
`audyt.ux@postfly.test`) został usunięty **2026-09-12** przy konsolidacji dokumentacji (commit
`146dc93`) — jego ustalenia miały zostać wchłonięte przez `docs/postfly-plan-projektu.md`, ale w
praktyce nie przetrwały w żadnej szczegółowej formie, tylko jako odniesienie w sekcji 0.1
("Analizuje istniejący `UX_AUDIT.md`..."), które od tamtej pory wskazuje na nieistniejący plik.

**Ten dokument to nowy audyt (TASK-10.1), nie rozszerzenie starego** — odtworzony przez statyczny
przegląd kodu (Read/Grep po `app/`, `components/`), **nie przez realne zrzuty ekranu w
przeglądarce jak oryginał**. W tym środowisku nie ma narzędzia do wizualnej automatyzacji
przeglądarki (żadnego stałego problemu appki — ograniczenie środowiska pracy tej sesji), więc
znaleziska poniżej są potwierdzone przez czytanie kodu źródłowego (struktura JSX, liczba
formularzy/przycisków na ekranie) i — tam gdzie to możliwe — przez realny test end-to-end
(Playwright, headless), a NIE przez wizualną inspekcję. Właściciel powinien przejrzeć zmiany
wprowadzone w tym epiku w przeglądarce.

## Metodologia

Zasada z sekcji 0.1 głównego planu: **"1 ekran = 1 decyzja"**. Za "decyzję" liczy się każdy
niezależny formularz/przełącznik/przycisk akcji widoczny na ekranie jednocześnie — np. "zmień
hasło" i "usuń konto" na tym samym ekranie to 2 osobne decyzje, nawet jeśli oba mieszczą się w
jednym `<section>`.

Przegląd objął wszystkie 18 stron pod `app/**/page.tsx` (dashboard, schedule, social-accounts,
media-library, analytics, billing, campaigns, growth, community, account, admin/jobs, i strony
bez powłoki jak login/register/privacy/terms) oraz komponenty, które renderują.

## Ranking gęstości decyzji (najgorsze → najlepsze)

| # | Ekran | Liczba decyzji | Layout | Status w tym epiku |
|---|---|---|---|---|
| 1 | `app/schedule/page.tsx` | ~16+ | gęsty stos zagnieżdżonych sekcji (1187 linii) | **Zidentyfikowane, NIE ruszone tę turę** — patrz uzasadnienie niżej |
| 2 | `components/CommunityPanel.tsx` (`/community`) | ~7 | prosty pionowy stos, `max-w-2xl` | **Naprawione częściowo** — formularze "Dodaj sprzedaż"/"Dodaj fana" schowane za przyciskiem `+ Dodaj...` |
| 3 | `components/Dashboard.tsx` (`/dashboard`) | ~6-7 | siatka statystyk (`grid-cols-1 sm:grid-cols-2 xl:grid-cols-4`) + stos kart poniżej | Zidentyfikowane, nie ruszone tę turę |
| 4 | `app/account/page.tsx` | 5 (Telegram, profil, autopilot, 2FA, usuń konto) | **było**: 5 zawsze rozwiniętych sekcji na raz | **Naprawione** — akordeon (`components/CollapsibleSection.tsx`), tylko 1 sekcja rozwinięta naraz, status widoczny przy zwiniętej |
| 5 | `components/GrowthPanel.tsx` (`/growth`) | ~4 | pionowy stos + mała siatka statystyk | Zidentyfikowane, nie ruszone tę turę |
| 6 | `components/CampaignsPanel.tsx` (`/campaigns`) | ~4 (ale start/end wzajemnie wykluczające się) | pionowy stos | Zidentyfikowane, akceptowalne (rodzina jednej decyzji) |
| 7 | `app/media-library/page.tsx` | ~4 | uploader + lista | Zidentyfikowane, nie ruszone tę turę |
| 8 | `app/billing/page.tsx` | ~4, ale to jedna rodzina decyzji (wybór planu) | siatka planów (`md:grid-cols-2 xl:grid-cols-4`) | Akceptowalne bez zmian |
| 9 | `app/social-accounts/page.tsx` | ~1 | jednolita siatka kont | Dobre, bez zmian |
| 10 | `app/analytics/page.tsx` | ~1 | zakres dat + statystyki read-only | Najlepsze, wzór do naśladowania |

Żaden ekran nie używał prawdziwego bento-grid (siatki o zróżnicowanych rozmiarach kart) — cały
panel to jednolite siatki statystyk albo pionowe stosy pełnej szerokości. `--radius`/tokeny kolorów
już istnieją i są spójne (`styles/theme.css`), gotowe pod taki layout w przyszłej turze.

## Zrobione w tej turze (TASK-10.2)

1. **Błąd kontrastu WCAG AA (realny, policzony, nie subiektywny)**: `bg-destructive
   text-destructive-foreground` (przyciski "Usuń konto trwale", "Wyłącz 2FA" na
   `app/account/page.tsx`) dawało **~2.9:1 w trybie ciemnym** i **~4.3:1 w trybie jasnym** —
   oba poniżej wymaganych 4.5:1 dla zwykłego tekstu. Naprawione przez przyciemnienie
   `--destructive` w `:root` (do `#cc3226`, naprawia też warianty `bg-destructive text-white` w
   `components/ui/button.tsx`/`badge.tsx` w trybie jasnym) i `--destructive-foreground` w `.dark`
   (do `#3d0f0a`, ciemny tekst na jasnoczerwonym tle — ten sam wzorzec co już istniejące
   `--primary-foreground`). Regresja pilnowana testem: `tests/unit/theme-contrast.test.ts` —
   parsuje PRAWDZIWY `styles/theme.css` (nie kopię wartości) i liczy realny kontrast WCAG dla 9
   par tekst/tło w obu motywach (18 asercji).
2. **`app/account/page.tsx`**: 5 płaskich, zawsze rozwiniętych sekcji → akordeon
   (`components/CollapsibleSection.tsx`, framer-motion, ten sam profil animacji co
   `components/AppShell.tsx`, `useReducedMotion` respektowane). Tylko jedna sekcja rozwinięta
   naraz, status widoczny na zwiniętym nagłówku (np. "Połączono ✓", "Włączony"/"Wyłączony") bez
   rozwijania. Sekcja 2FA rozwija się automatycznie po włączeniu, żeby pokazać kody zapasowe.
3. **`components/CommunityPanel.tsx`**: formularze "Dodaj sprzedaż" i "Dodaj fana" (zawsze
   widoczne 3-polowe formularze) schowane za przyciskiem `+ Dodaj...`, zwijają się z powrotem po
   udanym dodaniu. Historia sprzedaży/lista fanów zostaje zawsze widoczna (to dane, nie decyzja).

## Świadomie NIE zrobione w tej turze — i dlaczego

**`app/schedule/page.tsx` (najgorszy wynik, ~16+ decyzji) NIE został przebudowany.** To
największy, najbardziej złożony, najbardziej biznesowo-krytyczny ekran appki (główny flow
planowania/publikacji) — 1187 linii, sześć w dużej mierze niepowiązanych narzędzi zbitych w
jeden ekran (AI-planer kampanii, sugestie tygodniowego planu, auto-harmonogram AI, skrzynka
kampanii z filtrami, lista kart, panel szczegółów z edycją/usuwaniem/przełożeniem/akcjami per
post). Przebudowa tego ekranu "na ślepo" — bez możliwości wizualnej weryfikacji w tym środowisku,
w jednej turze, bez iteracji z właścicielem — byłoby dokładnie tym ryzykiem, przed którym ostrzega
własna zasada tego projektu (nie buduj pod hipotezę, nie buduj ryzykownie bez weryfikacji).
Pozostaje **priorytetem #1 dla kolejnej fazy EPIC 10**, idealnie z iteracyjnym realnym
przeglądem przez właściciela (patrz TASK-10.4 / feature flagi niżej).

`components/Dashboard.tsx`, `components/GrowthPanel.tsx`, `app/media-library/page.tsx` —
zidentyfikowane jako średni priorytet, nie ruszone w tej turze ze względu na zakres jednej sesji;
Dashboard i GrowthPanel to dobrzy kandydaci do bento-grid w kolejnej fazie (już mają siatki
statystyk jako punkt wyjścia).

## Feature flagi (TASK-6.5 / TASK-10.4)

`lib/feature-flags.ts` — prawdziwy, technicznie wymuszony mechanizm (`NEXT_PUBLIC_FEATURE_FLAGS`,
lista rozdzielana przecinkami), nie tylko dokumentacja. **Świadomie NIE użyty do bramkowania zmian
z tej tury** — zmiany w `/account` i `/community` są ściśle addytywne (te same pola, te same
możliwości, tylko schowane za jednym kliknięciem więcej) i appka ma dziś jednego właściciela w
trybie `personal` — nie ma realnej populacji do stopniowego wdrożenia. Wymuszanie sztucznego
przełącznika A/B tutaj byłoby dokładnie tym rodzajem zbędnej złożoności, przed którą ostrzega
własna dyscyplina inżynierska tego projektu. Mechanizm czeka na realne zastosowanie: przebudowę
`/schedule` (punkt wyżej) — tam skala ryzyka faktycznie uzasadnia stopniowe włączanie.

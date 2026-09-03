Pracujesz na repozytorium Next.js/Prisma "socialApp" (aplikacja do publikowania treści na YouTube/TikTok/Instagram/Facebook). Poniżej jest kompletna specyfikacja zmian do wdrożenia. Nie zgaduj wymagań spoza tego dokumentu — jeśli czegoś brakuje, zapytaj, zamiast improwizować.

Zanim napiszesz jakikolwiek kod: przygotuj pisemny plan (lista plików do zmiany/utworzenia + kolejność kroków + jakie migracje Prisma) i pokaż mi go do akceptacji. Dopiero po mojej akceptacji zaczynasz implementację.

## Kontekst i cel

Jestem początkującym raperem, wchodzę w social media. Chcę appki tylko dla siebie na start (Vercel Free/Hobby, jeden użytkownik), z możliwością przełączenia w przyszłości (gdy założę JDG) na tryb komercyjny dla wielu klientów — przez jedną zmienną środowiskową, bez przepisywania appki od nowa.

Znaleziony w obecnym kodzie krytyczny bug: treść posta (caption/hashtagi wpisane per platforma w kreatorze) **nie jest zapisywana ani używana przy realnej publikacji** — `PublishJob` nie ma pól na treść, a `publish-processor.ts` bierze `video.title`/`video.description` zamiast tego, co user napisał w kreatorze. To ma być naprawione jako fundament wszystkich pozostałych zmian.

## Zakres pracy (w tej kolejności)

### 1. Model danych (Prisma) — fundament
- Dodaj do `PublishJob` (albo zaprojektuj nowy model zastępujący `PublishJob` + `Draft`) pola: `caption`, `hashtags` (String[]), `title` (opcjonalnie), oraz `status` obejmujący też `DRAFT` (żeby scalić dzisiejszy, martwy model `Draft` z realną kolejką publikacji — `Draft` dziś nie ma żadnego endpointu, który zamienia go w publikację).
- Dodaj pole grupujące (`postGroupId`/`submissionId`) łączące rekordy `PublishJob` powstałe z jednej "wysyłki" kreatora (dziś każda platforma to osobny, niepowiązany rekord — potrzebne do wspólnego ekranu statusu "1 post → 4 platformy").
- Napisz i przetestuj migrację Prisma zgodną z istniejącą historią migracji w `prisma/migrations/`.
- Zaktualizuj `app/api/publish-jobs/enqueue/route.ts`, żeby faktycznie zapisywał caption/hashtagi/tytuł per platforma (dziś przyjmuje je w body, ale je gubi).
- Zaktualizuj `lib/server/publish-processor.ts`, żeby przy publikacji używał zapisanego per-platformowego caption/hashtagów zamiast `video.title`/`video.description`.
- Usuń nadużycie pola `errorMessage` do przechowywania ustawień TikToka (`buildTikTokSettingsMarker`) — przenieś te ustawienia (privacyLevel, allowComment/Duet/Stitch) do właściwych, jawnych kolumn.

### 2. APP_MODE — przełącznik personal/commercial
- Utwórz `lib/server/app-mode.ts` z `resolveAppMode(): 'personal' | 'commercial'`, czytającą `process.env.APP_MODE`, domyślnie `'personal'` (bezpieczny default).
- Dodaj publiczny odpowiednik dla frontu (`NEXT_PUBLIC_APP_MODE`) używany w komponentach UI.
- `app/api/auth/register/route.ts`: w trybie `personal`, jeśli w bazie istnieje już ≥1 użytkownik, zwróć błąd (rejestracja zamknięta).
- `lib/server/subscription.ts`: `assertUsageAllowed`, `assertScheduleWindowAllowed`, `getSubscriptionSnapshot` — w trybie `personal` mają zwracać "bez limitów" (traktować jak najwyższy plan) zamiast liczyć realne zużycie. W trybie `commercial` zachowanie ma zostać identyczne jak dziś.
- Ukryj w UI (warunkowo po `NEXT_PUBLIC_APP_MODE`) całą warstwę billingową: stronę `/billing`, upsell w kreatorze, liczniki "X/Y uruchomień AI".
- Dodaj `APP_MODE` i `NEXT_PUBLIC_APP_MODE` do `.env.example` z komentarzem wyjaśniającym obie wartości.
- Napraw bug: `app/api/orchestrate-content/route.ts` nie powinien zużywać limitu `publish_jobs` przy `mode: 'ai-autopilot'` / `publishMode: 'draft'` (samo generowanie opisów AI to nie jest publikacja).

### 3. Nowy flow kreatora posta (opisany szczegółowo w załączonym dokumencie `flow-dodawania-posta-rap.md` — trzymaj się go krok po kroku, sekcje "Krok 0" do "Po publikacji")
- Rozbij `components/PostComposer.tsx` (dziś 1440 linii) na mniejsze komponenty: `MediaStep`, `ContentPreviewStep` (+ `PlatformCaptionTab`), `TikTokSettingsPanel`, `ScheduleStep`, i hook/reducer `usePostComposerState` jako jedyne źródło stanu.
- Zaimplementuj 5 kroków z dokumentu: Krok 0 (wymagane połączone konto, blokuje wejście do kreatora), Krok 1 (upload wideo LUB zdjęcia + typ treści + tytuł utworu), Krok 2 (automatyczna adaptacja AI per platforma w tle, bez osobnego przycisku "Generuj"), Krok 3 (przegląd/edycja per platforma w zakładkach, z sekcją TikTok tylko gdy TikTok wybrany), Krok 4 (platformy + jedna proponowana godzina + uczciwa informacja, że godzina jest orientacyjna — patrz punkt 5 niżej).
- Autozapis "niedokończonego posta" zamiast osobnej listy szkiców do ręcznego odtwarzania — wykorzystaj scalony model z punktu 1 (status `DRAFT`).
- Usuń martwy toggle "Automatyczne kadrowanie 9:16" (nic dziś nie robi) — albo podłącz go realnie do przetwarzania wideo, albo usuń completnie z UI. Zapytaj mnie, którą opcję wybrać, zanim zdecydujesz.
- Ekran "Po publikacji": miniatura + status per platforma (kolor: opublikowano/zaplanowane/błąd) pogrupowane przez `postGroupId` z punktu 1, z jedną akcją naprawczą przy błędzie (reconnect / retry, korzystając z istniejących endpointów `/api/social-accounts/[id]/reconnect` i `/api/publish-jobs/[id]/retry`).

### 4. Uczciwość w UI wobec ograniczeń Vercel Hobby
- Cron `/api/cron/publish` na planie Hobby leci maks. raz na dobę (patrz `vercel.json`) — pole "godzina publikacji" w Kroku 4 ma pokazywać wybraną godzinę jako orientacyjną (np. dopisek "publikacja tego dnia, dokładna godzina zależy od crona"), a nie obiecywać precyzję, której backend nie dowiezie.

### 5. Testy (framework nie istnieje w projekcie — trzeba dodać od zera)
- Dodaj Vitest (albo inny lekki framework, uzasadnij wybór) do `package.json` wraz z minimalną konfiguracją.
- Napisz testy integracyjne pokrywające:
  1. `enqueue publish job` → caption/hashtagi faktycznie trafiają do rekordu w bazie (regresja na główny znaleziony bug).
  2. Rejestracja: zablokowana w `APP_MODE=personal` po 1. koncie, działająca w `APP_MODE=commercial`.
  3. Limity planu: nieaktywne w `personal`, wymuszane w `commercial`.
  4. Wymóg zgody TikTok — identyczny w obu trybach.
- Skrypt npm (`test`) uruchamiający cały zestaw dwukrotnie: raz z `APP_MODE=personal`, raz z `APP_MODE=commercial` (może to być jeden skrypt ustawiający zmienną i wołający runner dwa razy).

## Zasady pracy
- Rób to iteracyjnie: najpierw punkt 1 (model danych + naprawa buga z ginącą treścią) jako osobny, kompletny i przetestowany krok, zanim przejdziesz dalej. Po każdym punkcie uruchom `npm run build` i pokaż mi wynik przed przejściem do kolejnego.
- Nie usuwaj istniejącej logiki billingowej/Stripe — ona ma zostać, tylko ukryta/nieaktywna w trybie `personal`. Ma wrócić do działania przez samą zmianę `APP_MODE`, bez dopisywania kodu na nowo.
- Trzymaj się nazewnictwa i konwencji już obecnych w repo (Prisma, struktura `app/api/*/route.ts`, `lib/server/*`).
- Jeśli natrafisz na rozbieżność między tym promptem a załączonym dokumentem `flow-dodawania-posta-rap.md` — dokument wygrywa, ale zgłoś mi tę rozbieżność.
- Na koniec każdego większego kroku podsumuj krótko: co zmieniłeś, jakie pliki, czy testy/build przechodzą, i co zostało świadomie odłożone.

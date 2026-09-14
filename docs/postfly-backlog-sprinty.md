# Postfly — backlog sprintowy dla Claude Code

> Ten plik to lista wykonawcza. Szczegółowe specyfikacje (jak dokładnie ma działać dany agent, jaka obsługa błędów) są w `postfly-plan-projektu.md` — tu są odwołania numerami sekcji, nie powtórki. Każde zadanie przechodzi przez cztery role z sekcji 0 głównego planu: **PO → Architekt → Inżynier → QA**, w tej kolejności, zanim checkbox zostanie odhaczony. Priorytet: P0 = blokujące, musi być zrobione zanim ruszysz dalej; P1 = ważne w tym epiku; P2 = może poczekać. Rozmiar: S/M/L to orientacyjna złożoność, nie sztywny czas.

---

## EPIC 1 — Stabilizacja fundamentu i higiena techniczna
*Odpowiada Fazie A głównego planu + nowe luki techniczne. Nic z EPIC 2+ nie zaczyna się przed zamknięciem P0 z tego epiku.*

### Sprint 1.1 — Bezpieczeństwo i odzyskiwalność
- [x] **TASK-1.1.0** [P0/S] Utwórz `CURRENT_TASK.md` i `BUGS.md` w repo wg wzorców z `postfly-plan-wykonania.md` sekcje 3.6-3.7, zanim zaczniesz jakiekolwiek inne zadanie. DoD: oba pliki istnieją, `CURRENT_TASK.md` aktualizowany od pierwszego kroku TASK-1.1.1. **Potwierdzone 2026-09-13** (audyt przy starcie Etapu 2): oba pliki istnieją i są aktywnie aktualizowane.
- [x] **TASK-1.1.1** [P0/M] Środowisko testowe bez dostępu do prawdziwych tokenów OAuth. DoD: osobna baza/konfiguracja, próba użycia prawdziwego tokenu w env testowym kończy się błędem, nie sukcesem. (główny plan: sekcja 3) **Potwierdzone 2026-09-13**: `lib/server/test-network-guard.ts` podmienia `fetch`/`http`/`https`, żeby rzucać błąd przy próbie realnego żądania do hostów OAuth (Google/TikTok/Facebook/Telegram); `lib/server/prod-db-guard.ts` rzuca błąd przy próbie połączenia z nie-lokalną bazą w buildzie lokalnym. Oba pokryte testami (`tests/api/test-env-network-guard.test.ts`, `tests/api/prod-db-guard.test.ts`).
- [x] **TASK-1.1.2** [P0/M] Proces backupu bazy i materiałów, przetestowany realnym odtworzeniem. DoD: symulacja utraty danych → odtworzenie z backupu w ustalonym czasie, udokumentowane. **Potwierdzone 2026-09-13**: `scripts/backup-database.mjs`/`restore-database.mjs` + `.github/workflows/backup-database.yml`, realny dryl odtworzenia z 2026-09-12 (zweryfikowane liczbą wierszy) i realne uruchomienie workflow na produkcji — opisane w `docs/backup-i-odzyskiwanie.md`.
- [ ] **TASK-1.1.3** [P1/S] Naprawa `npm audit` (8 podatności moderate). DoD: `npm audit --omit=dev` bez podatności moderate+. **Zbadane 2026-09-13, ryzyko świadomie zaakceptowane, DoD formalnie NIE spełnione:** 17 podatności (1 critical, 11 high, 5 moderate), wszystkie w jednym łańcuchu `@prisma/client@7.4.2 → prisma@7.4.2 → @prisma/dev@0.20.0 → hono/@hono/node-server/@mrleebo/prisma-ast→chevrotain→lodash` (`npm ls hono/chevrotain/lodash --omit=dev` potwierdza dokładnie tę jedną ścieżkę). `@prisma/dev` to wbudowany serwer `prisma studio` — uruchamiany WYŁĄCZNIE ręczną komendą `npx prisma studio`, nigdy przez działającą appkę. Potwierdzone: zero importów `hono`/`chevrotain`/`lodash` w `app/`/`lib/`/`components/`. Realny wektor ataku na produkcyjny ruch HTTP: brak — kod appki nigdy nie uruchamia tego serwera. Jedyny fix to major bump Prisma do `8.0.0-rc.14` (release candidate, nie stabilny) — zbyt ryzykowne dla ORM-a dotykającego każdego zapytania do bazy. Decyzja: poczekać na stabilny Prisma 8, monitorować przy okazji następnego bumpa.

### Sprint 1.2 — Poprawność fundamentu
- [x] **TASK-1.2.1** [P0/M] Potwierdzenie/naprawa bugu ginącej treści (caption/hashtagi gubione przy publikacji). DoD: test regresyjny pokrywający ten dokładny scenariusz, przechodzi w CI. **Potwierdzone 2026-09-13**: `tests/api/drafts-content-persistence.test.ts`, `tests/api/publish-processor-content.test.ts`.
- [x] **TASK-1.2.2** [P1/S] Udokumentowanie statusu audytu API TikTok/Meta. DoD: plik statusu z datą sprawdzenia i konkretnym stanem (przeszedł/w toku/nie złożono). **Domknięte 2026-09-13**: `docs/status-audytow-api.md` — TikTok: złożony, czeka na decyzję (2-4 tyg.). Meta: zatwierdzony (Advanced Access).

### Sprint 1.3 — Pipeline i higiena ciągła
- [x] **TASK-1.3.1** [P0/S] CI: zweryfikuj i domknij istniejący workflow (`.github/workflows/test.yml` już uruchamia build+testy+e2e — sprawdź czy jest aktualny, nie buduj od zera). DoD: push do brancha uruchamia pipeline, czerwony status blokuje merge (wymuszone regułą ochrony brancha na GitHubie, nie tylko istnieniem workflow). **Domknięte 2026-09-13**: workflow już uruchamiał build+testy+e2e; brakująca reguła ochrony brancha `main` włączona (`gh api .../branches/main/protection` — wymagany zielony status check `test`, zakaz force-push/usunięcia brancha, `enforce_admins: false` żeby właściciel nie był sam siebie blokował w nagłym przypadku).
- [ ] **TASK-1.3.2** [P1/M] Środowisko staging odseparowane od produkcji. DoD: osobny deployment, osobna baza, dostępny pod subdomeną testową. **Decyzja 2026-09-13 (właściciel produktu):** pominięte świadomie na razie — realny koszt infrastruktury (druga baza Postgres, ew. drugi plan Vercel) nieuzasadniony przy jednoosobowym projekcie; lokalny dev + CI dają dziś wystarczającą siatkę bezpieczeństwa. Wrócić przy pierwszym współpracowniku lub przy pierwszym incydencie, którego staging by zapobiegł.
- [x] **TASK-1.3.3** [P2/S] Automatyzacja aktualizacji zależności (Dependabot/Renovate). DoD: automatyczne PR-y na aktualizacje, uruchamiane przez CI z TASK-1.3.1. **Domknięte 2026-09-13**: `.github/dependabot.yml` (npm + github-actions, tygodniowo, grupowanie minor/patch) — każdy PR przechodzi przez ten sam wymagany check `test` (TASK-1.3.1), nigdy auto-merge.
- [x] **TASK-1.3.4** [P2/S] Spójne, strukturalne logowanie z ID śledzącym zadanie przez cały łańcuch agentów. DoD: jedno zdarzenie da się prześledzić od wejścia do wyjścia w logach po jednym identyfikatorze. **Domknięte 2026-09-13**: `lib/server/request-context.ts` (`AsyncLocalStorage`), wpięte w `emitLog` + trzy punkty wejścia (webhook Telegrama, cron, QStash trigger). Dowód end-to-end: `tests/api/telegram-request-id-tracing.test.ts`.
- [x] **TASK-1.3.5** [P0/S] Konfiguracja Playwright: lokalnie zawsze `headed` (widoczna przeglądarka), w CI zostaje `headless`. DoD: `npm run test:e2e` lokalnie otwiera realne okno przeglądarki; workflow CI dalej przechodzi bez zmian w `headless`. Failujący e2e blokuje przejście do kolejnego zadania (sekcja 3.2 protokołu wykonania). **Domknięte 2026-09-13**: `playwright.config.ts` → `use.headless: !!process.env.CI` (GitHub Actions ustawia `CI=true` automatycznie, więc CI zostaje headless bez żadnej zmiany w workflow; lokalnie `CI` nie jest ustawione, więc domyślnie `headed`).

### Sprint 1.4 — Decyzja architektoniczna
- [x] **TASK-1.4.1** [P0/S] Architekt: decyzja o kolejce publikacji (BullMQ vs alternatywy) — patrz sekcja 8.1 głównego planu. DoD: dokument decyzji w repo, nie tylko ustna decyzja. **Zamknięte 2026-09-13**: QStash, nie BullMQ — BullMQ wymaga stałego procesu-workera, którego Vercel Functions (Hobby i Pro) nie obsługują. Pełne uzasadnienie: `postfly-plan-projektu.md`, sekcja "Etap 2 — start", "Decyzja architektoniczna: QStash zamiast BullMQ".

### Sprint 1.5 — Bezpieczeństwo agentów (sekcja 9 głównego planu)
- [x] **TASK-1.5.1** [P0/M] Weryfikacja podpisów wszystkich webhooków (Telegram, Stripe, TikTok). DoD: żądanie z nieprawidłowym/brakującym podpisem odrzucone, test regresyjny to potwierdza. **Domknięte 2026-09-13**: Telegram już miał weryfikację + test (`tests/api/telegram-webhook.test.ts`). TikTok już miał realną weryfikację HMAC w kodzie (401 na zły/brakujący podpis) — dodany brakujący test regresyjny (`tests/api/tiktok-webhook.test.ts`). Stripe: weryfikacja przez `stripe.webhooks.constructEvent` już istniała, ale błąd wpadał w ogólny `serverError` (500) zamiast jawnego odrzucenia — dodana jawna obsługa `StripeSignatureVerificationError` → 401 (`unauthorized()`), plus test (`tests/api/stripe-webhook.test.ts`).
- [x] **TASK-1.5.2** [P0/M] Czyszczenie sekretów/PII z `error_log` i Sentry przed zapisem. DoD: test symulujący błąd z tokenem w danych wejściowych — token nie pojawia się w zapisanym logu. **Domknięte 2026-09-13**: `lib/redact.ts` (`redactSensitiveValue` — czyszczenie po nazwie klucza I po kształcie wartości: JWT, `Bearer ...`, sekrety Stripe, długie base64/hex), wpięte w `lib/server/observability.ts` (`emitLog` — jedyny realny "error_log" w tej appce, brak osobnej tabeli). `lib/redact-sentry.ts` (`redactSentryEvent`) wpięte jako `beforeSend` we wszystkich trzech configach Sentry (server/edge/client). Testy: `tests/unit/redact.test.ts`, `tests/unit/redact-sentry.test.ts`, `tests/unit/observability-redaction.test.ts` (dokładnie DoD: token w metadata/błędzie nie pojawia się w zapisanym logu).
- [ ] **TASK-1.5.3** [P1/M] Dziennik akcji agentów (audit trail) — osobna tabela/log od `error_log`. DoD: każda udana akcja agenta zapisana z kim/co/kiedy/wynik.
- [ ] **TASK-1.5.4** [P1/S] Mapa uprawnień per agent (sekcja 9.2) — dokument + wymuszenie techniczne, żadnego wspólnego klucza serwisowego. DoD: agent tylko-do-odczytu (np. Trendy) fizycznie nie może wywołać zapisu/publikacji, potwierdzone testem.

---

## EPIC 2 — Skalowalna kolejka publikacji
*Odpowiada Fazie B. Fundament pod Telegram i realny wzrost — bez tego EPIC 3 dziedziczy limit crona raz dziennie.*

### Sprint 2.1 — Kolejka
- [x] ~~**TASK-2.1.1** [P0/L] Wdrożenie BullMQ na istniejącym Redis.~~ **Zastąpione QStash** (TASK-1.4.1, 2026-09-13) — DoD osiągnięte inną technologią: zadanie genuinie zaplanowane (`publishNow: false`) trafia do QStash natychmiast po zatwierdzeniu i wywołuje endpoint dokładnie o zaplanowanej godzinie, nie czeka na cron. `lib/server/qstash.ts`.
- [x] ~~**TASK-2.1.2** [P0/M] Wydzielenie workera publikującego jako osobnego procesu.~~ **Nie dotyczy przy QStash** — nie ma stałego procesu do wydzielenia, QStash woła zwykły, bezstanowy endpoint Vercel Function.

### Sprint 2.2 — Migracja i odporność
- [x] **TASK-2.2.1** [P0/M] Migracja z cron-only na kolejkę, cron zostaje jako fallback/health-check (np. co godzinę). DoD: wyłączenie crona nie zatrzymuje publikacji, tylko traci warstwę bezpieczeństwa. Zrealizowane przez QStash + istniejący dzienny cron Vercela jako fallback (bez zmian w `vercel.json` — cron już tam był, teraz jest drugą linią obrony, nie jedyną).
- [x] **TASK-2.2.2** [P1/M] Podstawowy test obciążeniowy kolejki. DoD: symulacja N równoczesnych zadań publikacji, brak utraty/duplikacji zadań. `tests/api/publish-processor-concurrency.test.ts` — test ujawnił realny bug w `claimDuePublishJobs` (JOIN do Video/User w zapytaniu z `FOR UPDATE SKIP LOCKED ORDER BY LIMIT` powodował, że równoległe wywołania wzajemnie się "głodziły"; ~40-50% prób traciło większość batcha na daną rundę). Naprawione przez zamianę JOIN na predykat `NOT EXISTS` — patrz Log ról.
- [x] **TASK-2.2.3** [P1/S] Idempotency key per zadanie w całym łańcuchu (nie tylko `postGroupId`). DoD: ponowne przetworzenie tego samego zadania nie publikuje dwa razy. Potwierdzone testem: `processPublishJobImmediately` (wołane przez QStash/ręczny trigger/Telegram `/approve`) używa atomowego warunkowego `updateMany` jako bramki - dwa równoległe wywołania dla tego samego `jobId` publikują dokładnie raz, drugie dostaje `'skipped'`.

---

## EPIC 3 — Telegram jako warstwa kontroli
*Odpowiada Fazie C. Zależy od EPIC 2.*

### Sprint 3.1 — Powiązanie i webhook
- [x] **TASK-3.1.1** [P0/M] Mechanizm łączenia konta Telegram z kontem użytkownika (kod jednorazowy + `/start`). DoD: powiązanie `telegramChatId ↔ userId` zapisane, wiadomość bez powiązania odrzucona. (sekcja 4.1) **Potwierdzone 2026-09-13** (audyt przy Etapie 2): `createTelegramLinkCode`/`consumeTelegramLinkCode` w `lib/server/telegram.ts`, pokryte testami od dawna.
- [x] **TASK-3.1.2** [P0/M] Webhook Telegram podłączony do kolejki z EPIC 2. DoD: wiadomość → zadanie w kolejce, nie bezpośrednie wywołanie synchroniczne. **Decyzja właściciela produktu 2026-09-13 (z trzech opisanych wariantów): "zostaw jak jest"** — DoD dosłowne (przeróbka na kolejkę) świadomie NIE zrealizowane, zamknięte inną drogą: `POST` w `app/api/telegram/webhook/route.ts` nadal przetwarza `/approve`/`/retry`/przycisk Publikuj synchronicznie, ale dodano tani margines bezpieczeństwa (`maxDuration = 60`, ten sam co `app/api/videos/upload/route.ts`) na tym route i na `app/api/publish-jobs/[id]/trigger`, `app/api/publish-jobs/enqueue` (ten sam ryzykowny wzorzec, wywoływany też przez panel web). Uzasadnienie decyzji: pełna przeróbka na kolejkę kosztowałaby dzisiejszy natychmiastowy wynik w czacie ("✅ opublikowano, oto link") bez dowodu na realny problem (nigdy nie zaobserwowano timeoutu w produkcji).

### Sprint 3.2 — Komendy i UX
- [x] **TASK-3.2.1** [P0/L] Wszystkie komendy z sekcji 5 głównego planu (`/status /pause /resume /approve /reject /retry /cancel /logs /revenue`). DoD: każda przetestowana ręcznie z realnym efektem w systemie. **Zaimplementowane i pokryte testami automatycznymi 2026-09-13** (`/retry /cancel /logs /revenue` — reszta była już gotowa wcześniej): `/cancel` jako alias `/reject` (`cancelPublishJob` już obsługiwał dowolny nieterminalny status), `/retry` nowa funkcja `retryPublishJob` (FAILED/CANCELED → PENDING + natychmiastowa próba publikacji), `/logs` ostatnie zakończone zadania, `/revenue` uczciwa informacja że moduł Monetyzacji (EPIC 5) nie istnieje — świadomie NIE pokazuje danych o subskrypcji Postfly pod mylącą nazwą. `tests/api/telegram-commands.test.ts` (+7 testów). **DoD dosłownie ("ręcznie") jeszcze niespełnione** — czeka na realny test przez prawdziwego bota.
- [x] **TASK-3.2.2** [P1/M] Grupowanie nie-pilnych powiadomień w poranny digest (projekt: Zespół UX/UI, sekcja 0.1). DoD: powiadomienia statusowe zbiorcze, tylko akcje/błędy pojedynczo. **Domknięte 2026-09-13**: audyt pokazał, że appka wcześniej NIE MIAŁA żadnych proaktywnych powiadomień Telegram dla wyników publikacji z crona/QStash (użytkownik dowiadywał się tylko ręcznie przez `/status`/`/logs`) — więc to zadanie zbudowało cały mechanizm, nie tylko dodało grupowanie do istniejącego. `PublishJob.notifiedAt` (nowe pole + migracja), `lib/server/telegram-notifications.ts`: `notifyJobFailedImmediately` (błąd terminalny → natychmiastowa wiadomość, nigdy zbiorczo — nowy cron `app/api/cron/telegram-digest`, `vercel.json` 7:00 UTC), `sendMorningDigest` (sukcesy zbiorczo, jedna wiadomość na użytkownika niezależnie od liczby postów). Odpowiedzi na komendy (`/approve` itp.) już były pojedyncze z natury (bezpośrednia odpowiedź w tym samym czacie) — nie wymagały zmian.
- [x] **TASK-3.2.3** [P1/M] Wykrywanie długiej nieaktywności + agent wsparcia (sekcja 4.1, granica: brak trybu terapeutycznego). DoD: po ustalonym czasie ciszy system przechodzi na rzadkie pytanie zamiast codziennych próśb. **Domknięte 2026-09-13**: treść/próg uzgodnione wprost z właścicielem produktu (nie zgadywane) — 10 dni bez żadnego `PublishJob`, jedno neutralne pytanie o treść/harmonogram, zero odniesień do samopoczucia, nie częściej niż raz na 10 dni (`User.lastInactivityNudgeSentAt`). `sendInactivityNudges` w `lib/server/telegram-notifications.ts`, wpięte w istniejący cron `app/api/cron/telegram-digest` (nie osobny slot crona — limit na darmowym planie Vercela).
- [ ] **TASK-3.2.4** [P0/M] Hardening promptu Agenta społeczności przeciw prompt injection (sekcja 9.1) — treść komentarza/DM zawsze jako dane, nigdy instrukcja. DoD: test z komentarzem zawierającym próbę wstrzyknięcia polecenia, agent nie wykonuje niczego poza zwykłą analizą treści. **Nie dotyczy jeszcze**: Agent społeczności (EPIC 5/8) nie istnieje w kodzie — nie ma czego hardenować. Odłożone do czasu zbudowania tego agenta.

### Sprint 3.3 — Testy wielo-użytkownikowe
- [x] **TASK-3.3.1** [P0/M] Pełny cykl: upload → potwierdzenie → publikacja wyłącznie przez Telegram. DoD: zero kroków przez web UI w tym teście. **Zamknięte 2026-09-13** (zobacz "Zamknięcie TASK-3.3.1" w `postfly-plan-projektu.md`) — realny, czysty przebieg wyłącznie przez Telegram, potwierdzone przez użytkownika.
- [x] **TASK-3.3.2** [P0/M] Test izolacji: dwa konta Telegram nigdy nie widzą swoich danych. DoD: próba dostępu do cudzego `telegramChatId` zwraca odmowę, nie dane. **Domknięte 2026-09-13**: `tests/api/telegram-multi-user-isolation.test.ts` — `/status`/`/logs` nigdy nie przeciekają danych drugiego użytkownika, `/reject`/`/cancel`/`/retry` na cudzym zadaniu zwracają jawną odmowę z zerowym efektem, callback_query (przycisk) na cudzym `postGroupId` też odrzucony.

---

## EPIC 4 — Pełna pętla rozumowania agenta planującego
*Odpowiada Fazie D.*

### Sprint 4.1
- [x] **TASK-4.1.1** [P1/L] Rozbudowa `smart-autopilot` do pętli obserwuj→planuj→działaj→sprawdź→popraw (sekcja 4.2). DoD: walidacja schematu JSON, retry z poprawionym promptem (maks. 2), fallback na plan domyślny. **Domknięte 2026-09-13**: (1) "obserwuj/sprawdź" — `lib/server/smart-autopilot/performance-data.ts` zasila realnymi danymi z `PostMetric` pole `performanceData`, wcześniej zawsze puste na wewnętrznej ścieżce; (2) walidacja+retry — `classifyWithValidation` (analysis.ts) całościowo waliduje odpowiedź LLM (enumy + zakres confidence), retry z `previousAttemptError` w promptcie (maks. 2 próby), fallback na czystą heurystykę gdy obie próby zawiodą.
- [x] **TASK-4.1.2** [P1/S] Test: symulacja złego JSON-a z LLM. DoD: system nie zapisuje nieprawidłowego planu, generuje alert. **Domknięte 2026-09-13**: `tests/unit/smart-autopilot-analysis-validation.test.ts` — niepoprawny enum/confidence poza zakresem nigdy nie trafia do wyniku (zawsze heurystyka), `logError('smart-autopilot','llm-classification-failed-after-retries',...)` jako alert po wyczerpaniu prób.
- [x] **TASK-4.1.3** [P1/S] Test: symulacja braku danych historycznych. DoD: fallback na plan domyślny, jawnie oznaczony jako "nieoparty na danych". **Domknięte 2026-09-13**: `tests/unit/smart-autopilot-schedule.test.ts` + `tests/api/orchestrate-content-performance-data.test.ts` — brak/pusty `performanceData` → `reason: "Baseline persona slot (brak danych historycznych)."` jawnie, obecność realnych danych → inny, wyraźnie oznaczony powód ("korekta historyczna").

---

## EPIC 5 — Monetyzacja
*Odpowiada Fazie E. Największy epik — dobrze zamknij EPIC 1-4 zanim zaczniesz.*

**Decyzja PO 2026-09-13 o zakresie całego epika** (właściciel produktu poprosił o "kompletny EPIC 5" i wyjechał, dając pełny mandat decyzyjny): zbudowane w tej sesji to, co da się odpowiedzialnie zrobić bez zakładania nieistniejących zewnętrznych integracji (własne konto procesora płatności twórcy, prawdziwe dane o prawach autorskich, nowe zgody OAuth na odczyt komentarzy) — pełne uzasadnienie w logu ról "EPIC 5 — fundament + agenci możliwi bez zewnętrznych integracji" poniżej. Zasada zastosowana: automatyzacja wymagająca założenia/skonfigurowania czegoś w imieniu właściciela (konto płatności, zgoda na szersze uprawnienia OAuth) to decyzja biznesowa, nie inżynierska — ta sama kategoria, którą projekt już wcześniej ustalił dla "wydawania Twoich pieniędzy" (TASK-1.3.2).

### Sprint 5.1 — Fundament danych
- [x] **TASK-5.1.1** [P0/M] Nowe modele Prisma: `Fan`, `Sale`, `FanSubscription` (uwaga: nie `Subscription` — kolizja z billingiem SaaS), `RoyaltyRegistration`, `SyncPitch`. DoD: migracja przechodzi, brak kolizji nazw. **Domknięte 2026-09-13**: migracja `20260913205044_epic5_monetization_foundation`, wszystkie 5 modeli.

### Sprint 5.2 — Podstawowi agenci
- [x] **TASK-5.2.1** [P1/M] Agent fanów (sekcja 4.3). **Domknięte 2026-09-13**: `/fan <email> [imię]`, `/fans` na Telegramie — kontakty niezależne od platform, dokładnie jak w sekcji 4.3.
- [ ] **TASK-5.2.2** [P1/M] Agent sprzedaży + webhook płatności (sekcja 4.3). **Częściowo, świadomie 2026-09-13**: `/sale <kwota> <produkt>` — ręczna rejestracja sprzedaży przez twórcę, DZIAŁA i jest realnie użyteczna od razu. Realny automatyczny checkout + webhook potwierdzenia płatności NIE zbudowany — wymaga własnego konta procesora płatności (np. Stripe Connect) należącego do twórcy, którego appka nie ma i nie może sama założyć.

### Sprint 5.3 — Zaawansowani agenci
- [ ] **TASK-5.3.1** [P1/M] Agent superfanów. **Nie zbudowany 2026-09-13**: model `FanSubscription` istnieje (gotowy fundament), logika rekurencyjnych subskrypcji wymaga tego samego brakującego elementu co TASK-5.2.2 (konto procesora płatności) plus realnej treści ekskluzywnej do zaoferowania.
- [ ] **TASK-5.3.2** [P1/M] Agent tantiem. **Nie zbudowany 2026-09-13**: model `RoyaltyRegistration` istnieje, ale rejestracja praw/splitów wymaga prawdziwych danych o prawach autorskich od twórcy — appka nie może ich zgadywać ani wymyślać.
- [ ] **TASK-5.3.3** [P2/M] Agent sync (z twardym blokiem: bez potwierdzonych 100% praw nie pitchuje). **Nie zbudowany 2026-09-13**: model `SyncPitch` (z polem `rightsConfirmed`, twardy blok już zapisany w schemacie) istnieje, logika pitchowania wymaga realnego procesu potwierdzenia praw i kontaktów branżowych.

### Sprint 5.4 — Budowanie majątku
- [ ] **TASK-5.4.1** [P1/M] Agent księgowo-podatkowy — tylko agregacja danych, zero porad podatkowych. **Nie zbudowany 2026-09-13**: podstawowa agregacja przychodu już istnieje w `/revenue` (ten sam kod co TASK-5.4.4); kategoryzacja pod VAT/PIT wymaga znajomości jurysdykcji/formy działalności twórcy — appka nie może tego zgadnąć.
- [ ] **TASK-5.4.2** [P2/M] Agent ochrony treści (wykrywanie reuploadów, zgłoszenia do zatwierdzenia). **Nie zbudowany 2026-09-13**: wymaga zewnętrznego API do wyszukiwania wideo/obrazów (reverse search), którego appka nie integruje.
- [x] **TASK-5.4.3** [P2/M] Agent sponsoringu/brand deals. **Domknięte 2026-09-13** (zakres: sygnał, nie pełna wycena): `checkSponsorshipGrowth`/`sendSponsorshipSignals` — rzadki sygnał na Telegramie gdy zasięg (dane `PostMetric` z EPIC 4) realnie rośnie (≥50% wzrost, próg szumu 1000 wyświetleń), wpięty w istniejący dzienny cron. Pomoc w przygotowaniu wyceny na bazie realnych stawek rynkowych NIE zbudowana — appka nie ma takich danych.
- [~] **TASK-5.4.4** [P1/M] Dashboard finansowy rozszerzony o realny obraz majątku (nie tylko sumę przychodu). **Częściowo 2026-09-13**: `/revenue` na Telegramie zwraca teraz realne dane (fani, sprzedaże w tym miesiącu/łącznie) zamiast "nie istnieje jeszcze". Pełny "obraz majątku" (reinwestycje, rozdział środków) i osobna strona web NIE zbudowane — poza zakresem tej sesji, naturalne rozszerzenie na później.
- [ ] **TASK-5.4.5** [P0/S] Bramka potwierdzenia rozszerzona na wszystkie wysyłki Monetyzacji, w tym agenta społeczności (sekcja 4.4). **Nie dotyczy jeszcze 2026-09-13**: żaden zbudowany w tej sesji mechanizm Monetyzacji nie wysyła niczego autonomicznie (agent fanów/sprzedaży to ręczne komendy twórcy, agent sponsoringu tylko informuje) — nie ma jeszcze czego bramkować. Ten sam wzorzec odłożenia co TASK-3.2.4 ("poczekaj aż powstanie pierwszy agent [wysyłający autonomicznie]").
- [x] **TASK-5.4.6** [P1/M] ~~Agent społeczności — odpowiedzi na komentarze/DM z pełną bramką (sekcja 4.4).~~ **Zastąpiony pełnym projektem 2026-09-14** — patrz EPIC 11, Sprint 11.2 (TASK-11.2.1 do 11.2.8). Ten wpis zamknięty jako "przeniesiony", nie "zrobiony" — sam Agent społeczności nadal nie istnieje, ale ma teraz pełny projekt zamiast placeholdera z jednym zdaniem uzasadnienia.
- [ ] **TASK-5.4.7** [P0/M] Dodatkowa weryfikacja poza czatem przy zmianie danych wypłat (sekcja 9.5) — nigdy na podstawie samej rozmowy w Telegramie. DoD: próba zmiany danych wypłaty przez Telegram wymaga potwierdzenia przez osobny kanał (np. link mailowy), test to potwierdza. **Nie dotyczy jeszcze 2026-09-13**: appka nie ma dziś żadnego mechanizmu wypłat do zabezpieczenia (TASK-5.2.2 pełne pozostaje niezbudowane) — budowanie zabezpieczenia dla nieistniejącego mechanizmu byłoby inżynierią pod hipotezę, dokładnie to czego ten projekt unika. Wraca razem z realnym mechanizmem wypłat.

---

## EPIC 6 — Rebranding Postfly / postfly.pl
*Odpowiada Fazie F.*

- [x] **TASK-6.1** [P1/S] Ujednolicenie nazewnictwa "FlowState" → "Postfly" w kodzie i dokumentach. **Domknięte 2026-09-14**: branding widoczny dla użytkownika był już Postfly (metadata, logo, favicon — zbudowane wcześniej niż ten task); dziś domknięte `package.json`/`package-lock.json`, nazwa ciasteczka sesji, dokumentacja. Świadomie NIE ruszone: nazwy w `docker-compose.yml` lokalnego dev — patrz uzasadnienie w logu ról głównego planu.
- [x] **TASK-6.2** [P1/S] Domena postfly.pl (`NEXT_PUBLIC_SITE_URL`). **Potwierdzone 2026-09-14, nie wymagało kodu**: `lib/site-url.ts` (`getSiteUrl`) już czyta `NEXT_PUBLIC_SITE_URL` ze zmiennych środowiskowych, appka realnie serwuje `postfly.pl` od wielu wdrożeń w tej sesji (`postfly.pl/api/health`) — zmienna już poprawnie ustawiona w Vercel.
- [x] **TASK-6.3** [P1/S] Aktualizacja `STRIPE_SUCCESS_URL`/`STRIPE_CANCEL_URL`. **Potwierdzone 2026-09-14, nie wymagało kodu**: `lib/server/stripe.ts` już czyta te zmienne ze środowiska z fallbackiem na `getSiteUrl()` — ta sama poprawna domena co TASK-6.2.
- [x] **TASK-6.4** [P2/S] Branding: favicon/logo/meta tagi. **Potwierdzone 2026-09-14, już gotowe**: `app/layout.tsx` (metadata "Panel Postfly", favicon/apple-icon), `components/BrandLogo.tsx` (domyślny alt "Postfly", `/logo.png`).
- [ ] **TASK-6.5** [P2/M] Feature flags dla stopniowego udostępniania nowego UI z EPIC 10 (nie wszystkim naraz). **Nie dotyczy jeszcze**: EPIC 10 (redesign) nie został rozpoczęty — nie ma jeszcze nowego UI do flagowania.
- [ ] **TASK-6.6** [P2/-] Decyzja marketingowa: marka osobista vs osobna marka Postfly (sekcja Faza F głównego planu) — materiał tylko na realnych wynikach. Decyzja właściciela, nie inżynierska — pozostaje otwarta.

---

## EPIC 7 — Produktyzacja i skalowanie
*Odpowiada Fazie G.*

- [ ] **TASK-7.1** [P1/M] Pełny test onboardingu w `APP_MODE=commercial`.
- [ ] **TASK-7.2** [P0/M] RODO / polityka prywatności (przy współpracy z Agentem prawnym z EPIC 8).
- [ ] **TASK-7.3** [P1/M] Architekt: przegląd indeksów bazy pod `(userId, status, scheduledAt)` i rate-limiting per tenant (sekcja 8.3-8.4).
- [ ] **TASK-7.4** [P2/M] Strategia wersjonowania API na wypadek przyszłych integracji zewnętrznych.
- [ ] **TASK-7.5** [P1/-] Plan ciągłości działania bez Ciebie (choroba/awaria) — minimum: kto ma dostęp poza Tobą.

---

## EPIC 8 — Warstwa operacyjna (agenci utrzymaniowi)
*Odpowiada Fazie H. Może iść równolegle z EPIC 5-7, niski koszt wdrożenia pojedynczo.*

- [ ] **TASK-8.1** [P1/S] Agent bezpieczeństwa/zależności.
- [ ] **TASK-8.2** [P1/M] Agent śledzący zmiany zasad platform (TikTok/Meta/YouTube changelogi).
- [ ] **TASK-8.3** [P1/M] Agent kosztów (FinOps) — ciągły, nie jednorazowy.
- [ ] **TASK-8.4** [P1/M] Agent DevOps/wdrożeniowy (na bazie `docs/rollback-i-konwencja-migracji-2026-09-04.md`) — osobne, najwęższe poświadczenia w całym systemie (sekcja 9.2) i jawne zatwierdzenie człowieka przed każdym działaniem na produkcji.
- [ ] **TASK-8.5** [P2/M] Agent trendów (research zewnętrzny, karmi EPIC 4).
- [ ] **TASK-8.6** [P0/M] Agent prawny (Regulamin, Polityka Prywatności, DPA).
- [ ] **TASK-8.7** [P1/M] Agent diagnostyczny (rozwiązań) — korelacja `error_log`/audit trail/raportów QA po ID zadania, propozycja rozwiązania. DoD: wyłącznie doradczy, brak jakiegokolwiek dostępu do zmiany kodu/konfiguracji (test: próba samodzielnej zmiany przez agenta kończy się odmową uprawnień).
- [ ] **TASK-8.8** [P2/M] Agent supportu/onboardingu (dopiero przy realnych userach w `commercial`).

---

## EPIC 9 — Backlog dodatkowych możliwości
*Odpowiada Fazie I. Nieblokujące, do wplecenia gdy jest przestrzeń.*

- [ ] **TASK-9.1** [P2/M] Program poleceń.
- [ ] **TASK-9.2** [P2/S] Re-engagement nieaktywnych użytkowników.
- [ ] **TASK-9.3** [P1/M] 2FA i audit log (ważniejsze niż P2 przy wielu tenantach — podnieś priorytet przed EPIC 7).
- [ ] **TASK-9.4** [P2/-] Pozycjonowanie względem konkurencji (materiał, nie kod).
- [ ] **TASK-9.5** [P1/S] Zapis własności treści AI w regulaminie (razem z TASK-8.6).

---

## EPIC 10 — Redesign UX/UI panelu
*Równoległy tor — sekcja 0.1 głównego planu. Dotyka każdego epiku z warstwą UI, nie tylko jednego sprintu.*

- [ ] **TASK-10.1** [P1/M] UX Researcher: audyt obecnego panelu pod kątem liczby decyzji na ekran (rozszerzenie `UX_AUDIT.md`).
- [ ] **TASK-10.2** [P1/L] UI Designer: redesign zgodny z zasadą "1 ekran = 1 decyzja", tryb ciemny domyślny, bento-grid.
- [ ] **TASK-10.3** [P0/M] Design Critic: recenzja pod kątem prostoty, spójności, mobile, WCAG AA — przed przekazaniem do Inżyniera.
- [ ] **TASK-10.4** [P1/-] Wdrożenie stopniowe przez feature flags z TASK-6.5, nie jednorazowy przełącznik dla wszystkich.

---

## EPIC 11 — Zaangażowanie i wzrost kont (skalowanie)
*Odpowiada na pytanie użytkownika (2026-09-14) "czego brakuje żeby mój główny agent prowadził z sukcesem i skalował moje konta". Dwa niezależne tory o bardzo różnym profilu ryzyka — patrz uzasadnienie w log ról. TASK-11.2.x zastępuje/rozszerza wcześniejszy TASK-5.4.6 (ten sam Agent społeczności, pełny projekt zamiast placeholdera).*

### Sprint 11.1 — Śledzenie wzrostu kont (followersi/subskrybenci)
*Zero nowych zgód OAuth — wszystko mieści się w już przyznanych scope'ach. Niskie ryzyko, buduj pierwsze.*

- [x] **TASK-11.1.1** [P1/M] Nowy model `AccountGrowthSnapshot` (per `SocialAccount`: `followerCount`, `fetchedAt`) — codzienny snapshot. **Domknięte 2026-09-14** (migracja `20260914062347_account_growth_snapshot`): celowo NIE ten sam wzorzec co `PostMetric` (upsert, tylko najnowszy stan) — to jest prawdziwa SERIA CZASOWA (nowy wiersz co sweep), bo "wzrost" ma sens tylko jako trend, nie pojedyncza liczba. Pola per platforma potwierdzone: TikTok `follower_count` przez `GET /v2/user/info/?fields=follower_count` (scope `user.info.stats`, już przyznany), Instagram `followers_count` na węźle `/{ig-user-id}` (scope `instagram_basic`, już przyznany), Facebook `followers_count` na węźle strony (scope `pages_read_engagement`, już przyznany), YouTube `channels.list?part=statistics&mine=true` → `subscriberCount` (scope `youtube.readonly`, już przyznany — dokładnie ta luka zidentyfikowana przy zamykaniu EPIC 4, teraz domknięta). Zero nowych zgód użytkownika potwierdzone w praktyce, nie tylko w teorii.
- [x] **TASK-11.1.2** [P1/S] Zbieranie wpięte w istniejący dzienny cron. **Domknięte 2026-09-14**: `collectAccountGrowth()` jako siódma funkcja w tym samym route `telegram-digest` — bez nowego slotu crona.
- [x] **TASK-11.1.3** [P1/S] `/followers` na Telegramie + narzędzie agenta-mentora `get_follower_growth`. **Domknięte 2026-09-14**: trend per platforma (dziś vs tydzień temu, dziś vs miesiąc temu), jawnie "brak jeszcze wystarczających danych" gdy nie ma historycznego punktu odniesienia, zamiast zmyślonego trendu albo fałszywego zera.
- [x] **TASK-11.1.4** [P2/S] Wpięcie realnego wzrostu followersów do cotygodniowego coachingu. **Domknięte 2026-09-14**: `WeeklyCoachingData.followerGrowth`, uwzględnione zarówno w prompt Claude jak i w uczciwym szablonie zapasowym (fallback), platformy bez wystarczających danych pomijane, nie zgadywane.

**Sprint 11.1 — w pełni zamknięty.**

### Sprint 11.2 — Agent społeczności: komentarze i DM (zastępuje TASK-5.4.6)
*Wymaga NOWYCH zgód OAuth na KAŻDEJ platformie z osobna, z realnym, tygodniowym czasem oczekiwania na zatwierdzenie (ten sam typ procesu co trwający audyt TikTok Content Posting) — i jednym realnym pytaniem znakowym, czy to w ogóle wykonalne na TikToku dla zwykłej appki. Żaden kod nie powstaje przed TASK-11.2.1.*

*Zakres domknięty 2026-09-14: **komentarze na Instagramie i Facebooku**. DM (Instagram/Facebook Messenger) świadomie POZA zakresem tej dostawy — wymaga osobnych, jeszcze niepotwierdzonych uprawnień (`instagram_manage_messages`/`pages_messaging`), których właściciel nie zweryfikował na własnym koncie deweloperskim (w przeciwieństwie do komentarzy, gdzie `instagram_manage_comments`/`pages_manage_engagement` zostały bezpośrednio potwierdzone w kolejce App Review appki). TikTok nadal wykluczony (TASK-11.2.2), YouTube nadal niezweryfikowany.*

- [x] **TASK-11.2.1** [P0/S] **Decyzja właściciela produktu.** Zamknięte 2026-09-14: właściciel zweryfikował bezpośrednio na własnych kontach deweloperskich Meta, że `pages_manage_engagement` (Facebook) i `instagram_manage_comments` (Instagram) są już w kolejce "New requests" App Review appki — potwierdzone zrzutami ekranu z panelu Meta, nie założeniem. Zaakceptowany plan: zbudować i przetestować kod na WŁASNYM koncie właściciela w trybie deweloperskim Meta (konta Admin/Developer/Tester mogą używać niezatwierdzonych jeszcze uprawnień bez czekania na App Review — ten sam wzorzec co piaskownica TikToka już używana w tym projekcie), formalne zgłoszenie App Review dopiero PO działającym demo. TikTok świadomie zaakceptowany jako prawdopodobnie niewykonalny (TASK-11.2.2), YouTube odłożony.
- [x] **TASK-11.2.2** [P0/S] **Weryfikacja wykonalności TikTok PRZED jakimkolwiek kodem.** Sprawdzone 2026-09-14: publicznie udokumentowany endpoint zapytania o komentarze (`vce-query-video-comments`) figuruje wyłącznie pod sekcją **Research API** (dostęp ograniczony do zakwalifikowanych badaczy non-profit), nie pod zwykłym Display/Login Kit API używanym przez tę appkę do publikacji. Właściciel zweryfikował bezpośrednio w TikTok Developer Portal (lista scope'ów appki) — brak jakiegokolwiek scope'u dotyczącego komentarzy. TikTok wykluczony z tej dostawy.
- [x] **TASK-11.2.3** [P0/L] Nowe zgody OAuth Instagram/Facebook. Zamknięte 2026-09-14 (`lib/server/social-oauth.ts`): `pages_manage_engagement` dopisane do domyślnego scope Facebooka, `instagram_manage_comments` do domyślnego scope Instagrama. Konto połączone PRZED tą zmianą wymaga ponownego połączenia (Ustawienia → Konta social → rozłącz/połącz ponownie), żeby dostać token faktycznie niosący nowy scope. YouTube (`youtube.force-ssl`) świadomie odłożone — osobna decyzja, nie zweryfikowana w tej sesji.
- [x] **TASK-11.2.4** [P0/M] Nowy model `SocialComment` (migracja `20260914073007_social_comments`) — komentarz wykryty na własnym opublikowanym poście (powiązany z `PublishJob`, ten sam wzorzec ponownego użycia `remotePostId` co `PostMetric`), status `PENDING/REPLIED/IGNORED`, `suggestedReply` opcjonalny. `SocialMessage` (DM) NIE powstał — poza zakresem tej dostawy (patrz uwaga o zakresie wyżej).
- [x] **TASK-11.2.5** [P1/M] Wykrywanie nowych komentarzy — polling w cronie (`detectAndNotifyNewComments`, `lib/server/social-comments.ts`), wpięte jako ósma funkcja w ten sam dzienny cron `telegram-digest` co reszta appki (zero nowego slotu). Nie webhook — wymagałby osobnego App Review + weryfikacji publicznego URL callback, osobnej decyzji biznesowej poza TASK-11.2.1. Dedupe przez unikalny klucz `(publishJobId, externalCommentId)`, nie przez cooldown czasowy (komentarz to zdarzenie dyskretne, nie okresowe przypomnienie).
- [x] **TASK-11.2.6** [P1/M] Claude proponuje odpowiedź (`suggestReply` w `lib/server/social-comments.ts`, ten sam `callClaudeTool` co reszta appki, dopasowanie tonu przez `businessDescription`), wysyłana na Telegram z przyciskami **Wyślij / Napisz własną / Ignoruj** (`commentreply`/`commentcustom`/`commentignore` w `handleCommentCallback`, webhook route). Brak sugestii (Claude nieskonfigurowany albo `canSuggest: false`) → przycisk "Wyślij" po prostu nie pojawia się, zamiast zmyślonego szablonu — uczciwy fallback, nie fałszywa treść.
- [x] **TASK-11.2.7** [P0/S] Hardening przeciw prompt injection. Zamknięte 2026-09-14: system prompt jawnie stwierdza że treść komentarza to DANE, nigdy instrukcja (ten sam wzorzec co agent-mentor), treść zawsze przekazywana jako JSON w polu `commentText`, nigdy string-konkatenowana do system promptu. Test z próbą wstrzyknięcia w treści komentarza: `tests/api/social-comments.test.ts` ("treats comment text as data, not instructions...").
- [x] **TASK-11.2.8** [P0/S] Bramka potwierdzenia CO, nie tylko CZY. Zamknięte 2026-09-14: "Wyślij" wysyła dokładnie tę sugestię, którą użytkownik przeczytał na przycisku (sam tap = potwierdzenie treści); "Napisz własną" ustawia sesję (`User.telegramReplyingToCommentId`, ten sam wzorzec co edycja/harmonogram) i wysyła DOKŁADNIE to, co użytkownik wpisze jako kolejną wiadomość — bez dodatkowego kroku "na pewno?", spójne z resztą appki.

### Sprint 11.3 — Pętla zwrotna wydajność→harmonogram + autopilot (opt-in, zero-tap)
*Odpowiada na pytanie użytkownika (2026-09-14) "czego brakuje żeby agent był niezależny (wrzucam tylko media, on publikuje/analizuje/dobiera strategię)". `optimizeSchedule` już liczył dane-driven sugestię czasu per platforma — była tylko tekstem w podglądzie, nigdy niewykorzystana. To domyka pętlę: sugestia staje się jednym tapem, a potem (opcjonalnie) całkiem automatyczna.*

- [x] **TASK-11.3.1** [P1/M] `PublishJob.suggestedScheduledFor` (migracja `20260914083230_autopilot_and_suggested_schedule`) — per-platforma optymalny czas z `optimizeSchedule`, persystowany przy tworzeniu draftu zamiast wyrzucany po pokazaniu tekstu w podglądzie.
- [x] **TASK-11.3.2** [P1/M] `enqueueDraftGroup` przerobiony żeby obsłużyć RÓŻNE czasy per platforma naraz (`scheduledDateByPlatform`), nie tylko jeden wspólny termin — konieczne, bo `optimizeSchedule` od początku liczył różne godziny per platforma, ale całe API enqueue zakładało jeden termin dla całej grupy. `preserveAsDraftPlatforms` — platforma jeszcze nie gotowa (np. TikTok bez wybranego poziomu prywatności) przetrwa jako DRAFT zamiast zostać skasowana jak "odznaczona".
- [x] **TASK-11.3.3** [P1/S] Przycisk **🎯 Zaplanuj optymalnie** na podglądzie Telegrama — jeden tap zamiast czytania sugestii i ręcznego wpisywania pasującej daty w "📅 Zaplanuj".
- [x] **TASK-11.3.4** [P1/L] Autopilot — `/autopilot on|off|status`, opt-in, domyślnie wyłączony ("brak reakcji = nie publikuj" zostaje domyślną postawą). Włączony: nowy upload pomija ręczny tap "Publikuj" i planuje się automatycznie o optymalnej porze per platforma — chyba że `orchestrateContent` zgłosił krytyczny safety flag (wtedy normalny ręczny podgląd, autopilot nigdy nie omija tej bramki) albo platforma nie jest jeszcze gotowa (wtedy TA platforma zostaje jako DRAFT z normalnym podglądem, reszta i tak leci automatycznie).

**Sprint 11.3 — w pełni zamknięty.** Świadomie NIE zrobione w tej turze: autopilot nie zmienia CO się publikuje (treść/caption) na podstawie wyników — tylko KIEDY. Prawdziwe uczenie się "ten format/pora działa lepiej niż tamten" (nie tylko godzina) i automatyczne odpowiadanie na komentarze bez bramki (Sprint 11.2 ma ją celowo) pozostają nierozpoczęte — oba wymagałyby świadomej decyzji o dalszym zdjęciu nadzoru człowieka, nie tylko pracy inżynierskiej.

### Sprint 11.4 — Proaktywne sugestie treści (CO publikować, nie tylko KIEDY)
*Domyka drugą połowę pytania z Sprint 11.3 — właściciel doprecyzował (2026-09-14): agent MOŻE sam wpadać na pomysł posta na podstawie realnych wyników, i MOŻE go od razu przygotować — ale NIGDY nie publikuje bez jednego tapnięcia zgody, i NIGDY nie generuje mediów (obrazków/wideo) samodzielnie, materiał zawsze dostarcza właściciel. Doprecyzowanie: post tekstowy ma też zachęcać do komentowania (prawdziwa interakcja pod postem = jeden z najsilniejszych sygnałów dla algorytmu Facebooka), bez mechanicznego "engagement bait", za który Facebook obniża zasięg.*

- [x] **TASK-11.4.1** [P1/M] `MediaType.TEXT` + `PublishJob` bez prawdziwego materiału (migracja `20260914091741_proactive_content_suggestions`) — placeholder `Video` (`sourceUrl: 'text-post://no-media'`), żeby cała reszta appki (własność, kampanie, metryki) dalej działała bez zmian, zamiast robić `videoId` opcjonalnym wszędzie.
- [x] **TASK-11.4.2** [P1/M] `publishToFacebookTextPost` (`lib/server/publish-processor.ts`) — zwykły status Facebooka przez `POST /{page-id}/feed?message=...`, bez `file_url`/`url` — jedyna z czterech platform, której API pozwala na post bez żadnego materiału (potwierdzone, nie założone). Próba użycia TEXT na innej platformie kończy się natychmiastowym, nie-ponawianym błędem (nowa kategoria "trwały błąd", ten sam wzorzec co `isPermanentFacebookPermissionError`).
- [x] **TASK-11.4.3** [P1/M] `generateFacebookTextPostSuggestion` (`lib/server/content-suggestions.ts`) — gotowy do publikacji post na bazie realnych danych tygodnia (ten sam `getWeeklyCoachingData` co coaching), z wymuszonym w prompcie naturalnym pytaniem/zaproszeniem do komentarza na końcu, i jawnym zakazem mechanicznego "engagement bait" (oznacz znajomego / napisz TAK / udostępnij) — to obniża zasięg na Facebooku, nie podnosi. Honest decline (`canSuggest: false`) zamiast zmyślonej treści, gdy naprawdę nie ma o czym pisać.
- [x] **TASK-11.4.4** [P1/M] `sendContentSuggestions` (`lib/server/telegram-notifications.ts`) — dziewiąta funkcja w tym samym dziennym cronie, zero nowego slotu. Dwie ścieżki: gotowy post tekstowy (gdy jest podłączony Facebook) albo pomysł na materiał (`generateContentIdeas`, dotąd tylko na żądanie przez `/pomysl` — teraz też proaktywnie, koszt Claude ograniczony tym samym mechanizmem cooldownu co reszta appki, nie tylko "na żądanie"). Pomijane dla użytkownika z `publishingPaused` (nowa propozycja do zatwierdzenia zaraz po auto-pauzie/`/pause` byłaby nie na miejscu).
- [x] **TASK-11.4.5** [P1/S] Zero nowego kodu obsługi przycisków — sugestia to zwykły `PublishJob` w statusie DRAFT, więc istniejące `publish`/`cancel`/`editstart` w webhooku obsługują ją bez zmian (potwierdzone testem end-to-end, nie założone).

**Sprint 11.4 — w pełni zamknięty.**

---

## Kolejność realizacji (zależności między epikami)

```
EPIC 1 (P0) → EPIC 2 → EPIC 3 ─┬→ EPIC 5 → EPIC 6 → EPIC 7
                                 ├→ EPIC 4 → EPIC 11 (Sprint 11.1 od razu, Sprint 11.2 po TASK-11.2.1)
                                 └→ EPIC 10 (równolegle od EPIC 3)
EPIC 8 i EPIC 9 → równolegle od EPIC 1, niska zależność od reszty
```

**Zasada:** nie zaczynaj EPIC-u o wyższym numerze, jeśli w poprzednim zostały odhaczone P0, ale nie P1/P2 — chyba że jawnie zdecydujesz to pominąć i zapiszesz dlaczego w logu ról (sekcja 0 głównego planu).

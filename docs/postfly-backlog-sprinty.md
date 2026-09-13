# Postfly — backlog sprintowy dla Claude Code

> Ten plik to lista wykonawcza. Szczegółowe specyfikacje (jak dokładnie ma działać dany agent, jaka obsługa błędów) są w `postfly-plan-projektu.md` — tu są odwołania numerami sekcji, nie powtórki. Każde zadanie przechodzi przez cztery role z sekcji 0 głównego planu: **PO → Architekt → Inżynier → QA**, w tej kolejności, zanim checkbox zostanie odhaczony. Priorytet: P0 = blokujące, musi być zrobione zanim ruszysz dalej; P1 = ważne w tym epiku; P2 = może poczekać. Rozmiar: S/M/L to orientacyjna złożoność, nie sztywny czas.

---

## EPIC 1 — Stabilizacja fundamentu i higiena techniczna
*Odpowiada Fazie A głównego planu + nowe luki techniczne. Nic z EPIC 2+ nie zaczyna się przed zamknięciem P0 z tego epiku.*

### Sprint 1.1 — Bezpieczeństwo i odzyskiwalność
- [ ] **TASK-1.1.0** [P0/S] Utwórz `CURRENT_TASK.md` i `BUGS.md` w repo wg wzorców z `postfly-plan-wykonania.md` sekcje 3.6-3.7, zanim zaczniesz jakiekolwiek inne zadanie. DoD: oba pliki istnieją, `CURRENT_TASK.md` aktualizowany od pierwszego kroku TASK-1.1.1.
- [ ] **TASK-1.1.1** [P0/M] Środowisko testowe bez dostępu do prawdziwych tokenów OAuth. DoD: osobna baza/konfiguracja, próba użycia prawdziwego tokenu w env testowym kończy się błędem, nie sukcesem. (główny plan: sekcja 3)
- [ ] **TASK-1.1.2** [P0/M] Proces backupu bazy i materiałów, przetestowany realnym odtworzeniem. DoD: symulacja utraty danych → odtworzenie z backupu w ustalonym czasie, udokumentowane.
- [ ] **TASK-1.1.3** [P1/S] Naprawa `npm audit` (8 podatności moderate). DoD: `npm audit --omit=dev` bez podatności moderate+.

### Sprint 1.2 — Poprawność fundamentu
- [ ] **TASK-1.2.1** [P0/M] Potwierdzenie/naprawa bugu ginącej treści (caption/hashtagi gubione przy publikacji). DoD: test regresyjny pokrywający ten dokładny scenariusz, przechodzi w CI.
- [ ] **TASK-1.2.2** [P1/S] Udokumentowanie statusu audytu API TikTok/Meta. DoD: plik statusu z datą sprawdzenia i konkretnym stanem (przeszedł/w toku/nie złożono).

### Sprint 1.3 — Pipeline i higiena ciągła
- [ ] **TASK-1.3.1** [P0/S] CI: zweryfikuj i domknij istniejący workflow (`.github/workflows/test.yml` już uruchamia build+testy+e2e — sprawdź czy jest aktualny, nie buduj od zera). DoD: push do brancha uruchamia pipeline, czerwony status blokuje merge (wymuszone regułą ochrony brancha na GitHubie, nie tylko istnieniem workflow).
- [ ] **TASK-1.3.2** [P1/M] Środowisko staging odseparowane od produkcji. DoD: osobny deployment, osobna baza, dostępny pod subdomeną testową.
- [ ] **TASK-1.3.3** [P2/S] Automatyzacja aktualizacji zależności (Dependabot/Renovate). DoD: automatyczne PR-y na aktualizacje, uruchamiane przez CI z TASK-1.3.1.
- [ ] **TASK-1.3.4** [P2/S] Spójne, strukturalne logowanie z ID śledzącym zadanie przez cały łańcuch agentów. DoD: jedno zdarzenie da się prześledzić od wejścia do wyjścia w logach po jednym identyfikatorze.
- [ ] **TASK-1.3.5** [P0/S] Konfiguracja Playwright: lokalnie zawsze `headed` (widoczna przeglądarka), w CI zostaje `headless`. DoD: `npm run test:e2e` lokalnie otwiera realne okno przeglądarki; workflow CI dalej przechodzi bez zmian w `headless`. Failujący e2e blokuje przejście do kolejnego zadania (sekcja 3.2 protokołu wykonania).

### Sprint 1.4 — Decyzja architektoniczna
- [x] **TASK-1.4.1** [P0/S] Architekt: decyzja o kolejce publikacji (BullMQ vs alternatywy) — patrz sekcja 8.1 głównego planu. DoD: dokument decyzji w repo, nie tylko ustna decyzja. **Zamknięte 2026-09-13**: QStash, nie BullMQ — BullMQ wymaga stałego procesu-workera, którego Vercel Functions (Hobby i Pro) nie obsługują. Pełne uzasadnienie: `postfly-plan-projektu.md`, sekcja "Etap 2 — start", "Decyzja architektoniczna: QStash zamiast BullMQ".

### Sprint 1.5 — Bezpieczeństwo agentów (sekcja 9 głównego planu)
- [ ] **TASK-1.5.1** [P0/M] Weryfikacja podpisów wszystkich webhooków (Telegram, Stripe, TikTok). DoD: żądanie z nieprawidłowym/brakującym podpisem odrzucone, test regresyjny to potwierdza.
- [ ] **TASK-1.5.2** [P0/M] Czyszczenie sekretów/PII z `error_log` i Sentry przed zapisem. DoD: test symulujący błąd z tokenem w danych wejściowych — token nie pojawia się w zapisanym logu.
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
- [ ] **TASK-3.1.1** [P0/M] Mechanizm łączenia konta Telegram z kontem użytkownika (kod jednorazowy + `/start`). DoD: powiązanie `telegramChatId ↔ userId` zapisane, wiadomość bez powiązania odrzucona. (sekcja 4.1)
- [ ] **TASK-3.1.2** [P0/M] Webhook Telegram podłączony do kolejki z EPIC 2. DoD: wiadomość → zadanie w kolejce, nie bezpośrednie wywołanie synchroniczne.

### Sprint 3.2 — Komendy i UX
- [ ] **TASK-3.2.1** [P0/L] Wszystkie komendy z sekcji 5 głównego planu (`/status /pause /resume /approve /reject /retry /cancel /logs /revenue`). DoD: każda przetestowana ręcznie z realnym efektem w systemie.
- [ ] **TASK-3.2.2** [P1/M] Grupowanie nie-pilnych powiadomień w poranny digest (projekt: Zespół UX/UI, sekcja 0.1). DoD: powiadomienia statusowe zbiorcze, tylko akcje/błędy pojedynczo.
- [ ] **TASK-3.2.3** [P1/M] Wykrywanie długiej nieaktywności + agent wsparcia (sekcja 4.1, granica: brak trybu terapeutycznego). DoD: po ustalonym czasie ciszy system przechodzi na rzadkie pytanie zamiast codziennych próśb.
- [ ] **TASK-3.2.4** [P0/M] Hardening promptu Agenta społeczności przeciw prompt injection (sekcja 9.1) — treść komentarza/DM zawsze jako dane, nigdy instrukcja. DoD: test z komentarzem zawierającym próbę wstrzyknięcia polecenia, agent nie wykonuje niczego poza zwykłą analizą treści.

### Sprint 3.3 — Testy wielo-użytkownikowe
- [ ] **TASK-3.3.1** [P0/M] Pełny cykl: upload → potwierdzenie → publikacja wyłącznie przez Telegram. DoD: zero kroków przez web UI w tym teście.
- [ ] **TASK-3.3.2** [P0/M] Test izolacji: dwa konta Telegram nigdy nie widzą swoich danych. DoD: próba dostępu do cudzego `telegramChatId` zwraca odmowę, nie dane.

---

## EPIC 4 — Pełna pętla rozumowania agenta planującego
*Odpowiada Fazie D.*

### Sprint 4.1
- [ ] **TASK-4.1.1** [P1/L] Rozbudowa `smart-autopilot` do pętli obserwuj→planuj→działaj→sprawdź→popraw (sekcja 4.2). DoD: walidacja schematu JSON, retry z poprawionym promptem (maks. 2), fallback na plan domyślny.
- [ ] **TASK-4.1.2** [P1/S] Test: symulacja złego JSON-a z LLM. DoD: system nie zapisuje nieprawidłowego planu, generuje alert.
- [ ] **TASK-4.1.3** [P1/S] Test: symulacja braku danych historycznych. DoD: fallback na plan domyślny, jawnie oznaczony jako "nieoparty na danych".

---

## EPIC 5 — Monetyzacja
*Odpowiada Fazie E. Największy epik — dobrze zamknij EPIC 1-4 zanim zaczniesz.*

### Sprint 5.1 — Fundament danych
- [ ] **TASK-5.1.1** [P0/M] Nowe modele Prisma: `Fan`, `Sale`, `FanSubscription` (uwaga: nie `Subscription` — kolizja z billingiem SaaS), `RoyaltyRegistration`, `SyncPitch`. DoD: migracja przechodzi, brak kolizji nazw.

### Sprint 5.2 — Podstawowi agenci
- [ ] **TASK-5.2.1** [P1/M] Agent fanów (sekcja 4.3).
- [ ] **TASK-5.2.2** [P1/M] Agent sprzedaży + webhook płatności (sekcja 4.3).

### Sprint 5.3 — Zaawansowani agenci
- [ ] **TASK-5.3.1** [P1/M] Agent superfanów.
- [ ] **TASK-5.3.2** [P1/M] Agent tantiem.
- [ ] **TASK-5.3.3** [P2/M] Agent sync (z twardym blokiem: bez potwierdzonych 100% praw nie pitchuje).

### Sprint 5.4 — Budowanie majątku
- [ ] **TASK-5.4.1** [P1/M] Agent księgowo-podatkowy — tylko agregacja danych, zero porad podatkowych.
- [ ] **TASK-5.4.2** [P2/M] Agent ochrony treści (wykrywanie reuploadów, zgłoszenia do zatwierdzenia).
- [ ] **TASK-5.4.3** [P2/M] Agent sponsoringu/brand deals.
- [ ] **TASK-5.4.4** [P1/M] Dashboard finansowy rozszerzony o realny obraz majątku (nie tylko sumę przychodu).
- [ ] **TASK-5.4.5** [P0/S] Bramka potwierdzenia rozszerzona na wszystkie wysyłki Monetyzacji, w tym agenta społeczności (sekcja 4.4).
- [ ] **TASK-5.4.6** [P1/M] Agent społeczności — odpowiedzi na komentarze/DM z pełną bramką (sekcja 4.4).
- [ ] **TASK-5.4.7** [P0/M] Dodatkowa weryfikacja poza czatem przy zmianie danych wypłat (sekcja 9.5) — nigdy na podstawie samej rozmowy w Telegramie. DoD: próba zmiany danych wypłaty przez Telegram wymaga potwierdzenia przez osobny kanał (np. link mailowy), test to potwierdza.

---

## EPIC 6 — Rebranding Postfly / postfly.pl
*Odpowiada Fazie F.*

- [ ] **TASK-6.1** [P1/S] Ujednolicenie nazewnictwa "FlowState" → "Postfly" w kodzie i dokumentach.
- [ ] **TASK-6.2** [P1/S] Domena postfly.pl (`NEXT_PUBLIC_SITE_URL`).
- [ ] **TASK-6.3** [P1/S] Aktualizacja `STRIPE_SUCCESS_URL`/`STRIPE_CANCEL_URL`.
- [ ] **TASK-6.4** [P2/S] Branding: favicon/logo/meta tagi.
- [ ] **TASK-6.5** [P2/M] Feature flags dla stopniowego udostępniania nowego UI z EPIC 10 (nie wszystkim naraz).
- [ ] **TASK-6.6** [P2/-] Decyzja marketingowa: marka osobista vs osobna marka Postfly (sekcja Faza F głównego planu) — materiał tylko na realnych wynikach.

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

## Kolejność realizacji (zależności między epikami)

```
EPIC 1 (P0) → EPIC 2 → EPIC 3 ─┬→ EPIC 5 → EPIC 6 → EPIC 7
                                 ├→ EPIC 4
                                 └→ EPIC 10 (równolegle od EPIC 3)
EPIC 8 i EPIC 9 → równolegle od EPIC 1, niska zależność od reszty
```

**Zasada:** nie zaczynaj EPIC-u o wyższym numerze, jeśli w poprzednim zostały odhaczone P0, ale nie P1/P2 — chyba że jawnie zdecydujesz to pominąć i zapiszesz dlaczego w logu ról (sekcja 0 głównego planu).

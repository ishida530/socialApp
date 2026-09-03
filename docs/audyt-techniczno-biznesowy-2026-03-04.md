# Audyt techniczno-biznesowy FlowState

Data: 2026-03-04  
Zakres: aplikacja Next.js (`app/**`, `lib/**`, `prisma/**`, konfiguracje runtime/deploy)

Aktualizacja: 2026-03-05
- Wdrożono pełny dark mode oparty o `next-themes` (tryby: `light` / `dark`) z przełącznikiem w nagłówku.
- Ujednolicono system tokenów kolorystycznych i hierarchię CTA pod kątem spójności UX/UI i konwersji.
- Wdrożono event tracking landingu (`landing_view`, `landing_section_view`, `landing_cta_click`, `landing_plan_click`) oraz przeniesiono flow pricing na ścieżkę publiczną, by ograniczyć drop-off przed rejestracją.

## 0) Analiza konwersji landing flow (eventy i skutki)

### Eventy w lejku
- `landing_view`: wejście użytkownika na landing.
- `landing_section_view`: dotarcie do sekcji (`hero`, `features`, `pricing`, `final-cta`).
- `landing_cta_click`: kliknięcia przycisków CTA (`hero_start_trial`, `hero_login`, `pricing_compare`, `final_start_trial`, `final_login`).
- `landing_plan_click`: wybór planu (`starter`, `pro`, `business`) na sekcji pricing.

### Skutki biznesowe monitorowane przez eventy
- Spadek między `landing_view` a `landing_section_view(pricing)` = problem z message fit above the fold.
- Spadek między `landing_section_view(pricing)` a `landing_plan_click` = problem z ofertą/copy planów.
- Spadek między `landing_plan_click` a sukcesem rejestracji/logowania = tarcie w auth flow.
- Wysoki udział `hero_login` vs `hero_start_trial` = niższa intencja trial i potencjał do testów copy CTA.

### Zmiany UX pod konwersję (wdrożone)
- Usunięto ścieżkę z CTA pricing do prywatnego `/billing` (wcześniej wymuszała login i obniżała konwersję TOFU).
- Wybór planu na landingu przekazuje intencję do `/register?source=landing&intent=...`.
- Rejestracja z intencją planu płatnego przekierowuje na `/billing` po utworzeniu konta, skracając time-to-checkout.

## 1) Executive summary

FlowState jest **produktem na etapie MVP+** z dobrze domkniętym core flow (auth → upload → planowanie/publikacja → analytics → billing). Fundament techniczny jest dobry: kompilacja produkcyjna przechodzi, schema danych jest spójna, a krytyczne ścieżki (cron, webhooki, publish processor) mają podstawowe zabezpieczenia i retry.

Największe ryzyka nie dotyczą „czy działa”, tylko **skalowalności i enterprise-readiness**:
- bezpieczeństwo sesji i odporność na CSRF przy cookie auth,
- obserwowalność/SRE (brak pełnego APM/alertingu i runbooków),
- analityka biznesowa ograniczona do metryk operacyjnych (brak metryk produktowych/finansowych klasy SaaS),
- zależność od mock/live billing mode bez twardych guardrailów rolloutowych.

Ocena ogólna:
- **Technicznie:** 7.8/10
- **Biznesowo (SaaS readiness):** 7.1/10
- **Gotowość do dalszego skalowania:** 6.9/10

---

## 2) Metodologia

- Przegląd architektury i konfiguracji runtime/deploy.
- Przegląd bezpieczeństwa endpointów auth, cron, webhook, billing, upload.
- Ocena modelu danych i egzekwowania limitów planów.
- Weryfikacja jakości technicznej (build + diagnostics + dependency audit).

Wyniki walidacji:
- `next build` przechodzi poprawnie.
- Brak błędów IDE diagnostics (`get_errors`).
- `npm audit --omit=dev` zgłasza 8 podatności moderate (łańcuch zależności Prisma tooling).

---

## 3) Mocne strony techniczne

1. **Solidna baza backendowa i model danych**
   - Spójne encje: użytkownik, social accounts, wideo, drafty, publish jobs, subskrypcje, usage counters.
   - Indeksy pod krytyczne zapytania (`PublishJob` po `status/scheduledFor`, unikalność usage period).

2. **Dobrze zaprojektowany pipeline publikacji**
   - Claiming z `FOR UPDATE SKIP LOCKED` minimalizuje duplikację pracy w workerach.
   - Retry + backoff + obsługa token refresh + logika pollingu TikTok status.

3. **Podstawy bezpieczeństwa na dobrym poziomie**
   - Weryfikacje podpisów webhooków (TikTok/Stripe), autoryzacja cron sekretem, signed video source URL.
   - Security headers + CSP, `httpOnly` cookie dla tokenu sesji.

4. **Monetyzacja i limity jako część logiki domenowej**
   - Centralne limity planów oraz usage counters (video/publish/AI autopilot).
   - Integracja Stripe + idempotencja eventów webhook (`StripeEvent`).

---

## 4) Ryzyka techniczne (priorytety)

## P0 (wysokie)

### P0.1 CSRF hardening dla endpointów mutujących
**Obserwacja:** autoryzacja opiera się o cookie + brak jawnej weryfikacji `Origin`/CSRF token na endpointach zmieniających stan. `sameSite=lax` ogranicza ryzyko, ale nie zastępuje pełnego CSRF defense.

**Ryzyko biznesowe:** nieautoryzowane akcje użytkownika (np. wywołania billing/publish) przez zewnętrzną stronę przy aktywnej sesji.

**Rekomendacja:**
- dodać globalny middleware CSRF dla mutacji (`POST/PATCH/DELETE`) z allowlistą,
- dodać walidację `Origin/Referer` dla API cookie-auth,
- rozważyć przejście na strategię `SameSite=Strict` tam, gdzie UX na to pozwala.

### P0.2 Brak pełnej observability produkcyjnej (APM + alerting)
**Obserwacja:** logging jest strukturalny, ale lokalny (`console.info/error`), bez korelacji request/job, bez metryk SLI/SLO i alertingu.

**Ryzyko biznesowe:** dłuższy MTTR, wyższe koszty supportu i utrata zaufania przy incydentach publish/billing.

**Rekomendacja:**
- wdrożyć APM + error tracking (np. Sentry/OpenTelemetry + provider metryk),
- zdefiniować SLI/SLO dla: auth, publish success rate, webhook latency, cron health,
- uruchomić alerty P1/P2 i runbook incydentowy.

## P1 (średnie)

### P1.1 Braki w testach automatycznych
**Obserwacja:** brak testów jednostkowych/integracyjnych/e2e w repo.

**Ryzyko biznesowe:** regresje przy rozwoju funkcji i wzrost kosztu zmian.

**Rekomendacja:**
- minimum testowe: auth, billing checkout/webhook, publish processor retry, subscription limits,
- smoke e2e dla kluczowego user flow.

### P1.2 Ryzyko konfiguracji i trybów billing (`mock`/`live`)
**Obserwacja:** billing mode dynamicznie zależny od środowiska (`auto`) i env.

**Ryzyko biznesowe:** przypadkowe działanie w trybie niezgodnym z oczekiwaniami biznesowymi.

**Rekomendacja:**
- dodać startup guardrails (fail-fast gdy `live` i brak wymaganych STRIPE_*),
- dodać jawny wskaźnik mode w panelu admin (read-only),
- kontrola release checklist dla billing.

### P1.3 Podatności zależności (moderate) w toolchain
**Obserwacja:** `npm audit` pokazuje moderate CVE głównie przez łańcuch Prisma tooling.

**Ryzyko biznesowe:** compliance/security posture, potencjalne blokery enterprise procurement.

**Rekomendacja:**
- zaplanować okno aktualizacji Prisma/deps i retest build,
- prowadzić cykliczny dependency review (np. miesięczny).

## P2 (niskie/strategiczne)

### P2.1 Deprecation warning middleware→proxy (Next 16)
**Obserwacja:** build ostrzega o deprecacji konwencji `middleware`.

**Ryzyko biznesowe:** dług technologiczny i przyszłe koszty migracji.

**Rekomendacja:** zaplanować migrację do `proxy` w najbliższym cyklu maintenance.

### P2.2 Ograniczona telemetria produktowa
**Obserwacja:** analityka skupia się głównie na metrykach operacyjnych (videos/jobs/success).

**Ryzyko biznesowe:** ograniczona zdolność optymalizacji MRR, aktywacji i retencji.

**Rekomendacja:**
- dodać eventy produktowe: onboarding completion, time-to-first-publish, feature adoption,
- dashboard KPI: activation rate, D7/D30 retention, trial→paid conversion, churn reasons.

---

## 5) Ocena biznesowa SaaS

## 5.1 Product-market i wartość
- Jasna propozycja wartości: automatyzacja publikacji i orkiestracja social.
- Core flow dla użytkownika końcowego jest kompletny i intuicyjny.
- Dobrze zdefiniowane poziomy planów i limity zużycia.

## 5.2 Monetyzacja
- Cennik i plan catalog są spójne (`Free` / `Pro` / `Premium`).
- Działa model trialu PRO (48h) jako mechanizm aktywacji.
- Potrzebne twardsze KPI billing/retention i raportowanie unit economics.

## 5.3 Operacje i skalowanie
- Publish processor ma mechanizmy retry i lockowania.
- Brakuje pełnego modelu operacyjnego SRE (alerting, runbooki, on-call).
- Wraz ze wzrostem wolumenu trzeba kontrolować koszty storage/transcodingu i external API calls.

---

## 6) Plan 30/60/90 dni

## 0–30 dni (stabilizacja i bezpieczeństwo)
1. Wdrożyć CSRF hardening + walidację `Origin` dla mutacji API.
2. Dodać APM/error tracking + podstawowe alerty (auth, cron, webhook, publish failures).
3. Uszczelnić konfigurację billing mode (fail-fast + checklista release).

## 31–60 dni (jakość i skalowalność)
1. Dodać testy integracyjne dla auth/billing/publish/subscription.
2. Ustandaryzować contract tests dla webhooków (Stripe/TikTok).
3. Wdrożyć dashboard operacyjny SLO + trendy awarii.

## 61–90 dni (growth i biznes)
1. Zbudować dashboard KPI SaaS (activation, retention, conversion, churn).
2. Eksperymenty pricing/onboarding na danych (A/B lub cohort analysis).
3. Migration path middleware→proxy + przegląd kosztów infrastruktury.

---

## 7) Wskaźniki sukcesu audytu (do śledzenia)

- MTTR incydentów publish/billing < 30 min.
- Success rate publikacji > 97% (po wyłączeniu błędów scope/provider-side).
- Trial→Paid conversion: cel kwartalny (np. +20% vs baseline).
- D30 retention: trend rosnący miesiąc do miesiąca.
- Zero incydentów bezpieczeństwa klasy sesja/CSRF.

---

## 8) Podsumowanie końcowe

FlowState jest na dobrym poziomie technicznym dla MVP produkcyjnego i ma realną podstawę do skalowania. Największa dźwignia wartości na kolejny etap to połączenie: **security hardening + operacyjna obserwowalność + metryki biznesowe SaaS**. Po wdrożeniu planu 30/60/90 dni produkt będzie znacznie bliżej standardu „scale-ready”.

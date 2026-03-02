# FlowState – Kompletny audyt aplikacji (2026-03-02)

## Zakres audytu
- Architektura Next.js app router + API routes
- Autoryzacja i sesje
- Płatności Stripe (checkout + webhook)
- Integracje OAuth (Google/TikTok)
- Prisma/Supabase, konfiguracja produkcyjna
- Endpointy jobs/activity oraz scheduler (cron)
- Hygiene: błędy kompilacji, zależności npm

## Metodyka
- Przegląd kodu endpointów i warstwy auth
- Weryfikacja konfiguracji env i Prisma
- Build/TypeScript check
- `npm audit --omit=dev`

---

## Podsumowanie ryzyka

### P0 (krytyczne)
1. Jawne dane dostępowe i sekrety nadal występują w lokalnych plikach środowiskowych (`.env`, `.env.local`) — m.in. połączenia DB i klucze OAuth/TikTok.

### P1 (wysokie)
1. Skuteczność rate limitingu zależy od poprawnego ustawienia `UPSTASH_REDIS_REST_URL` i `UPSTASH_REDIS_REST_TOKEN`; bez tego działa tylko fallback in-memory (słabszy w środowisku wieloinstancyjnym).

### P2 (średnie)
1. Rejestracja bez polityki siły hasła i bez normalizacji email.
2. `npm audit --omit=dev` zgłasza 8 podatności o poziomie `moderate` (głównie łańcuch zależności narzędzi Prisma).
3. Brak formalnych testów integracyjnych dla krytycznych flow (billing webhooks, OAuth callback, cron publish).
4. Nieużywany moduł `lib/auth-token.ts` pozostaje w repo (potencjalne ryzyko regresji do localStorage-based auth).

---

## Findings – szczegóły

### 1) Auth i sesje
**Status:** Naprawione (zamknięte P0 z poprzedniej wersji)

- Sesja działa przez cookie `HttpOnly` ustawianą po `login/register`.
- Frontend odczytuje sesję przez `/api/auth/me`; endpoint `/api/auth/logout` czyści cookie.
- Przechowywanie tokenu po stronie klienta zostało usunięte z aktywnego flow.

**Dowody (pliki):**
- app/api/auth/login/route.ts
- app/api/auth/register/route.ts
- app/api/auth/me/route.ts
- app/api/auth/logout/route.ts
- contexts/auth-context.tsx
- lib/api-client.ts

**Dalsze rekomendacje:**
- Dodać refresh token flow i rotację sesji.
- Usunąć lub zarchiwizować nieużywany `lib/auth-token.ts`.

---

### 2) Stripe billing i webhook
**Status:** Dobrze zabezpieczone po ostatnich zmianach

- Weryfikacja podpisu webhook Stripe jest zaimplementowana.
- Idempotencja webhooka oparta o `StripeEvent` działa.
- Przetwarzanie zdarzeń i zapis `StripeEvent` są atomowe (`prisma.$transaction`).
- Obsłużony race condition (`P2002` => "already processed").

**Dowody (pliki):**
- app/api/billing/webhook/stripe/route.ts
- prisma/schema.prisma

**Uwagi:**
- Dodatkowo dodano rate limiting dla endpointu webhook.

---

### 3) OAuth (Google/TikTok)
**Status:** Obniżone ryzyko

- Jest podpisany i wygasający `state` dla OAuth.
- Dla TikTok PKCE wykorzystywana jest cookie z code verifier.
- Cookie PKCE ma `httpOnly: true` i `secure: process.env.NODE_ENV === 'production'`.

**Dowody (pliki):**
- lib/server/social-oauth.ts
- app/api/social-accounts/auth-url/[platform]/route.ts
- app/api/social-accounts/[id]/reconnect/route.ts
- app/api/auth/callback/[provider]/route.ts

**Dalsza rekomendacja:**
- Rozważyć `sameSite: 'strict'` tam, gdzie flow na to pozwala.

---

### 4) API hardening
**Status:** W większości naprawione

- Dodano rate limiting dla `/api/auth/login`, `/api/auth/register`, `/api/billing/webhook/stripe`, `/api/tiktok/webhook`.
- Dodano wariant distributed przez Upstash REST + fallback in-memory.
- `serverError()` zwraca generyczny komunikat 500.
- Dodano centralne security headers (CSP, HSTS, X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy).

**Dowody (pliki):**
- app/api/auth/login/route.ts
- app/api/auth/register/route.ts
- app/api/billing/webhook/stripe/route.ts
- app/api/tiktok/webhook/route.ts
- lib/server/http.ts
- lib/server/rate-limit.ts
- next.config.mjs

**Dalsza rekomendacja:**
- Potwierdzić ustawienie `UPSTASH_REDIS_REST_URL` i `UPSTASH_REDIS_REST_TOKEN` na Vercel (Production + Preview).
- Rozważyć dodanie rate limitingu także dla `/api/cron/publish` i endpointów OAuth callback.

---

### 5) Jobs/Activity pagination
**Status:** Poprawnie wdrożone

- Endpointy server-side pagination (`/api/jobs`, `/api/activity`) przyjmują `limit/offset`.
- Prisma używa `take/skip`, response ma `data`, `totalCount`, `hasMore`.
- Frontend paginuje przyciskami Previous/Next po stronie serwera.

**Dowody (pliki):**
- app/api/jobs/route.ts
- app/api/activity/route.ts
- app/schedule/page.tsx
- components/RecentActivity.tsx

---

### 6) Prisma/Supabase i deploy
**Status:** Produkcyjnie gotowe, z jedną ważną uwagą

- Dla Prisma v7 `directUrl` nie może być w `schema.prisma`; poprawnie przeniesione do `prisma.config.ts`.
- Build pipeline ma `vercel-build` (`prisma generate && prisma migrate deploy && next build`).

**Dowody (pliki):**
- prisma.config.ts
- package.json

**Uwaga:**
- Jeśli dokumentacja/env nadal odwołuje się do `directUrl` w `schema.prisma`, trzeba to zaktualizować.

---

### 7) Wynik narzędzi
- TypeScript / Problems: brak błędów.
- Build: przechodzi.
- `npm audit --omit=dev`: 8 moderate vulnerabilities (głównie przez łańcuch zależności Prisma tooling).

---

## Plan remediacji (priorytety)

### Natychmiast (przed go-live)
1. Rotacja wszystkich sekretów, które były/j są ujawnione lokalnie (DB, OAuth, TikTok, Stripe, JWT, encryption).
2. Ustawienie `UPSTASH_REDIS_REST_URL` i `UPSTASH_REDIS_REST_TOKEN` w Vercel, żeby wymusić distributed rate limit.
3. Usunięcie sekretów z lokalnych plików `.env/.env.local` i zastąpienie ich placeholderami.

### Krótki termin (1-3 dni)
1. Dodać walidację siły hasła po stronie backendu (minimum długość + złożoność).
2. Dodać rate limiting dla dodatkowych endpointów publicznych (`cron`, callbacki OAuth).
3. Dodać minimalny audit log dla akcji administracyjnych i billingowych.

### Średni termin (3-7 dni)
1. Dodać testy integracyjne dla Stripe webhook + idempotencji.
2. Dodać testy dla OAuth callback (state/PKCE mismatch).
3. Dodać testy dla paginacji jobs/activity (`hasMore`, skrajne wartości limit/offset).
4. Usunąć nieużywany moduł `lib/auth-token.ts`.

---

## Go-live checklist (skrót)
- [ ] Sekrety zrotowane i ustawione tylko w Vercel/Supabase (nie w repo).
- [ ] `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` ustawione na Vercel.
- [ ] Stripe webhook endpoint ustawiony i zweryfikowany.
- [ ] `DATABASE_URL` (pgbouncer) + `DIRECT_URL` (direct) ustawione poprawnie.
- [ ] `npm run vercel-build` przechodzi w CI/CD.
- [ ] Cron `/api/cron/publish` ma poprawny `CRON_SECRET`.
- [ ] `ADMIN_EMAILS` ustawione jako lista (comma/space/semicolon).

---

## Ocena końcowa
Aplikacja jest blisko produkcyjnej gotowości i po re-audycie ma wyraźnie lepszy poziom zabezpieczeń (HttpOnly session, security headers, rate limiting, idempotentny Stripe webhook). Największe aktualne ryzyko krytyczne dotyczy zarządzania sekretami w lokalnych plikach env. Po rotacji sekretów i ustawieniu distributed limitera na Vercel rekomendowany jest deploy produkcyjny.

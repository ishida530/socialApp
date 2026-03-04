# FlowState – lokalne uruchomienie (Docker) + deploy Vercel/Supabase

Projekt działa jako pojedyncza aplikacja runtime:
- aplikacja: Next.js (root projektu) – UI + API routes
- baza danych: PostgreSQL (lokalna instancja)
- cache/kolejka pomocnicza: Redis (lokalna instancja)
- ORM: Prisma (`prisma/schema.prisma`)

## 1) Wymagania

- Node.js 20+
- npm 10+
- Docker Desktop (lub inny silnik Docker + Compose)

## 2) Szybki start (lokalnie)

W katalogu projektu uruchom:

```bash
npm install
npm run docker:up
npm run prisma:generate
npx prisma db push --schema prisma/schema.prisma
npm run dev
```

Adresy:
- App + API: http://localhost:3000
- Postgres: localhost:5432
- Redis: localhost:6379

Zatrzymanie lokalnych usług:

```bash
npm run docker:down
```

## 3) Konfiguracja env (lokalnie)

Główny plik środowiskowy:
- `.env`

Wymagane klucze OAuth:
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`
- `TIKTOK_CLIENT_ID`, `TIKTOK_CLIENT_SECRET`, `TIKTOK_REDIRECT_URI`
- `FACEBOOK_CLIENT_ID`, `FACEBOOK_CLIENT_SECRET`, `FACEBOOK_REDIRECT_URI`
- `INSTAGRAM_CLIENT_ID`, `INSTAGRAM_CLIENT_SECRET`, `INSTAGRAM_REDIRECT_URI`
- `TIKTOK_WEBHOOK_SECRET`
- `VIDEO_SOURCE_SIGNING_SECRET` (zalecane; fallback to `JWT_SECRET` jeśli brak)

Wymagane zmienne Stripe (Value-Based Pricing):
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_STARTER_MONTHLY`
- `STRIPE_PRICE_STARTER_YEARLY`
- `STRIPE_PRICE_PRO_MONTHLY`
- `STRIPE_PRICE_PRO_YEARLY`
- `STRIPE_PRICE_BUSINESS_MONTHLY`
- `STRIPE_PRICE_BUSINESS_YEARLY`
- `STRIPE_SUCCESS_URL`
- `STRIPE_CANCEL_URL`

Dodatkowo dla Meta Graph API:
- `META_GRAPH_API_VERSION` (domyślnie `v23.0`)

Zalecane scope dla publikacji:
- Facebook: `pages_show_list,pages_manage_posts,pages_read_engagement`
- Instagram: `instagram_basic,instagram_content_publish,pages_show_list,business_management`

Uwagi:
- `NEXT_PUBLIC_API_URL` dla fullstack Next powinno pozostać ustawione na `/api`.
- Dla lokalnego callbacku TikTok redirect ustaw: `http://localhost:3000/api/auth/callback/tiktok`.
- W panelu TikTok Login Kit redirect URI musi być identyczne 1:1.

## 4) Deploy na Vercel + Supabase

1. Utwórz projekt Postgres w Supabase.
2. W Vercel ustaw zmienne środowiskowe:
	- `DATABASE_URL` = pooled connection string z Supabase (`...pooler.supabase.com...`)
	- `DIRECT_URL` = direct connection string z Supabase (`...db.supabase.co...`)
	- `NEXT_PUBLIC_API_URL=/api`
	- pozostałe sekrety OAuth/JWT jak w `.env`
3. W build/deploy uruchamiaj `prisma generate` i `prisma migrate deploy`.
4. Redis na produkcji ustaw jako osobną usługę (np. Upstash Redis) i podaj `REDIS_URL`.

## 4a) Harmonogram publikacji na Vercel (Cron)

Aplikacja zawiera minimalny processor jobów publikacji uruchamiany przez Vercel Cron:

- endpoint: `/api/cron/publish`
- harmonogram: co 1 minutę (`*/1 * * * *` w `vercel.json`)
- autoryzacja: nagłówek `Authorization: Bearer <CRON_SECRET>`

Wymagane zmienne środowiskowe na Vercel:

- `CRON_SECRET` (silny losowy sekret)
- standardowe zmienne bazy/OAuth (`DATABASE_URL`, `DIRECT_URL`, itd.)

Uwaga: to jest model serverless (cron wywołuje endpoint cyklicznie), nie stały worker 24/7.

## 5) TikTok verification endpoints

Aktualne endpointy i pliki weryfikacyjne:

- Webhook API: `/api/tiktok/webhook` (obsługa challenge + podpisu)
- Pliki domenowe (statyczne w `public/`):

- `/tiktokssJ4FaBZj5ZZrwsRwf4lvypAO1wwKwcH.txt`
- `/tiktokLUYqjkeTYqRBFe3zn6FkLfkrbHkGJhrJ.txt`
- `/tiktok6TdUcTHOVj7ZVJyqNEDoGhvIP5hpPzAZ.txt`

Uwaga: nazwy plików muszą być identyczne z tymi wymaganymi w panelu TikTok.

## 6) Diagnostyka

Szybki test API:

```bash
curl http://localhost:3000/api/videos
```

Odpowiedź `401` bez tokena jest poprawna.

### Turbopack panic (Windows)

Jeśli podczas `next dev` pojawia się panic w stylu:

`inner_of_uppers_lost_follower ... turbo-tasks-backend ...`

to jest to błąd wewnętrzny Turbopack, a nie logiki aplikacji.

Zalecane uruchamianie lokalne (stabilne):

```bash
npm run dev
```

Ten projekt ma domyślnie ustawiony Webpack w skrypcie `dev`.

Tryb testowy Turbopack (opcjonalnie):

```bash
npm run dev:turbo
```

Szybkie recovery po panic:

```powershell
if (Test-Path .next) { Remove-Item -Recurse -Force .next }
npm run dev
```

## 7) Checklista deployu (Vercel + Supabase)

1. Uzupełnij zmienne środowiskowe (`.env.example` jako szablon).
2. Ustaw `CRON_SECRET` i `TIKTOK_WEBHOOK_SECRET`.
3. Sprawdź redirect URI OAuth (Google/TikTok) 1:1 z produkcją.
4. Wykonaj `prisma migrate deploy` (lub `prisma db push` dla środowiska MVP).
5. Zweryfikuj endpoint `/api/health`.
6. Zweryfikuj cron `/api/cron/publish` i statusy jobów.
7. Zweryfikuj TikTok webhook i pliki domenowe `.txt`.
8. Po wdrożeniu sprawdź panel admin jobów: `/admin/jobs`.
# socialApp

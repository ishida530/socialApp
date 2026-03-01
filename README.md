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

Uwagi:
- `NEXT_PUBLIC_API_URL` dla fullstack Next powinno pozostać ustawione na `/api`.
- Dla lokalnego callbacku TikTok redirect zwykle to: `http://localhost:3000/social-accounts/callback/tiktok`.
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

## 5) TikTok verification endpoints

Endpointy weryfikacyjne są obsługiwane przez route handlers w `app/...txt/route.ts`.
Po uruchomieniu aplikacji są dostępne pod:

- `/tiktokssJ4FaBZj5ZZrwsRwf4lvypAO1wwKwcH.txt`
- `/tiktokLUYqjkeTYqRBFe3zn6FkLfkrbHkGJhrJ.txt`
- `/tiktok6TdUcTHOVj7ZVJyqNEDoGhvIP5hpPzAZ.txt`

## 6) Diagnostyka

Szybki test API:

```bash
curl http://localhost:3000/api/videos
```

Odpowiedź `401` bez tokena jest poprawna.
# socialApp

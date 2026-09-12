# Postfly — log błędów

> Każdy znaleziony błąd (podczas realizacji zadania, zgłoszony przez QA albo zauważony ręcznie) trafia tu jako osobny wpis **zanim** ktokolwiek go naprawi — zgodnie z `docs/postfly-plan-wykonania.md`, sekcja 3.7.
>
> Twarda zasada: żaden hotfix nie leci commitem, dopóki nie istnieje test, który najpierw czerwono potwierdza błąd. Kolejność zawsze: (1) wpis tutaj, (2) test odtwarzający błąd — uruchomiony i potwierdzony jako failujący, (3) poprawka kodu, (4) ten sam test ponownie — zielony, (5) jeden commit/PR z testem i poprawką razem, z ID błędu w opisie (`fix(scope): opis (BUG-NNN)`).

## Szablon wpisu

```
## BUG-NNN
Zgłoszony: data
Kontekst: przy jakim zadaniu/akcji wykryty
Opis: co się dzieje, czego się oczekiwało
Kroki reprodukcji: 1, 2, 3...
Status: [ ] test napisany (czerwony) → [ ] poprawka wdrożona (test zielony) → [ ] zamknięty (PR #...)
```

---

## BUG-001
Zgłoszony: 2026-09-12
Kontekst: weryfikacja TASK-1.1.1 (środowisko testowe bez dostępu do prawdziwych tokenów) — uruchomienie `npm run build && npm run start` lokalnie, żeby powtórzyć dokładnie to, co robi CI, przed przepuszczeniem testów e2e.
Opis: `next build`/`next start` uruchomione lokalnie bez jawnie ustawionego `NODE_ENV` domyślnie wchodzą w tryb `production`. Next.js w tym trybie ładuje `.env.production.local` z **wyższym priorytetem niż `.env`** (wbudowana kolejność Next.js: `.env.production.local` > `.env.local` > `.env.production` > `.env`). Na tej maszynie deweloperskiej istnieje `.env.production.local` (artefakt `vercel env pull`) z prawdziwymi sekretami produkcyjnymi — realnym `DATABASE_URL` do produkcyjnego Supabase, `STRIPE_SECRET_KEY=sk_live_...`, prawdziwymi client secretami OAuth. Efekt: lokalny serwer uruchomiony do "zwykłego" testowania e2e faktycznie łączył się z **prawdziwą bazą produkcyjną**, nie z lokalnym Dockerem — dokładnie ryzyko, przed którym ma chronić sekcja 3 `postfly-plan-projektu.md`. Objaw uboczny, który doprowadził do znalezienia: `tests/e2e/account-deletion.spec.ts`, `tiktok-consent.spec.ts`, `tiktok-creator-info-error.spec.ts` failują, bo tworzą testowego użytkownika w LOKALNEJ bazie (przez Prisma w procesie Playwrighta, który ładuje tylko `.env`), a serwer, do którego się łączą, sprawdza sesję w bazie PRODUKCYJNEJ — użytkownik tam nie istnieje, `/auth/me` poprawnie zwraca 401, strona przekierowuje na `/login`.
Zweryfikowany brak szkód: wszystkie żądania, które dotarły do produkcyjnie podłączonego serwera, były odczytami (`/api/health`, nieudane `/auth/me`) — żaden test nie doszedł do faktycznego zapisu/usunięcia (test usuwania konta failował na etapie logowania, przed kliknięciem przycisku usuwania). Serwer zatrzymany natychmiast po ustaleniu przyczyny.
Kroki reprodukcji:
1. Mieć w korzeniu repo `.env.production.local` z realnym `DATABASE_URL` (np. przez `vercel env pull --environment=production`).
2. `npm run build && npm run start` (bez ustawiania `NODE_ENV`).
3. `curl http://localhost:3000/api/health` → `database: "ok"` łączy się z bazą z `.env.production.local`, nie z `.env`.
Status: [x] test napisany (czerwony) → [x] poprawka wdrożona (test zielony) → [ ] zamknięty (PR #...)

## BUG-002
Zgłoszony: 2026-09-12
Kontekst: znalezione przy weryfikacji BUG-001 — po naprawieniu problemu z bazą produkcyjną, `tests/e2e/account-deletion.spec.ts` dalej failuje, nawet przy w pełni poprawnej, spójnej konfiguracji (serwer i proces testowy wskazujące na tę samą lokalną bazę `flowstate`, tryb `next dev`).
Opis: test nawiguje na `/account` po ustawieniu ciasteczka sesji (`context.addCookies` z tokenem z `issueAccessToken`, użytkownik utworzony bezpośrednio przez Prisma) — oczekuje przycisku "Chcę usunąć konto", ale strona przekierowuje z powrotem na `/login` (AccountPage's `useEffect` widzi `isAuthenticated=false` po bootstrapie `/auth/me`). Dokładnie ten sam wzorzec cookie-bypass działa poprawnie gdzie indziej (np. `tests/e2e/tiktok-consent.spec.ts` w trybie `next dev` z poprawnie dopasowaną bazą) — różnica leży prawdopodobnie w czymś specyficznym dla `/account` (layout, middleware, albo kolejność w pełnym pakiecie testów), nie w samym mechanizmie cookie-bypass. Niezweryfikowane: czy to faktyczny błąd w `app/account/page.tsx`/`contexts/auth-context.tsx`, czy w samym teście.
Kroki reprodukcji:
1. `npm run docker:up`, `npm run dev` (baza `flowstate`, zgodna z `.env` używanym przez `playwright.config.ts`).
2. `npx playwright test tests/e2e/account-deletion.spec.ts` (osobno albo w ramach pełnego `npm run test:e2e`).
3. Obserwacja: oba testy w pliku failują na `Test timeout of 45000ms exceeded` czekając na przycisk "Chcę usunąć konto" — `error-context.md` pokazuje stronę `/login`, nie `/account`.
Status: [ ] test napisany (czerwony) → [ ] poprawka wdrożona (test zielony) → [ ] zamknięty (PR #...)
Uwaga: test już istnieje i już jest czerwony (sam siebie potwierdza) — nie jest to zadanie z Etapu 1 (`postfly-plan-wykonania.md` sekcja 2), więc naprawa czeka na decyzję właściciela produktu co do priorytetu.

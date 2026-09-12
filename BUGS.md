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

## BUG-002 (zamknięty — nie jest błędem aplikacji)
Zgłoszony: 2026-09-12
Kontekst: znalezione przy weryfikacji BUG-001 — `tests/e2e/account-deletion.spec.ts` failował konsekwentnie pod `next dev`.
Opis (pierwotne podejrzenie): test nawiguje na `/account` po ustawieniu ciasteczka sesji — oczekuje przycisku "Chcę usunąć konto", ale strona przekierowuje na `/login`.
Diagnoza (instrumentacja `page.on('response')`): `GET /api/auth/me` zwracał **404**, nie 401 — to nie błąd autoryzacji, tylko wyścig kompilacji trasy w `next dev` (serwer jeszcze nie zarejestrował trasy API przy pierwszym uderzeniu, dokładnie wzorzec opisany już w `.github/workflows/test.yml`: "dev mode compiles each route on its first hit... flaked 2 of 8 E2E tests"). Potwierdzone rozstrzygająco: te same dwa testy, z identyczną bazą (lokalna `flowstate`), uruchomione przeciw `npm run build:test && npm run start:test` (build produkcyjny, bez kompilacji na żądanie) — **przechodzą, 2/2, ~11s**, zero flakowatości.
Wniosek: **nie ma błędu w `app/account/page.tsx` ani w teście** — to znany, już udokumentowany w tym repo koszt uruchamiania e2e przeciw `next dev` zamiast przeciw buildowi produkcyjnemu. Powiązane z TASK-1.3.5 z backlogu (poza zakresem Etapu 1 w kolejności z `postfly-plan-wykonania.md`) — lokalne e2e powinno docelowo iść przez `next build && next start`/`start:test`, tak jak już robi CI.
Kroki reprodukcji (dev mode, failuje):
1. `npm run docker:up`, `npm run dev`.
2. `npx playwright test tests/e2e/account-deletion.spec.ts` na "zimnym" serwerze (trasa `/account`/`/api/auth/me` jeszcze nie skompilowana).
Kroki weryfikacji fixu (prod mode, przechodzi):
1. `npm run build:test && npm run start:test` (albo `npm run build && npm run start` ze spójną, lokalną bazą).
2. `npx playwright test tests/e2e/account-deletion.spec.ts` → 2 passed.
Status: [x] test napisany (czerwony pod `next dev`) → [x] potwierdzone jako nie-błąd (zielony pod build produkcyjnym, bez zmian w kodzie) → [x] zamknięty — brak PR, bo brak zmiany kodu aplikacji; nie blokuje dalszej pracy.

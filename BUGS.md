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

## BUG-003
Zgłoszony: 2026-09-12
Kontekst: TASK-3.3.1 — pierwszy realny (nie zamockowany) przebieg pełnego cyklu przez Telegram: użytkownik wysłał wideo do @Post_flyBot na produkcji, dostał podgląd z 4 platformami (Facebook/Instagram/YouTube/TikTok — wszystkie podłączone), kliknął "✅ Publikuj".
Opis: Bot odpowiedział błędem: "Nie udało się opublikować: Dla TikTok wybierz poziom prywatności publikacji w kroku przeglądu." Efekt: **żadna z 4 platform nie została opublikowana**, nie tylko TikTok — `enqueueDraftGroup` (`lib/server/publish-jobs.ts`) sprawdza `tiktokPrivacyLevel` na DRAFT jobie TikToka i zwraca błąd PRZED transakcją, która przełącza jakikolwiek job na PENDING (wszystko-albo-nic w ramach jednego wywołania). Przyczyna: `handleIncomingMedia` w `app/api/telegram/webhook/route.ts` (TASK-3.1.2) tworzy DRAFT-y przez `createDraftGroupForVideo`, ale nigdy nie ustawia `tiktokPrivacyLevel` na DRAFT jobie TikToka — mimo że dokładnie to zachowanie ("domyślny tiktokPrivacyLevel=SELF_ONLY") zostało opisane jako decyzja Architekta w logu ról TASK-3.1.2 (`docs/postfly-plan-projektu.md`) i nigdy nie zaimplementowane. Rozjazd między udokumentowaną decyzją a kodem — znaleziony dopiero przy realnym użyciu, nie przy code review.
Kroki reprodukcji:
1. Połączone konto Telegram + podłączone konto TikTok w Postfly.
2. Wyślij wideo/zdjęcie do bota → dostajesz podgląd z przyciskami.
3. Kliknij "✅ Publikuj".
4. Obserwacja: błąd o braku poziomu prywatności TikTok, zero platform opublikowanych (nie tylko TikTok).
Status: [x] test napisany (czerwony) → [x] poprawka wdrożona (test zielony) → [ ] zamknięty (PR #...)

## BUG-004
Zgłoszony: 2026-09-12
Kontekst: TASK-3.3.1 — realny test publikacji TikTok przez web (kompozytor na postfly.pl), po podmianie danych TikToka na Sandbox (target user) i potwierdzeniu, że OAuth token ma pełny scope (video.publish, video.upload). Próba ręcznej zmiany prywatności posta w kompozytorze na koncie, na którym TikTok ma wyłączony duet/stitch.
Opis: `PATCH /api/publish-jobs/drafts/[id]` (`app/api/publish-jobs/drafts/[id]/route.ts:97-99`) liczy `allowDuet`/`allowStitch`/`allowComment` wyłącznie z pól obecnych w BIEŻĄCYM body requestu (`body.tiktokAllowDuet !== false`), ignorując już zapisaną wartość na jobie (`job.tiktokAllowDuet`). Kompozytor (`TikTokSettingsPanel.tsx`) wysyła osobne PATCH-e per pole — zmiana samej rozwijanej listy "Prywatność postu" wysyła `{tiktokPrivacyLevel: "SELF_ONLY"}` bez pola `tiktokAllowDuet`. Skutek: `body.tiktokAllowDuet` jest `undefined`, `undefined !== false` daje `true`, więc endpoint traktuje duet jako włączony niezależnie od realnego stanu jobu i odrzuca zapis błędem "Na tym koncie TikTok duet jest wyłączony. Odznacz duet." — mimo że duet i tak jest już zapisany jako wyłączony. Efekt: na kontach z wyłączonym duet/stitch (częste, to ustawienie właściciela konta TikTok) nie da się w ogóle zmienić prywatności posta przez kompozytor — zablokowało to testy end-to-end TASK-3.3.1 dla TikToka.
Kroki reprodukcji:
1. Podłączone konto TikTok z wyłączonym duet (`duet_disabled: true` z `/creator_info`).
2. Utwórz draft, poczekaj aż panel ustawień TikTok ustawi domyślne wartości (w tym `tiktokAllowDuet: false`).
3. Zmień samą "Prywatność postu" w dropdownie (bez dotykania przełączników Duet/Stitch).
4. Obserwacja: `PATCH .../drafts/:id` zwraca 400 "Na tym koncie TikTok duet jest wyłączony. Odznacz duet." — zmiana prywatności nie zapisuje się.
Status: [ ] test napisany (czerwony) → [ ] poprawka wdrożona (test zielony) → [ ] zamknięty (PR #...)

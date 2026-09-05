# Procedura rollbacku i konwencja migracji bazy

Data: 2026-09-04. Powiązane: [GO_LIVE_PLAN.md](../GO_LIVE_PLAN.md), sekcja F.

## 1. Stan dzisiejszy

- Migracje Prisma: dokładnie jedna (`20260903070302_init`), czysty `CREATE TABLE`/`CREATE TYPE`/`CREATE INDEX`. Baza jest pusta.
- `vercel-build` = `prisma generate && prisma migrate deploy && next build` — migracje uruchamiają się automatycznie przy każdym buildzie na Vercelu, **przed** przełączeniem ruchu na nowy deployment.
- Crony (`vercel.json`): `/api/cron/publish`, `/api/cron/refresh-tokens`, autoryzowane `CRON_SECRET`.

## 2. Weryfikacja planu Vercel (do zrobienia przez usera, poza kodem)

Sprawdź w panelu Vercel → Project Settings → czy dostępna jest funkcja **Instant Rollback** (jednoklikowe promowanie
poprzedniego deploymentu na produkcję bez re-builda). Dostępność zależy od planu (Hobby/Pro). Jeśli niedostępna,
rollback wymaga ręcznego "Promote to Production" na wcześniejszym udanym deploymencie z listy Deployments.

## 3. Procedura rollbacku aplikacji (bez zmiany schematu bazy)

Najczęstszy przypadek: nowy deploy ma buga w kodzie, ale nie zmienił schematu bazy (albo zmiana jest w pełni
wstecznie kompatybilna — patrz sekcja 5).

1. Panel Vercel → Deployments → znajdź ostatni znany-dobry deployment.
2. Instant Rollback (jeśli dostępny) albo "..." → Promote to Production.
3. Zweryfikuj `/api/health` (200) i Sentry (brak nowych błędów) po rollbacku.
4. Zbadaj przyczynę na branchu, napraw, wdróż ponownie normalnym flow.

To nie wymaga akcji na bazie — poprzedni kod działa na tym samym (lub wstecznie kompatybilnym) schemacie.

## 4. Procedura rollbacku, gdy migracja bazy już poszła

To scenariusz, którego dziś (pusta baza, jedna migracja) nie da się jeszcze zaobserwować, ale trzeba mieć na niego
plan zanim pojawią się dane klientów:

1. **Nie cofaj migracji przez `prisma migrate resolve`/ręczne `DROP` na produkcji pod presją czasu** — to najczęstsza
   przyczyna utraty danych przy incydencie. Najpierw ustabilizuj: rollback kodu aplikacji (sekcja 3) do wersji
   sprzed migracji.
2. Jeśli migracja była zgodna z konwencją z sekcji 5 (addytywna, nullable/z default), stary kod po prostu ignoruje
   nowe kolumny/tabele — rollback kodu wystarcza, schemat może zostać jak jest.
3. Jeśli migracja usunęła/zmieniła coś, od czego zależy stary kod (naruszenie konwencji z sekcji 5) — to sytuacja
   awaryjna: przywróć brakującą kolumnę/tabelę ręczną migracją korygującą (nie edytuj istniejącego pliku migracji),
   dopiero potem rollback kodu. W skrajnym przypadku: przywrócenie z backupu (patrz sekcja D w GO_LIVE_PLAN.md) —
   stąd backup musi istnieć i być świeży *przed* każdą migracją zmieniającą istniejące tabele z danymi.
4. Po ustabilizowaniu: napisz post-mortem (co poszło nie tak, dlaczego konwencja nie wystarczyła / nie została
   zastosowana) i zaktualizuj tę procedurę.

## 5. Konwencja dla przyszłych migracji (obowiązuje od pierwszej zmiany schematu na danych produkcyjnych)

Dziś nie ma z tym problemu — baza jest pusta i cały schemat powstał w jednym kroku. To się zmieni przy pierwszej
zmianie schematu wykonanej *po* pojawieniu się w bazie danych realnych klientów. Od tego momentu:

- **Nowe kolumny**: zawsze `nullable` albo z `@default(...)`. Nigdy `NOT NULL` bez defaultu w tym samym kroku, co
  dodanie kolumny do istniejącej tabeli z danymi — to blokuje na `ACCESS EXCLUSIVE` lock i/lub failuje na istniejących
  wierszach.
- **Wymuszenie `NOT NULL`** na kolumnie, która już istnieje z danymi: osobna migracja, *po* backfillu wszystkich
  istniejących wierszy (backfill jako osobny krok/skrypt, nie w tej samej migracji co `ALTER COLUMN ... SET NOT NULL`).
- **Usuwanie kolumny/tabeli** (`DROP COLUMN`/`DROP TABLE`): nigdy w tym samym deployu, co usunięcie kodu, który jej
  używa. Kolejność: (1) deploy kodu, który przestaje *czytać* z kolumny, (2) deploy z migracją `DROP`. Odwrotna
  kolejność = błędy w trakcie deployu dla aktywnych userów (stary kod nadal czyta kolumnę, którą baza już usunęła).
- **Zmiana typu kolumny**: traktuj jak drop+add — nowa kolumna równoległa, backfill, przełączenie czytania w kodzie,
  dopiero potem usunięcie starej kolumny w kolejnym deployu.
- **Zawsze**: `prisma migrate dev` lokalnie do wygenerowania pliku migracji, code review samego SQL wygenerowanego
  przez Prisma przed mergem (nie tylko `schema.prisma`) — Prisma czasem generuje destrukcyjną migrację (np. przy
  zmianie typu enuma) tam, gdzie programista zakładał migrację addytywną.
- **Backup świeży przed każdą migracją**, która dotyka istniejących tabel z danymi (patrz sekcja D w GO_LIVE_PLAN.md
  — dziś to manualny `pg_dump`, docelowo automatyzacja przez GitHub Actions).

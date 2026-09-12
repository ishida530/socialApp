# Backup i odzyskiwanie bazy danych (TASK-1.1.2)

> Baza produkcyjna to Supabase **Free tier** — brak wbudowanych automatycznych backupów u dostawcy (to funkcja płatnego planu Pro+). Ten mechanizm istnieje, żeby to nadrobić. Backup materiałów (Vercel Blob — surowe wideo przed publikacją) jest świadomie **poza zakresem** tego zadania — patrz log ról TASK-1.1.2 w `docs/postfly-plan-projektu.md` po uzasadnienie.

## Jak to działa

`.github/workflows/backup-database.yml` (harmonogram: codziennie 05:00 UTC, plus ręczne uruchomienie przez `workflow_dispatch` na GitHubie → Actions → Backup database → Run workflow):

1. `pg_dump` przeciw `DIRECT_URL` (połączenie bezpośrednie do Supabase, **nie** przez PgBouncer pooler z `DATABASE_URL` — `pg_dump` ma z poolerem znane problemy z prepared statements).
2. Kompresja gzip.
3. Szyfrowanie AES-256-GCM osobnym kluczem (`BACKUP_ENCRYPTION_KEY`, **nie** tym samym co `ENCRYPTION_KEY` appki) — konieczne, bo Vercel Blob nie ma trybu "private + auth" per plik na planie Hobby/Pro, więc surowy dump (hashe haseł, zaszyfrowane tokeny OAuth, e-maile) nigdy nie może istnieć w formie czytelnej pod jakimkolwiek URL-em.
4. Upload do Vercel Blob pod `backups/flowstate-<timestamp>.sql.gz.enc`.
5. Usunięcie backupów starszych niż 14 dni (koszt storage nie rośnie bez końca).

Sekrety wymagane w GitHub Actions (Settings → Secrets and variables → Actions):
- `PROD_DIRECT_URL` — `DIRECT_URL` produkcji (z `.env.production.local`, port 5432, nie pooler).
- `PROD_BLOB_READ_WRITE_TOKEN` — `BLOB_READ_WRITE_TOKEN` produkcji.
- `BACKUP_ENCRYPTION_KEY` — nowy, osobny sekret, wygenerowany raz (np. `openssl rand -base64 32`), **nigdzie indziej nieużywany**. Zgubienie tego klucza = utrata możliwości odczytania istniejących backupów, więc trzymaj go też poza GitHub Actions (np. w menedżerze haseł).

## Jak odtworzyć backup

**Nigdy nie odtwarzaj na żywej bazie appki.** `scripts/restore-database.mjs` celowo wymaga zmiennej `RESTORE_TARGET_DATABASE_URL` (nie `DATABASE_URL`/`DIRECT_URL`) — to świadome zabezpieczenie przed pomyłkowym nadpisaniem produkcji czy dev.

```bash
# Z najnowszego backupu w Vercel Blob:
RESTORE_TARGET_DATABASE_URL="postgresql://..." \
BACKUP_ENCRYPTION_KEY="..." \
BLOB_READ_WRITE_TOKEN="..." \
node scripts/restore-database.mjs

# Z lokalnie pobranego pliku:
RESTORE_TARGET_DATABASE_URL="postgresql://..." \
BACKUP_ENCRYPTION_KEY="..." \
node scripts/restore-database.mjs --file=flowstate-backup.sql.gz.enc
```

## Realna weryfikacja odtworzenia — wykonana i zmierzona (2026-09-12)

Symulacja utraty danych: pełny cykl backup → odtworzenie do **świeżej, oddzielnej, jednorazowej bazy** (nigdy `flowstate`/`flowstate_test`/produkcja), przeciw lokalnemu Postgresowi (Docker), z takim samym kodem (`pg_dump`/`psql`, gzip, AES-256-GCM) jak w prawdziwym workflow.

Wynik:
- `pg_dump` + gzip + szyfrowanie: **~1.9 s**
- pobranie + deszyfrowanie + dekompresja + `psql` restore (wszystkie tabele, indeksy, dane): **~1.6 s**
- **Całość: ~3.4 s**
- Weryfikacja: liczba wierszy w `User` w bazie źródłowej i odtworzonej — **identyczna**.

Przy tej okazji znaleziony i naprawiony bug w skryptach: `DIRECT_URL`/`DATABASE_URL` w tym projekcie mają parametr `?schema=public` (konwencja Prisma) — `pg_dump`/`psql` (libpq) nie znają tego parametru URI i odrzucają całe połączenie błędem `invalid URI query parameter: "schema"`. Oba skrypty (`scripts/backup-database.mjs`, `scripts/restore-database.mjs`) usuwają ten parametr przed przekazaniem connection stringa do `pg_dump`/`psql` (`stripPrismaOnlyUrlParams`, pokryte testem w `tests/api/backup-crypto.test.ts`).

Warstwa kryptograficzna (szyfrowanie/deszyfrowanie/gzip/sanityzacja URL) ma osobny, deterministyczny test jednostkowy w `npm test` (`tests/api/backup-crypto.test.ts`) — nie wymaga `pg_dump`/`psql` na PATH, więc działa też w CI. Pełny round-trip z prawdziwym `pg_dump`/`psql` nie jest zautomatyzowany w CI (wymagałby efemerycznej drugiej bazy Postgres tylko na tę okazję) — zweryfikowany ręcznie jak wyżej, do powtórzenia przy każdej większej zmianie tych skryptów.

### Realny przebieg przeciw produkcji (2026-09-12, workflow_dispatch)

Po zmergowaniu, workflow uruchomiony ręcznie przeciw prawdziwej produkcyjnej bazie Supabase (`pg_dump` jest tylko-do-odczytu — bezpieczne). Wynik pierwszej próby: **failure** — `pg_dump: error: aborting because of server version mismatch (server version: 17.6; pg_dump version: 16.15)`. Supabase uruchamia Postgres 17, domyślny pakiet `postgresql-client` na `ubuntu-latest` to tylko 16 (pg_dump odmawia dumpowania serwera nowszego od siebie). Naprawione dwoma iteracjami:
1. Instalacja `postgresql-client-17` z oficjalnego repozytorium PGDG zamiast domyślnego apt — nie wystarczyło samo w sobie, bo runner ma już preinstalowany `pg_dump` 16 na `PATH`, a instalacja 17 obok niego nie zmienia, co znajdzie się jako pierwsze.
2. Jawne dopisanie `/usr/lib/postgresql/17/bin` na początek `PATH` przez `$GITHUB_PATH`.

Trzecia próba: **sukces.** Realny wynik: dump skompresowany do 35 837 bajtów, zaszyfrowany do 35 865 bajtów, wgrany do `https://xubvjgdishvdmu4a.public.blob.vercel-storage.com/backups/flowstate-2026-09-12T09-41-22-879Z.sql.gz.enc`, 0 starych backupów do wyczyszczenia (pierwszy przebieg). Harmonogram (05:00 UTC) od teraz będzie powtarzał dokładnie tę samą, już zweryfikowaną ścieżkę.

To jest dokładnie powód, dla którego DoD tego zadania wymagał *realnej* symulacji, nie tylko przeglądu kodu — różnica wersji Postgres między lokalnym Dockerem (16) a produkcyjnym Supabase (17) była niewidoczna przy weryfikacji lokalnej i ujawniła się dopiero przy uruchomieniu przeciw prawdziwej infrastrukturze.

## Ograniczenia świadomie zaakceptowane na tym etapie

- Backup materiałów (Vercel Blob) — brak. Ryzyko zaakceptowane: jeden użytkownik, źródłowe wideo zwykle nadal istnieje lokalnie u twórcy przed publikacją. Do rewizji, gdy `APP_MODE=commercial` z realnymi klientami.
- Retencja 14 dni, nie dłużej — wystarczające na wykrycie i odtworzenie po błędzie migracji/przypadkowym usunięciu, nie jest to archiwum długoterminowe.
- Backup jest tylko-do-odczytu względem produkcji (`pg_dump` nie modyfikuje niczego) — bezpieczny do uruchamiania dowolną liczbę razy, w tym ręcznie przez `workflow_dispatch`.

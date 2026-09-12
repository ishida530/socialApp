# Postfly — instrukcja startu w VS Code

> Wykonuj po kolei. To jest jedyny plik, który musisz mieć otwarty pierwszego dnia — reszta (`postfly-plan-projektu.md`, `postfly-backlog-sprinty.md`, `postfly-plan-wykonania.md`) trafi do repozytorium i Claude Code sam po nie sięgnie.

## Krok 0 — czego potrzebujesz przed startem

- **Node.js 22** (projekt ma już CI skonfigurowane pod tę wersję — sprawdź: `node -v`)
- **Docker Desktop** (baza Postgres + Redis lokalnie)
- **Git** zainstalowany
- **Konto GitHub** (jeśli nie masz — załóż, to będzie Twoje repo portfolio)
- **VS Code w wersji 1.94 lub nowszej**
- **Konto Anthropic** — dowolna płatna subskrypcja Claude (Pro, Max, Team) lub konto Claude Console. Nie potrzebujesz osobnego klucza API do samej pracy w VS Code.

## Krok 1 — repozytorium na GitHub

1. Wejdź na github.com → **New repository** → nazwa np. `postfly` → **Private** (na start, zmienisz na Public później jeśli chcesz to pokazywać w portfolio) → utwórz, bez README/gitignore (dodamy sami).
2. Lokalnie, w folderze z rozpakowanym kodem appki (ten, który masz — `socialApp-main`):

```bash
cd sciezka/do/socialApp-main
git init
git branch -M main
git add .
git commit -m "chore: import istniejącej bazy FlowState/Postfly"
git remote add origin https://github.com/TWOJ-LOGIN/postfly.git
git push -u origin main
```

3. **Włącz ochronę brancha `main`**: na GitHubie → Settings → Branches → Add rule → branch `main` → zaznacz "Require a pull request before merging" i "Require status checks to pass before merging" → wybierz check `test` (to jest już istniejący workflow `.github/workflows/test.yml` w projekcie — CI dla tej appki już istnieje, nie trzeba go budować od zera, tylko wymusić że nic nie wejdzie do `main` bez jego zielonego wyniku).

## Krok 2 — pliki planistyczne do repo

Skopiuj do repo, w nowym folderze `docs/plan/`:
- `postfly-plan-projektu.md`
- `postfly-backlog-sprinty.md`
- `postfly-plan-wykonania.md`

```bash
mkdir -p docs/plan
# skopiuj tam wszystkie trzy pliki
git add docs/plan
git commit -m "docs: plan projektu, backlog i protokół wykonania"
git push
```

## Krok 3 — lokalne środowisko

```bash
npm install
cp .env.example .env
# uzupełnij .env: sekrety OAuth (na start możesz zostawić puste - potrzebne dopiero w Fazie C+)
npm run docker:up
npm run prisma:generate
npx prisma db push --schema prisma/schema.prisma
npm run dev
```

Sprawdź: `http://localhost:3000` działa lokalnie. Jeśli tak — fundament stoi, możesz przejść dalej.

### Krok 3.1 — środowisko testowe (osobna baza, TASK-1.1.1)

Testy (`npm test`, `npm run test:e2e`) **nigdy** nie używają bazy deweloperskiej ani prawdziwych sekretów OAuth — patrz `docs/postfly-plan-projektu.md` sekcja 3. Jednorazowo:

```bash
cp .env.test.example .env.test
# .env.test.example ma już poprawny DATABASE_URL na osobną bazę flowstate_test —
# nie kopiuj tu sekretów OAuth z własnego .env, mają zostać puste.
npm run prisma:migrate:test
```

Jeśli `npm run docker:up` uruchomiłeś **przed** tą zmianą (kontener Postgres miał już istniejący wolumen), baza `flowstate_test` nie powstanie automatycznie — załóż ją ręcznie jednym poleceniem:

```bash
docker exec flowstate-postgres psql -U postgres -c "CREATE DATABASE flowstate_test;"
```

Od tego momentu `npm test`/`npm run test:e2e` piszą wyłącznie do `flowstate_test`, a każda próba realnego połączenia z platformą OAuth (Google/TikTok/Meta) w procesie testowym kończy się błędem — nawet gdybyś przez pomyłkę wkleił prawdziwy token do `.env.test`.

## Krok 4 — Claude Code w VS Code

1. Otwórz folder projektu w VS Code (`code .` w terminalu, w folderze repo).
2. `Ctrl+Shift+X` (Windows/Linux) lub `Cmd+Shift+X` (Mac) → wyszukaj **"Claude Code"** → **Install**.
3. Kliknij ikonę iskry (Spark) w prawym górnym rogu edytora, gdy masz otwarty jakikolwiek plik — otworzy się panel Claude Code.
4. Zaloguj się swoim kontem Anthropic (przycisk **Sign in**, autoryzacja w przeglądarce).
5. Ustaw tryb pracy na **Manual** lub **Plan** (nie Auto) na start — chcesz widzieć i zatwierdzać każdą zmianę, dopóki nie zbudujesz zaufania do tego, jak Claude Code pracuje na tym konkretnym projekcie. Kliknij wskaźnik trybu na dole okna promptu, żeby zmienić.

## Krok 5 — pierwsza sesja: dokładny prompt startowy

Wklej to jako pierwszą wiadomość do Claude Code (dostosuj **tylko** jeśli coś w Twoim repo się różni):

```
Pracujesz nad projektem Postfly. Zanim zrobisz cokolwiek:

1. Przeczytaj docs/plan/postfly-plan-wykonania.md w całości — to jest protokół pracy,
   którego masz się trzymać (etapowanie, ciągłość między sesjami, konwencja Gita).
2. Przeczytaj docs/plan/postfly-plan-projektu.md sekcja 0 i 0.1 — role, przez które
   masz przechodzić (PO, Architekt, Inżynier, QA) i zasada komunikacji między nimi
   przez pisemne artefakty.
3. Przeczytaj docs/plan/postfly-backlog-sprinty.md — pełna lista zadań.

Zacznij WYŁĄCZNIE od Etapu 1 opisanego w postfly-plan-wykonania.md, sekcja 2 — czyli
TASK-1.1.1 do TASK-3.3.1 w tej dokładnej kolejności. Nic z EPIC 4 wzwyż.

Dla pierwszego zadania (TASK-1.1.1): przejdź przez rolę Product Ownera i napisz
backlog + kryterium ukończenia (DoD) w sekcji "Log ról" zgodnie z szablonem z
głównego planu. Zatrzymaj się i pokaż mi ten backlog do akceptacji, zanim przejdziesz
do roli Architekta.

Pracuj w małych krokach zgodnie z sekcją 3 protokołu wykonania — jeden branch,
jeden PR, jeden test, jedno zadanie na raz. Zaktualizuj PROGRESS.md po każdym
zamkniętym zadaniu, a CURRENT_TASK.md na bieżąco w trakcie pracy (sekcja 3.6).
Każdy znaleziony błąd loguj najpierw w BUGS.md z testem go potwierdzającym,
zanim go naprawisz (sekcja 3.7) — zacznij od TASK-1.1.0, które tworzy oba pliki.
```

6. Claude Code pokaże Ci plan (jeśli tryb Plan) albo zapyta o zgodę na każdą zmianę (tryb Manual) — czytaj, zanim zaakceptujesz.

## Krok 6 — jak wygląda dalsza praca

- **Chcesz sprawdzić czym Claude Code zajmuje się właśnie teraz?** Otwórz `CURRENT_TASK.md` w repo — nadpisywany na bieżąco, pokazuje aktualny krok, nie trzeba czekać aż skończy całe zadanie.
- **Błąd znaleziony w trakcie pracy nie jest naprawiany od razu.** Trafia najpierw do `BUGS.md` z krokami reprodukcji, potem dostaje test (uruchomiony i potwierdzony jako czerwony), dopiero wtedy poprawkę i commit. Jeśli zobaczysz w `BUGS.md` wpis bez zaznaczonego "test napisany" a mimo to kod się zmienił — to znak, że coś poszło niezgodnie z protokołem, warto zapytać Claude Code dlaczego.
- Każde zadanie kończy się **Pull Requestem** na GitHubie (nie bezpośrednim commitem do `main`) — otwórz go w przeglądarce, przeczytaj opis (sekcje PO/Architekt/QA wypełnione zgodnie z szablonem z `postfly-plan-wykonania.md` sekcja 5.3), sprawdź że CI jest zielone, dopiero wtedy **Merge**.
- Jeśli sesja w VS Code się urwie (zamkniesz laptopa, zabraknie kontekstu) — po prostu otwórz nową sesję Claude Code i napisz: *"Przeczytaj PROGRESS.md i kontynuuj zgodnie z protokołem z postfly-plan-wykonania.md"*. Reszta dzieje się zgodnie z sekcją 3.3 tego protokołu — nowa sesja sama zweryfikuje stan przed kontynuacją.
- Po każdym zadaniu **Ty** decydujesz czy iść dalej, czy się zatrzymać — Claude Code ma zatrzymać się po Etapie 1 i czekać na Twoją zgodę (masz to wpisane w plan wykonania), ale możesz też przerwać wcześniej w dowolnym momencie, po prostu mówiąc "zatrzymaj się tutaj".

## Krok 7 — koniec Etapu 1

Gdy TASK-3.3.1 jest zamknięty (pełny cykl upload → potwierdzenie → publikacja działa przez Telegram) — **używaj appki realnie przez 2-3 tygodnie**, zanim wrócisz do tego samego okna Claude Code i napiszesz: *"Zacznij Etap 2, zgodnie z postfly-plan-wykonania.md sekcja 4"*. To jest świadomie oddzielone od Etapu 1 — nie kontynuuj automatycznie.

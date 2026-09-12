# Postfly — plan wykonania etapowego + ciągłość pracy

> Ten plik mówi Claude Code **w jakiej kolejności i jak dużymi krokami** pracować nad `postfly-backlog-sprinty.md`, oraz co robić, gdy sesja się zawiesi albo skończy się kontekst w trakcie pracy. Czytaj ten plik jako pierwszy, przed backlogiem, na początku **każdej** sesji.

## 1. Zasada nadrzędna: Etap 1 daje działającą appkę, reszta wraca później

Backlog w `postfly-backlog-sprinty.md` ma 10 epików — to jest mapa docelowa, nie plan na pierwszy tydzień. Pracujemy w dwóch etapach:

- **Etap 1 — wąski, konkretny cel: działający cykl end-to-end, jak najszybciej.** Nie cały EPIC 1-3, tylko wybrane zadania z nich (lista w sekcji 2 niżej). Po Etapie 1 masz appkę, której realnie używasz do publikowania, nawet jeśli uproszczoną.
- **Etap 2+ — powrót do pełnego backlogu**, w kolejności EPIC-ów, z uwzględnieniem tego, czego się nauczyłeś używając Etapu 1 na żywo. Nic z EPIC 4 wzwyż nie zaczyna się przed zamknięciem Etapu 1 i co najmniej 2 tygodni realnego użycia.

## 2. Zakres Etapu 1 (skrócona lista z backlogu)

Tylko te zadania, w tej kolejności. Wszystko inne z EPIC 1-3 zostaje na Etap 2.

1. TASK-1.1.1 — środowisko testowe bez prawdziwych tokenów (bez tego nic dalej się nie zaczyna)
2. TASK-1.2.1 — naprawa bugu ginącej treści
3. TASK-1.1.2 — backup przetestowany (wersja minimalna: jeden ręczny test odtworzenia wystarczy na Etap 1, pełna automatyzacja to Etap 2)
4. TASK-3.1.1 — powiązanie konta Telegram z użytkownikiem
5. TASK-3.1.2 — webhook Telegram (na start: może wołać istniejący `/api/cron/publish`/`enqueue` bezpośrednio, **bez** BullMQ — TASK-2.1.1 z pełną kolejką to Etap 2, akceptujemy na razie cron raz dziennie)
6. TASK-3.2.1 — tylko te komendy: `/status`, `/pause`, `/approve`, `/reject` (reszta komend: Etap 2)
7. TASK-3.3.1 — test pełnego cyklu: upload → potwierdzenie → publikacja przez Telegram

**Definicja "działająca appka" po Etapie 1:** wysyłasz plik do bota, dostajesz podgląd z pytaniem o zgodę, klikasz zatwierdź, treść publikuje się na przynajmniej jednej platformie następnego dnia (limit crona akceptowany na tym etapie). To wystarczy, żeby zacząć realnie używać appki — reszta to usprawnienia, nie warunek startu.

**Po zamknięciu Etapu 1: zatrzymaj się i czekaj na potwierdzenie użytkownika przed rozpoczęciem Etapu 2.** Nie kontynuuj automatycznie do EPIC 2 (BullMQ) czy dalej — to świadoma decyzja właściciela produktu, nie coś do zgadnięcia.

## 3. Protokół ciągłości pracy (na wypadek zawieszenia sesji / braku kontekstu)

Sesje Claude Code mogą się urwać w połowie — zabraknie kontekstu, połączenie się zerwie, cokolwiek. Ten protokół ma sprawić, że **strata przy urwaniu to maksymalnie jedno zadanie, nigdy cały etap**.

### 3.1 Plik stanu `PROGRESS.md`

Trzymany w repo, aktualizowany **po każdym pojedynczym zadaniu**, nie po całym sprincie. Zawiera zawsze:

```
Ostatnio ukończone zadanie: TASK-X.Y.Z
Stan builda: przechodzi / nie przechodzi
Następne zadanie w kolejce: TASK-X.Y.Z
Blokery/niedokończone wątki: (opisz albo napisz "brak")
Data/godzina ostatniej aktualizacji: ...
```

### 3.2 Zasada małych kroków

Jedno zadanie na raz. **Żadne zadanie nie jest zamknięte bez testu** — sam przechodzący build to za mało. Każde zadanie musi mieć test odpowiedni do jego typu (unit dla logiki, integracyjny dla endpointu API, e2e dla flow użytkownika typu "upload → publikacja") dodany **w tym samym commicie/PR co funkcjonalność**, nie "dopiszę testy później". Po każdym zadaniu: `npm run build` + testy → jeśli przechodzi → commit wg konwencji z sekcji 5 → PR → aktualizacja `PROGRESS.md` → dopiero wtedy checkbox w backlogu na "zrobione". Nigdy nie zaczynaj kolejnego zadania z niezacommitowanymi zmianami z poprzedniego.

**Testy e2e (Playwright) uruchamiane lokalnie zawsze z widoczną przeglądarką** (`headed`, nie `headless`) — masz widzieć na żywo co się dzieje na ekranie, nie tylko czytać wynik w terminalu. W CI (`.github/workflows/test.yml`) zostaje `headless`, bo runner nie ma ekranu — to rozróżnienie jest celowe, nie niespójność.

**Twarda blokada: jeśli e2e (albo jakikolwiek inny test) faliluje, nie przechodzisz do kolejnego zadania z backlogu.** Naprawa failującego testu ma pierwszeństwo przed czymkolwiek nowym — zgodnie z zasadą test-najpierw z sekcji 3.7, jeśli to jest błąd (nie tylko niedokończona implementacja), loguje się go do `BUGS.md` zanim się go naprawi. Zielony test to warunek wejścia do następnego zadania, nie coś do poprawienia "przy okazji później".

### 3.3 Start każdej nowej sesji — zawsze w tej kolejności

1. Przeczytaj `PROGRESS.md`.
2. **Nie ufaj mu bezkrytycznie** — sesja mogła urwać się w trakcie jego zapisywania. Uruchom `npm run build` i testy, zanim uznasz cokolwiek za potwierdzone.
3. Jeśli stan builda w pliku i stan rzeczywisty się nie zgadzają → coś urwało się w połowie ostatniego zadania. Dokończ/napraw dokładnie to jedno zadanie, zanim ruszysz dalej — nie zakładaj, że było "prawie gotowe".
4. Jeśli `PROGRESS.md` nie istnieje (pierwsza sesja) → zacznij od TASK-1.1.1.
5. Kontynuuj od "Następne zadanie w kolejce".

### 3.4 Prosty agent nadzorujący (watchdog) — nie proces w tle, tylko nawyk na start sesji

Nie da się uruchomić czegoś "w tle" między sesjami Claude Code — więc rolę strażnika pełni krok 3.1-3.3 wykonywany **za każdym razem** na starcie, bez wyjątków, nawet jeśli poprzednia sesja "na pewno" skończyła się poprawnie. To jest tańsze niż ryzyko cichego rozjazdu między tym co plik mówi, a tym co faktycznie jest w repo.

### 3.5 Co robić, gdy zadanie jest za duże na jedną sesję

Jeśli w trakcie realizacji zadania widać, że nie zmieści się w rozsądnym kontekście jednej sesji — **nie próbuj go dokończyć na siłę**. Zatrzymaj się w najbliższym bezpiecznym punkcie (kod się kompiluje, nawet jeśli funkcja niepełna), zapisz w `PROGRESS.md` dokładnie co zostało zrobione i co zostało, oznacz zadanie jako "częściowo — patrz notatka" zamiast "zrobione". Kolejna sesja dokończy od tego punktu, nie od zera.

### 3.6 Status pracy w czasie rzeczywistym — `CURRENT_TASK.md`

To nie jest to samo co `PROGRESS.md`. `PROGRESS.md` zapisuje stan **po zamknięciu** zadania (do wznawiania sesji). `CURRENT_TASK.md` pokazuje co dzieje się **teraz, w trakcie** — nadpisywany na bieżąco, żebyś mógł w każdej chwili zajrzeć i zobaczyć, czym Claude Code faktycznie się zajmuje, bez czekania aż skończy.

Aktualizowany na początku każdego znaczącego kroku (nie tylko raz na zadanie) — rozpoczęcie implementacji, uruchomienie testów, pisanie PR-a to osobne aktualizacje, nie jedna na cały TASK. Zawsze nadpisuje poprzednią treść, nie dopisuje historii — to jest zdjęcie bieżącego stanu, nie log.

```
Zadanie: TASK-X.Y.Z
Rola: PO / Architekt / Inżynier / QA
Aktualny krok: (np. "implementacja endpointu", "pisanie testu regresyjnego", "czekam na wynik build")
Plik(i) w edycji: ...
Rozpoczęto krok: GG:MM
Ostatnia aktualizacja: GG:MM
```

Gdy zadanie się zamyka, `CURRENT_TASK.md` czyści się do stanu "brak aktywnego zadania" — trwały zapis tego, co zrobiono, żyje w `PROGRESS.md` i historii Gita, nie tutaj.

### 3.7 Błędy tylko przez testy — `BUGS.md`

Osobny plik od `PROGRESS.md`/`CURRENT_TASK.md`. Każdy znaleziony błąd (czy to podczas realizacji zadania, czy zgłoszony przez QA, czy zauważony przez Ciebie) trafia tu jako osobny wpis, **zanim** ktokolwiek go naprawi:

```
## BUG-NNN
Zgłoszony: data
Kontekst: przy jakim zadaniu/akcji wykryty
Opis: co się dzieje, czego się oczekiwało
Kroki reprodukcji: 1, 2, 3...
Status: [ ] test napisany (czerwony) → [ ] poprawka wdrożona (test zielony) → [ ] zamknięty (PR #...)
```

**Twarda zasada: żaden hotfix nie leci commitem, dopóki nie istnieje test, który najpierw czerwono potwierdza błąd.** Kolejność zawsze: (1) wpis w `BUGS.md`, (2) test odtwarzający błąd — uruchomiony i **potwierdzony jako failujący** (nie zgadywany), (3) dopiero teraz poprawka kodu, (4) ten sam test uruchomiony ponownie — zielony, (5) jeden commit/PR zawierający i test, i poprawkę razem, z ID błędu w opisie (`fix(scope): opis (BUG-NNN)`, konwencja z sekcji 5.2). Bez czerwonego testu na starcie nie ma pewności, że poprawka faktycznie coś naprawiła, a nie tylko przesunęła problem gdzie indziej.

## 4. Kiedy wracamy do pełnego backlogu

Po Etapie 1 i realnym użyciu appki (rekomendacja z poprzedniej rozmowy: 2-3 tygodnie) wracasz do tego dokumentu i mówisz Claude Code: "zacznij Etap 2, EPIC 2 Sprint 2.1" — od tego miejsca backlog w `postfly-backlog-sprinty.md` prowadzi dalej w swojej oryginalnej kolejności, z pełnym protokołem ciągłości z sekcji 3 obowiązującym tak samo jak w Etapie 1.

## 5. Konwencja Git — praca jak w software house

Ten projekt ma wyglądać w historii Gita jak praca zespołu, który wie co robi — bo to jest Twoje portfolio, nie tylko działający kod. Poniższe zasady obowiązują od pierwszego commita.

### 5.1 Branch i main

`main` jest chroniony — **nigdy** bezpośrednich commitów. Każde zadanie to osobny branch: `feat/TASK-X.Y.Z-krotki-opis` (nowa funkcja), `fix/TASK-X.Y.Z-krotki-opis` (naprawa), `chore/...` (porządki/config). Merge do `main` tylko przez Pull Request, tylko gdy CI z EPIC 1 (TASK-1.3.1) jest zielone.

### 5.2 Commity — Conventional Commits

Format: `typ(zakres): krótki opis (TASK-X.Y.Z)`. Przykład: `feat(telegram): powiązanie konta użytkownika (TASK-3.1.1)`, `test(publish-jobs): regresja na ginącą treść (TASK-1.2.1)`, `fix(cron): naprawa refresh tokenów (TASK-1.1.1)`. Typy: `feat`, `fix`, `test`, `docs`, `chore`, `refactor`. Commit bez ID zadania nie powinien się zdarzyć — to jedyny sposób, żeby historia dała się później przeczytać jako opowieść o tym, jak appka powstawała.

### 5.3 Pull Request jako recenzja, nawet solo

Mimo że projekt robisz sam (z Claude Code), PR ma pełnić realną rolę code review — role z sekcji 0 głównego planu (Architekt, QA) piszą swoją ocenę **w opisie PR**, nie tylko w `PROGRESS.md`. Szablon opisu PR:

```
## Co się zmieniło
(krótko, po ludzku)

## Zadanie
TASK-X.Y.Z — link do sekcji w backlogu

## DoD — czy spełnione
- [ ] kryterium 1 z backlogu
- [ ] kryterium 2 z backlogu

## Testy
Jakie dodano, co pokrywają

## Architekt — ocena skalowalności
(zgodnie z sekcją 9 głównego planu, jeśli dotyczy)

## QA — niezależna weryfikacja
Kroki którymi sprawdzono, wynik
```

Warto zapisać ten szablon w repo jako `.github/PULL_REQUEST_TEMPLATE.md`, żeby wypełniał się automatycznie przy każdym nowym PR.

### 5.4 Merge i historia

Squash merge do `main` — każdy PR to jeden czysty commit w głównej historii, z tytułem PR jako opisem. Efekt: historia `main` czyta się jak lista zadań wykonanych po kolei, a nie chaos "fix", "fix2", "jeszcze raz fix" — dokładnie to, co dobrze wygląda w portfolio.

### 5.5 Tagi i CHANGELOG

Po zamknięciu każdego EPIC-u z `postfly-backlog-sprinty.md`: tag wersji (`v0.1.0` po EPIC 1, `v0.2.0` po EPIC 2, itd. — semantic versioning) i wpis w `CHANGELOG.md` (sekcja per wersja, lista zamkniętych zadań). To daje appce czytelną historię rozwoju, którą możesz pokazać w rozmowie rekrutacyjnej jako dowód procesu, nie tylko końcowy efekt.

### 5.6 README jako wizytówka

`README.md` (już częściowo istnieje w projekcie) ma na górze: krótki opis czym jest Postfly (możesz oprzeć się na `postfly-opis-aplikacji.md`), badge statusu CI z TASK-1.3.1, i link do `postfly-plan-projektu.md` jako dokumentacji architektury — żeby ktoś przeglądający repo od razu widział, że to przemyślany projekt, nie zbiór commitów bez kontekstu.

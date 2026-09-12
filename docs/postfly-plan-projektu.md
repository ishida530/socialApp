# Postfly (postfly.pl) — plan wdrożenia

> Plik roboczy do pracy z Claude Code w VS Code. Fundamentem projektu jest istniejąca aplikacja (kod roboczo nazywany "FlowState"/"socialApp") — nie budujemy od zera, tylko dokładamy brakujące warstwy. Nazwa produktu docelowo: **Postfly**, domena: **postfly.pl**.

## 0. Zespół wykonawczy — role dla Claude Code

Ten projekt nie jest wykonywany jako jedna ciągła sesja kodowania. Dla **każdej fazy** z sekcji 6, Claude Code przechodzi przez cztery role po kolei, w tej kolejności, i nie przechodzi do następnej roli dopóki poprzednia nie zamknie swojej części pisemnie w tym pliku (sekcja "Log ról" na końcu każdej fazy).

### Rola 1 — Product Owner
**Zadanie:** przed rozpoczęciem implementacji fazy, przeanalizuj aktualny stan repozytorium względem sekcji 2 (co gotowe) i 4 (delta). Napisz dokładny backlog zadań na tę fazę z jawnym **kryterium ukończenia (Definition of Done)** dla każdego zadania — nie ogólnikiem typu "zrobione", tylko konkretnym testem: co ma zwrócić endpoint, jaki stan ma mieć baza, jaki komunikat ma zobaczyć użytkownik. Zadanie bez jawnego DoD wraca do przepisania, zanim trafi do Architekta.
**Zakaz:** PO nie pisze kodu i nie podejmuje decyzji architektonicznych — tylko definiuje *co* ma powstać i *skąd wiadomo, że działa*.

### Rola 2 — Software Architect
**Zadanie:** przed implementacją, przejrzyj backlog od PO pod kątem skalowalności i długu technicznego (patrz sekcja 9 — masz tam już konkretne wzorce do stosowania). Dla każdego zadania odpowiedz: czy rozwiązanie przetrwa 10x więcej użytkowników i 10x więcej publikacji dziennie bez przepisywania od zera? Jeśli nie — zaproponuj zmianę podejścia PRZED implementacją, nie po. Architekt ma prawo odrzucić lub zmodyfikować zadanie PO, ale nie dodaje nowego zakresu spoza sekcji 4 bez wyraźnego zapytania Ciebie.
**Zakaz:** Architekt nie implementuje — tylko projektuje i zatwierdza podejście.

### Rola 3 — Senior Software Engineer
**Zadanie:** implementuje wyłącznie zadania zaakceptowane przez Architekta, trzymając się konwencji już obecnych w repo (Prisma, `app/api/*/route.ts`, `lib/server/*`). Po każdym zadaniu: uruchamia `npm run build` i odpowiednie testy, aktualizuje `docs/workflow-status.md` (istniejący plik — kontynuuj konwencję już tam obecną), odhacza checkbox w tym dokumencie **tylko jeśli DoD z kroku PO jest spełnione i potwierdzone testem**, nie "wygląda na działające".
**Zakaz:** Inżynier nie zmienia zakresu zadania ani nie podejmuje decyzji architektonicznych bez wyjścia z powrotem do roli Architekta.

### Rola 4 — QA / Tester niezależny
**Zadanie:** nie ufa deklaracji Inżyniera "testy przechodzą" — niezależnie odtwarza kluczowe scenariusze, w tym celowo próbuje appkę złamać (przerwane połączenie w trakcie uploadu, dwa równoczesne żądania, dokładnie te przypadki brzegowe opisane w sekcji "Obsługa błędów" każdego agenta). Testuje jak użytkownik, który nie czyta dokumentacji i robi rzeczy w nieoczekiwanej kolejności. Ma prawo zawrócić zadanie do Inżyniera z konkretnym krokiem odtwarzającym problem.
**Zakaz:** QA nie naprawia kodu samodzielnie — tylko zgłasza z dowodem (krokami odtwarzającymi błąd).

**Ważne rozróżnienie — jak te role "się komunikują":** to nie są cztery osobne, równoległe AI prowadzące ze sobą dialog. To jeden Claude Code przyjmujący kolejno różne perspektywy, nigdy naraz. Komunikacja między rolami odbywa się wyłącznie przez **pisemne artefakty**, nie przez rozmowę: PO pisze backlog + DoD do Logu ról, Architekt czyta ten wpis i dopisuje pod nim swoją decyzję, Inżynier czyta oba wpisy zanim zacznie kodować, QA czyta wszystko i dopisuje wynik weryfikacji. To jest fundamentalnie inny mechanizm niż komunikacja agentów produktowych (Content/Planowanie/Publikacja/Analityka/Monetyzacja z sekcji 2), które są realnie osobnymi procesami w działającej appce i rozmawiają ze sobą asynchronicznie przez event bus (Redis) — role deweloperskie nie mają odpowiednika event busa, bo działają sekwencyjnie w jednej głowie, nie równolegle.

**Log ról (wypełniany przez Claude Code na bieżąco, per faza):**
```
Faza: ___
[PO] Backlog + DoD: ...
[Architekt] Decyzja/zmiany: ...
[Inżynier] Zaimplementowano, build/testy: ...
[QA] Niezależna weryfikacja, znalezione problemy: ...
```

---

**Faza: Etap 1 (postfly-plan-wykonania.md, sekcja 2) — pierwsze zadanie, odpowiednik startu Fazy A**
**Zadanie: TASK-1.1.0 [P0/S]** — Utworzenie `CURRENT_TASK.md` i `BUGS.md`

**[PO] Backlog + DoD:**

Zakres zadania (z `postfly-backlog-sprinty.md`): utworzyć w korzeniu repo dwa pliki stanu, `CURRENT_TASK.md` i `BUGS.md`, wg wzorców ze `postfly-plan-wykonania.md` sekcje 3.6 i 3.7, zanim ruszy jakiekolwiek inne zadanie (włącznie z TASK-1.1.1). Rozbicie na konkretne podzadania:

1. **`CURRENT_TASK.md`** w korzeniu repo, dokładnie z polami z sekcji 3.6: `Zadanie`, `Rola`, `Aktualny krok`, `Plik(i) w edycji`, `Rozpoczęto krok`, `Ostatnia aktualizacja`. Plik nadpisywany na bieżąco (nie log historii) — od razu wypełniony danymi **tego właśnie zadania** (TASK-1.1.0, rola PO), bo w momencie tworzenia pliku TASK-1.1.0 jest aktywnym zadaniem.
2. **`BUGS.md`** w korzeniu repo, ze strukturą z sekcji 3.7: nagłówek pliku + szablon wpisu `## BUG-NNN` z polami `Zgłoszony`, `Kontekst`, `Opis`, `Kroki reprodukcji`, `Status` (trzy etapy: test napisany → poprawka wdrożona → zamknięty, z numerem PR). Na starcie log jest pusty (żaden błąd jeszcze nie znaleziony) — liczy się gotowa, niezmienna struktura, nie treść.
3. Od zamknięcia TASK-1.1.0 **`CURRENT_TASK.md` musi być aktualizowany na żywo już od pierwszego kroku TASK-1.1.1** (nie dopiero po jego zakończeniu) — to jest część DoD tego zadania, nie osobne zadanie.
4. Branch: `chore/TASK-1.1.0-current-task-bugs-md`, zgodnie z konwencją sekcji 5.1 planu wykonania (nowy branch na zadanie, nigdy bezpośredni commit na `main`).

**DoD (konkretne, weryfikowalne, nie ogólnikiem):**
- `CURRENT_TASK.md` istnieje w korzeniu repo, zawiera wszystkie 6 pól z sekcji 3.6 i żadnych dodatkowych bez uzasadnienia; treść pól odpowiada faktycznie trwającej pracy nad TASK-1.1.0 w momencie commita.
- `BUGS.md` istnieje w korzeniu repo, zawiera nagłówek + szablon wpisu gotowy do użycia bez zmiany formatu przy pierwszym realnym błędzie (sprawdzian: da się skopiować szablon i wypełnić bez domyślania się brakujących pól).
- Oba pliki zcommitowane razem, jeden commit, konwencja `chore(process): utworzenie CURRENT_TASK.md i BUGS.md (TASK-1.1.0)`, PR wg szablonu z sekcji 5.3 planu wykonania.
- Test integracyjny procesu (nie automatyczny test kodu): przy starcie TASK-1.1.1, pierwszy krok Inżyniera to aktualizacja `CURRENT_TASK.md` na nowe zadanie — to potwierdza QA przy zamknięciu TASK-1.1.1, nie przy samym TASK-1.1.0.

**Uwaga PO — świadomy wyjątek od zasady testów (sekcja 3.2 protokołu wykonania):** to zadanie nie tworzy kodu produkcyjnego ani logiki biznesowej, więc wymóg "unit/integration/e2e test w tym samym PR" się nie stosuje literalnie. DoD tego zadania to istnienie i poprawność struktury dwóch plików markdown, weryfikowalne odczytem, nie automatycznym testem. Odnotowane tu jawnie, żeby Architekt/QA nie czytali braku testu jako przeoczenia.

**Uwaga PO — stan repo:** w drzewie roboczym są już niezacommitowane zmiany sprzed tej sesji (usunięte stare pliki `docs/*.md`, zmodyfikowane `tests/e2e/login-happy-path.spec.ts` i `tests/e2e/register-happy-path.spec.ts`, nowe nieśledzone `docs/postfly-*.md`). Nie są częścią zakresu TASK-1.1.0 — PO rekomenduje wyjaśnienie/rozdzielenie tego stanu (osobny commit porządkowy albo świadome zachowanie) **przed** utworzeniem nowego brancha na TASK-1.1.0, żeby branch zadania nie dziedziczył niepowiązanych zmian.

**[Architekt] Decyzja/zmiany:**

Backlog PO zaakceptowany przez użytkownika bez zmian. Ocena pod kątem sekcji 9 (bezpieczeństwo agentów) i skalowalności: nie dotyczy — to zadanie nie tworzy kodu produkcyjnego, endpointu, modelu danych ani agenta, tylko dwa pliki procesowe w korzeniu repo czytane/nadpisywane wyłącznie przez Claude Code między sesjami. Żaden z wzorców z sekcji 8 (kolejka, worker, indeksy, rate limiting, cache) ani z sekcji 9 (uprawnienia agenta, webhooki, logi, wypłaty) nie ma tu zastosowania — brak ryzyka do zaadresowania przed implementacją.

Jedyna uwaga architektoniczna: `BUGS.md` w obecnym kształcie (pojedynczy plik Markdown) wystarczy na obecną skalę (jeden developer, sekwencyjna praca). Gdyby w przyszłości liczba jednoczesnych wątków błędów urosła na tyle, że płaski plik stanie się nieczytelny, to problem do rozwiązania wtedy (np. katalog per-bug) — nie przedwczesna optymalizacja teraz (sekcja 8.8), świadomie odrzucam rozbudowę struktury na tym etapie.

Podejście PO zatwierdzone bez modyfikacji zakresu. Przekazuję do roli Inżyniera.

**[Inżynier] Zaimplementowano, build/testy:** *(oczekuje)*
**[QA] Niezależna weryfikacja, znalezione problemy:** *(oczekuje)*

---

**Definicja "gotowy projekt w 100%":** każdy checkbox w sekcjach 6 i 7 odhaczony, każdy z jawnym DoD spełnionym i potwierdzonym testem (nie deklaracją), **QA niezależnie zweryfikowało, nie tylko Inżynier**, Architekt podpisał się pod skalowalnością w sekcji 9 dla każdej nowej warstwy, i sekcja 8 (Review końcowy) przeszła bez zastrzeżeń blokujących.

## 0.1 Zespół UX/UI — równoległy tor pracy

Design to osobny, równoległy tor do sekcji 0 — trzy role, które **wzajemnie się kontrolują**, żeby żadna decyzja projektowa nie wpadła do kodu bez sprawdzenia przez kogoś innego niż jej autor.

**Zasada nadrzędna: prostota wygrywa z możliwościami.** Jeśli dodanie opcji wymaga tłumaczenia w UI, prawdopodobnie nie powinno być opcją, tylko dobrym domyślnym zachowaniem. Ta appka już ma dobry instynkt w tym kierunku — konwencja "1 ekran = 1 decyzja" z `flow-dodawania-posta-rap.md` obowiązuje jako standard dla całego panelu, nie tylko kreatora posta.

### UX Researcher
Analizuje istniejący `UX_AUDIT.md` i realne ścieżki użytkownika, identyfikuje gdzie panel wymaga zbyt wielu decyzji naraz lub pokazuje informacje, których user nie potrzebuje w danym momencie. Nie projektuje ekranów — tylko definiuje problem i priorytet.

### UI Designer
Projektuje rozwiązanie na bazie ustaleń Researchera, zgodnie z trendami 2026 dla narzędzi twórców: gęstsze, spokojniejsze layouty (bento-grid zamiast rzędów kart), tryb ciemny jako domyślny (naturalny dla narzędzia używanego wieczorem/w studiu), progresywne ujawnianie zamiast pokazywania wszystkiego naraz, mikro-animacje potwierdzające akcję (projekt już ma `framer-motion` w zależnościach — wykorzystaj, nie dokładaj nowej biblioteki). Trzyma się już istniejącego systemu tokenów kolorystycznych (`app/globals.css`, `styles/theme.css`) zamiast wprowadzać nowy.

### Design Critic (QA projektowe)
Recenzuje pracę UI Designera **zanim** trafi do Inżyniera — pod kątem: czy da się to zrozumieć bez tłumaczenia, czy nie dubluje wzorca który już gdzieś w appce wygląda inaczej, czy działa w trybie mobile (appka ma dolną nawigację fixed — każdy nowy ekran musi to uwzględniać), czy spełnia podstawową dostępność (WCAG AA — kontrast, focus states, czytelność na małym ekranie). Ma prawo odesłać projekt do poprawki z konkretnym powodem, nie ogólnikiem "mi się nie podoba".

**Workflow:** Researcher → Designer → Critic → dopiero zatwierdzony projekt trafia do roli Inżyniera z sekcji 0. Każda faza z sekcji 6, która dotyka UI, przechodzi przez ten tor równolegle do toru deweloperskiego.

## 1. Podsumowanie

**Fundament:** działający Next.js/Prisma MVP+ (~26 600 linii kodu), własny audyt techniczny ocenia go na 7.8/10. Ma już: OAuth do YouTube/TikTok/Instagram/Facebook, kreator posta z adaptacją treści per platforma, kolejkę publikacji (drafts → enqueue → cron), bibliotekę mediów, analitykę, pełny billing Stripe z planami Starter/Pro/Business, i przełącznik `APP_MODE=personal/commercial`.

**Czego dokładamy (delta, nie przebudowa):** warstwa kontroli przez Telegram, pełna autonomiczna pętla rozumowania agenta planującego, cały moduł Monetyzacji, i zmiany architektoniczne pod skalowanie (sekcja 9).

**Zasada nadrzędna: Telegram to pełny punkt kontroli**, dobudowywany nad istniejącym API. Brak reakcji na Telegramie = nie publikuj (fail-safe).

## 2. Status fundamentu — co już jest zrobione

| Obszar | Status | Gdzie w kodzie |
|---|---|---|
| Baza + infra | ✅ gotowe | Postgres/Prisma, Docker Compose, Redis |
| OAuth 4 platformy | ✅ gotowe | `app/api/social-accounts`, `app/api/auth/callback/[provider]`, auto-refresh tokenów przez `app/api/cron/refresh-tokens` |
| Kreator posta + publikacja | ✅ gotowe | `components/PostComposer.tsx` + `app/api/publish-jobs/*`, flow drafts → enqueue → cron publish |
| Biblioteka mediów | ✅ gotowe | `app/media-library`, upload przez Vercel Blob |
| Planowanie/sugestie AI | 🟡 częściowe | `app/api/campaigns/weekly-plan`, `app/api/jobs/ai-schedule`, `lib/server/smart-autopilot` |
| Analityka | 🟡 nieznany pełny zakres | `app/analytics` |
| Billing/SaaS | ✅ gotowe | Stripe, `PLAN_CATALOG`/`PLAN_LIMITS`, `APP_MODE=commercial` |
| Panel admina | ✅ gotowe | `/admin/jobs` |
| Telegram jako interfejs | ❌ brak | do zbudowania od zera |
| Pełna pętla rozumowania agenta | ❌ brak | dziś tylko heurystyki + jeden LLM call |
| Moduł Monetyzacji | ❌ brak | zero linii kodu |
| Kolejka publikacji skalowalna (BullMQ) | ❌ brak | dziś cron raz dziennie, patrz sekcja 8.1 |

## 3. Ryzyka do zaadresowania PRZED dalszą rozbudową

- [ ] **Sprawdź czy bug ginącej treści jest naprawiony** (`prompt-dla-claude-code.md` opisuje, że caption/hashtagi z kreatora nie trafiały do realnej publikacji) — fundament wszystkiego innego.
- [ ] **🔴 Krytyczne: środowisko testowe/deweloperskie nigdy nie ma dostępu do prawdziwych tokenów OAuth.** Bez tego błąd w kodzie może realnie opublikować coś na Twoim prawdziwym koncie w trakcie testowania. Testy (Inżynier, QA) działają wyłącznie na zamockowanych kontach — dokładnie tak jak już robił to własny audyt UX tej appki (`audyt.ux@postfly.test` z fałszywymi tokenami). To ma być wymuszone technicznie (osobne środowisko/baza), nie tylko umownie.
- [ ] **Proces kopii zapasowych i odzyskiwania danych** — backup bazy danych i materiałów, przetestowany realnym odtworzeniem (nie założenie "hosting pewnie to robi automatycznie"). Bez tego jeden błąd migracji może skasować dane wszystkich użytkowników bezpowrotnie.
- [ ] **Cron publikacji leci raz na dobę** — patrz sekcja 8.1, to jest teraz rozwiązywane architektonicznie, nie obchodzone.
- [ ] **`npm audit` zgłasza 8 podatności moderate** (łańcuch zależności Prisma tooling).
- [ ] **Status audytu/weryfikacji API TikTok i Meta** — sprawdź i udokumentuj. Dodatkowo: przed sprzedażą dostępu innym twórcom (Faza G) sprawdź, czy platformy mają osobne, wyższe wymagania weryfikacji dla narzędzi **odsprzedających publikację wielu różnym firmom** (SaaS resale) — inny poziom niż zwykła aplikacja na jedno konto.
- [ ] **Niespójność nazewnictwa w kodzie** ("FlowState" vs "Postfly") — do ujednolicenia w Fazie E.

## 4. Delta do zbudowania

### 4.1 Warstwa Telegram (nowy interfejs, woła istniejące API)

**Powiązanie konta Telegram z użytkownikiem (wymagane od pierwszego dnia, nie dopiero w `APP_MODE=commercial`):** jeden bot obsługuje wielu użytkowników jednocześnie, więc potrzebny jest proces łączenia — użytkownik generuje w panelu Postfly jednorazowy kod, wysyła `/start <kod>` do bota, backend zapisuje powiązanie `telegramChatId ↔ userId` (nowe pole/tabela w bazie). Każda wiadomość przychodząca od bota jest odrzucana, jeśli `telegramChatId` nie ma przypisanego użytkownika — brak powiązania nigdy nie oznacza "pokaż dane kogokolwiek", tylko brak dostępu.

Woła istniejące endpointy: `/api/videos/blob-upload`, `/api/publish-jobs/drafts`, `/api/publish-jobs/enqueue`, `/api/publish-jobs/[id]` (retry/cancel), `/api/social-accounts/[id]` (reconnect).

**Kroki:** webhook Telegram → backend → scheduler wysyła podgląd z przyciskami Publikuj/Edytuj/Anuluj → klik woła te same funkcje co web UI → brak pliku na slot = bot prosi o materiał.

**Obsługa błędów:** brak reakcji = nie publikuj, każdy błąd = wiadomość z konkretnym powodem, jeden retry automatyczny, idempotency key per zadanie (`postGroupId` już to częściowo pokrywa).

### 4.2 Rozbudowa `smart-autopilot` do pełnej pętli rozumowania

Dziś: jedno wywołanie klasyfikujące (`lib/server/smart-autopilot/llm.ts`). Do dobudowania: pętla obserwuj → planuj → działaj → sprawdź → popraw, walidacja schematu JSON, retry z poprawionym promptem (maks. 2 próby), fallback na plan domyślny.

### 4.3 Moduł Monetyzacji — kompletnie nowy

Nowe modele Prisma: `Fan`, `Sale`, `FanSubscription` (uwaga: `Subscription` jest już zajęte przez billing SaaS), `RoyaltyRegistration`, `SyncPitch`.

- **Agent fanów** — kontakty niezależne od platform (`fan.added`)
- **Agent sprzedaży** — sklep + webhook potwierdzenia płatności (`sale.completed`)
- **Agent superfanów** — subskrypcje, treść ekskluzywna (`fan_subscription.started`)
- **Agent tantiem** — rejestracja praw, split sheets (`royalty.registered`)
- **Agent sync** — pitching, tylko utwory z potwierdzonymi 100% praw (`sync.pitch.sent`)
- **Agent księgowo-podatkowy** — nie zastępuje księgowego, tylko pilnuje porządku: agreguje przychód ze wszystkich źródeł pod kątem obowiązków podatkowych (VAT/PIT), rozdziela środki firmowe od prywatnych przy `JDG`, przypomina o terminach. Każda decyzja podatkowa wymaga konsultacji z prawdziwym księgowym — agent tylko przygotowuje dane, nie doradza.
- **Agent ochrony treści** — monitoruje nieautoryzowane reuploady Twoich materiałów na innych kontach (utrata zasięgu/przychodu), zgłasza znaleziska do zatwierdzenia zanim wyśle jakiekolwiek żądanie usunięcia.
- **Agent sponsoringu/brand deals** — monitoruje wzrost zasięgu i sygnalizuje moment, w którym warto zacząć rozmowy o płatnych współpracach; pomaga w przygotowaniu wyceny na bazie realnych danych z Dashboardu.
- **Dashboard finansowy** — rozszerzony o realny obraz majątku (ile zostaje/jest reinwestowane), nie tylko sumę przychodu — agregacja wszystkich źródeł, dostępny przez `/revenue`

Każdy z tych agentów ma tę samą obsługę błędów i bramkę potwierdzenia co reszta systemu.

### 4.4 Agent społeczności (odpowiedzi na komentarze/DM)

**Wejście:** nowe komentarze i wiadomości prywatne z podłączonych platform.
**Wyjście:** wysłana odpowiedź, zdarzenie `reply.sent`.

**Kroki:**
1. Agent wykrywa nowy komentarz/DM i proponuje odpowiedź (styl dopasowany do Twojego dotychczasowego tonu wypowiedzi).
2. Wysyła na Telegram: treść pytania/komentarza + proponowaną odpowiedź + przyciski **Wyślij / Napisz własną / Ignoruj**.
3. Jeśli wybierzesz "Napisz własną" — bot czeka na Twój tekst i wysyła dokładnie to, co napiszesz, zamiast propozycji AI.
4. Dopiero po Twojej decyzji odpowiedź trafia na platformę.

**Obsługa błędów:**
- Brak reakcji przez ustalony czas → komentarz zostaje bez odpowiedzi, agent nie wysyła nic automatycznie — cisza nigdy nie oznacza zgody, zgodnie z zasadą nadrzędną z sekcji 1.
- Wiadomość zawiera treść wymagającą wrażliwej reakcji (skarga, spór, coś niejednoznacznego) → agent nie proponuje gotowej odpowiedzi, tylko przekazuje samo pytanie z oznaczeniem "wymaga Twojej własnej odpowiedzi".
- Błąd wysyłki (rate limit, platforma odrzuca) → jeden retry, potem alert z powodem.

**Uwaga:** to jedyny agent, gdzie bramka potwierdzenia dotyczy nie tylko *czy* wysłać, ale *co* dokładnie zostanie wysłane — bezpośredni kontakt z fanami to miejsce, gdzie Twoja autentyczność ma największą wartość.

**Uwaga o zmęczeniu powiadomieniami:** poranne przypomnienie, prośby o potwierdzenie, cotygodniowy raport, alerty błędów, agent społeczności, `/revenue` — to razem może być kilka-kilkanaście wiadomości dziennie. Zbyt dużo osobnych wiadomości = zaczynasz je ignorować = cały sens kontroli przez Telegram pada. Domyślne zachowanie: grupuj nie-pilne powiadomienia (status, podsumowania) w jeden poranny digest zamiast osobnych wiadomości; tylko prośby o realne działanie (publikacja, odpowiedź na komentarz) i błędy krytyczne przychodzą pojedynczo od razu. To projektuje Zespół UX/UI (sekcja 0.1) razem z tą warstwą, nie dokładane na końcu jako poprawka.

**Wykrywanie długiej nieaktywności (choroba/wypalenie):** jeśli nie ma żadnej reakcji na wiadomości przez ustalony czas (np. 5-7 dni), system **sam** ogranicza się do rzadkiego, pojedynczego pytania raz w tygodniu ("nie było Cię jakiś czas — wstrzymać wszystko na razie, czy dalej próbować?") zamiast dalej wysyłać codzienne prośby o materiał. Zasada: appka nigdy nie dokłada presji w momencie, gdy user najwyraźniej jej nie potrzebuje — cisza z Twojej strony nie oznacza "próbuj mocniej", tylko sygnał do wyciszenia się. Nie wymaga to pamiętania o ręcznym `/pause` w momencie, w którym najtrudniej o taką inicjatywę.

## 5. Telegram — komendy kontrolne

| Komenda | Działanie |
|---|---|
| `/status` | Stan agentów + najbliższe zaplanowane zadania |
| `/pause` | Wstrzymuje wszystkie automatyczne publikacje |
| `/resume` | Wznawia |
| `/approve <id>` | Zatwierdza zadanie poza standardowym oknem |
| `/reject <id>` | Odrzuca, informacja wraca do planowania |
| `/retry <id>` | Ponawia nieudaną publikację |
| `/cancel <id>` | Anuluje zaplanowane zadanie |
| `/logs` | Ostatnie błędy/zdarzenia |
| `/revenue` | Dashboard finansowy Monetyzacji |

## 6. Workflow — fazy w kolejności realizacji

Każda faza przechodzi przez PO → Architekt → Inżynier (sekcja 0) zanim checkbox zostanie odhaczony.

### Faza A — Weryfikacja i stabilizacja fundamentu
- [ ] Ustanów środowisko testowe bez dostępu do prawdziwych tokenów OAuth (patrz sekcja 3) — zrób to jako pierwszy krok, zanim ktokolwiek zacznie cokolwiek testować na Fazach B+
- [ ] Wdróż i przetestuj realnym odtworzeniem proces backupu bazy/materiałów
- [ ] Potwierdź naprawę bugu ginącej treści
- [ ] Napraw `npm audit`
- [ ] Udokumentuj status audytu API TikTok/Meta
- [ ] Decyzja architektoniczna o kolejce publikacji (patrz 8.1) zamiast tylko "akceptować czy nie" limit crona

### Faza B — Skalowalna kolejka publikacji (fundament pod Telegram i wzrost)
- [ ] Wdrożenie BullMQ na istniejącym Redis wg sekcji 8.1
- [ ] Wydzielenie workera publikacji jako osobnego procesu
- [ ] Migracja z cron-only na kolejkę zdarzeniową z zachowaniem crona jako fallbacku

### Faza C — Telegram jako warstwa kontroli
- [ ] Mechanizm łączenia konta Telegram z kontem użytkownika (kod jednorazowy + `/start`, patrz sekcja 4.1) — zbuduj to jako pierwszy krok tej fazy, wszystko inne od tego zależy
- [ ] Webhook + wszystkie komendy z sekcji 5
- [ ] Podpięcie do kolejki z Fazy B (nie bezpośrednio do starego crona)
- [ ] Test: pełny cykl upload → potwierdzenie → publikacja wyłącznie przez Telegram
- [ ] Test wielu użytkowników jednocześnie: dwa różne konta Telegram nigdy nie widzą swoich danych

### Faza D — Pełna pętla rozumowania agenta planującego
- [ ] Rozbudowa `smart-autopilot` wg sekcji 4.2
- [ ] Testy: zły JSON z LLM, brak danych

### Faza E — Monetyzacja
- [ ] Nowe modele Prisma wg sekcji 4.3
- [ ] 5 podstawowych agentów Monetyzacji + dashboard finansowy
- [ ] Agent księgowo-podatkowy (agregacja przychodu pod kątem VAT/PIT, rozdział środków firmowych/prywatnych)
- [ ] Agent ochrony treści (wykrywanie nieautoryzowanych reuploadów)
- [ ] Agent sponsoringu/brand deals (sygnalizacja gotowości do płatnych współprac)
- [ ] Dashboard finansowy rozszerzony o realny obraz majątku, nie tylko sumę przychodu
- [ ] Bramka potwierdzenia rozszerzona na wszystkie wysyłki Monetyzacji

### Faza F — Rebranding na Postfly / postfly.pl
- [ ] Ujednolicenie nazewnictwa w kodzie i dokumentach
- [ ] Domena postfly.pl (`NEXT_PUBLIC_SITE_URL`)
- [ ] Aktualizacja `STRIPE_SUCCESS_URL`/`STRIPE_CANCEL_URL`
- [ ] Branding: favicon/logo/meta tagi
- [ ] **Decyzja marketingowa:** czy Postfly komunikowany jest pod Twoją marką rapera ("zrobiłem appkę dla siebie") czy jako osobna marka z Tobą jako founder story w tle — świadoma decyzja, nie domyślna. Materiał marketingowy oparty **wyłącznie na realnych wynikach z własnego użycia** (sekcja 3 — dopiero po Fazie A-C, gdy appka faktycznie dowozi), nigdy na projekcjach czy obietnicach.

### Faza G — Produktyzacja dla innych twórców + audyt skalowania
- [ ] Pełny test onboardingu w `APP_MODE=commercial`
- [ ] RODO / polityka prywatności
- [ ] Architekt: przegląd wszystkich indeksów bazy i limitów rate-limitingu pod realny wielo-tenantowy ruch (sekcja 9)
- [ ] **Ciągłość działania bez Ciebie:** jeśli w trybie commercial appka obsługuje publikacje innych ludzi, potrzebny jest plan na wypadek Twojej niedostępności (choroba, awaria) — minimum: kto ma dostęp do infrastruktury poza Tobą, i co się dzieje z zaplanowanymi publikacjami klientów, jeśli nikt nie odpowie na alert przez dłuższy czas. Nie musi być rozwiązane w Fazie G, ale musi być świadomą decyzją, nie przeoczeniem.

### Faza H — Warstwa operacyjna (agenci utrzymujący system, nie tworzący treści)

- [ ] **Agent bezpieczeństwa/zależności** — regularny skan `npm audit`, rotacja sekretów, wykrywanie podejrzanej aktywności logowania na kontach OAuth.
- [ ] **Agent śledzący zmiany zasad platform** — monitoruje changelogi deweloperskie TikTok/Meta/YouTube (np. `developers.tiktok.com/doc/changelog`), alarmuje PRZED wygaśnięciem/zmianą API, nie po tym jak publikacja już przestanie działać.
- [ ] **Agent kosztów (FinOps)** — ciągłe monitorowanie kosztu LLM per użytkownik, hosting, Stripe fees vs przychód z subskrypcji — nie jednorazowa checklista, tylko stały dashboard z alertem gdy marża spada poniżej progu.
- [ ] **Agent DevOps/wdrożeniowy** — pilnuje bezpiecznych deploymentów i migracji bazy bez przestojów, korzysta z istniejącej konwencji `docs/rollback-i-konwencja-migracji-2026-09-04.md`, umożliwia szybki rollback.
- [ ] **Agent trendów** — patrzy na zewnątrz (jakie bity/tematy/dźwięki rosną teraz w Twojej niszy na TikToku), karmi tym agenta planującego jako inspirację, nie tylko powtarzanie Twojego dotychczasowego wzorca.
- [ ] **Agent społeczności** — wg specyfikacji z sekcji 4.4, z pełną bramką zatwierdzenia treści odpowiedzi.
- [ ] **Agent wsparcia/samopoczucia** — rozszerza mechanizm wykrywania nieaktywności z sekcji 4.1. Zauważa wzorzec (długa cisza, spadek aktywności) i pyta wprost, bez diagnozowania i bez prowadzenia rozmowy terapeutycznej — **to nie jest agent-psycholog**, tylko delikatne "zauważam ciszę, jak się trzymasz, chcesz przerwę?". Przy poważniejszych sygnałach (bardzo długa cisza, niepokojąca treść wiadomości do bota) kieruje do prawdziwego wsparcia (zaufana osoba, specjalista, telefon zaufania) zamiast próbować to zastąpić. Granica ma być techniczna, nie tylko deklaratywna — agent nie ma dostępu do żadnego "trybu terapeutycznego" w swoim prompcie, tylko do zestawu prostych, z góry zdefiniowanych pytań i linków do realnych zasobów.
- [ ] **Agent prawny** — pisze i aktualizuje Regulamin oraz Politykę Prywatności zgodnie z tym, co appka faktycznie robi (nie generyczny szablon), aktualizowane przy każdej nowej funkcji zbierającej dane osobowe (np. dane fanów w Fazie E). W `APP_MODE=commercial` dodatkowo przygotowuje wzór umowy powierzenia przetwarzania danych (DPA).
- [ ] **Agent diagnostyczny (rozwiązań)** — nie reaguje na pojedynczy incydent, tylko na powtarzalność. Koreluje `error_log`, dziennik akcji (sekcja 9.6) i raporty QA po ID zadania (sekcja 8.7), formułuje hipotezę przyczyny i proponuje konkretne rozwiązanie. **Rola wyłącznie doradcza** — nie zmienia kodu ani konfiguracji samodzielnie, propozycja idzie przez normalny proces PO→Architekt→Inżynier→QA. Jeśli nie znajdzie spójnej przyczyny, mówi to wprost zamiast zgadywać.
- [ ] **Agent supportu/onboardingu** (dopiero gdy `APP_MODE=commercial` ma realnych innych użytkowników) — odpowiada na pytania nowych userów, pilnuje żeby nie odpadali w połowie rejestracji.

### Faza I — Backlog dodatkowych możliwości (do rozważenia, nie blokujące MVP)

- [ ] **Program poleceń** — twórca przyprowadzający innego twórcę odblokowuje bonus (miesiąc gratis / wyższy limit) — najtańszy kanał wzrostu, dziś nieużywany.
- [ ] **Re-engagement nieaktywnych użytkowników** — trigger na Telegramie "nie publikowałeś tydzień, wszystko ok?" zanim user po cichu anuluje subskrypcję, zamiast dowiadywać się o churnie z raportu Stripe.
- [ ] **2FA i audit log** — przy wielu użytkownikach trzymających tokeny OAuth do cudzych kont social, dwuskładnikowe logowanie do Postfly i log "kto co zmienił" przestają być opcjonalne.
- [ ] **Świadome pozycjonowanie względem konkurencji** (Later, Buffer, Metricool) — przewaga Postfly to specjalizacja pod muzyków + kontrola przez Telegram + agent AI, nie kolejny generyczny scheduler. Do uwzględnienia w komunikacji/landing, nie tylko w kodzie.
- [ ] **Własność treści generowanych przez AI** — jasny zapis w regulaminie kto jest właścicielem opisów/tagów wygenerowanych przez `smart-autopilot`.

## 7. Checklista weryfikacyjna (po każdej fazie)

- [ ] Tokeny OAuth zaszyfrowane w bazie
- [ ] Każda publikacja i wysyłka Monetyzacji ma krok potwierdzenia — zero wyjątków
- [ ] Wszystkie komendy z sekcji 5 przetestowane ręcznie
- [ ] Koszt LLM per użytkownik/miesiąc policzony (wykorzystaj istniejący licznik `ai_autopilot_runs`)
- [ ] Zapasowy kanał powiadomień (e-mail)
- [ ] Status audytu API każdej platformy śledzony
- [ ] RODO/polityka prywatności jeśli `APP_MODE=commercial`
- [ ] Architekt potwierdził skalowalność nowej warstwy (nie tylko "działa na moim koncie")
- [ ] Zasady z sekcji 9 (bezpieczeństwo agentów) sprawdzone dla każdego nowego agenta — najmniejsze uprawnienia, brak wspólnego klucza, log akcji

## 8. Rekomendacje architektoniczne — skalowanie

Sekcja robocza Architekta — poniższe wzorce mają być stosowane, nie wymyślane od nowa przy każdej fazie.

### 8.1 Kolejka zamiast cron-only
Masz już Redis w `docker-compose.yml` — nieużywany pod kolejkę. Zamiast polegać wyłącznie na `/api/cron/publish` (raz dziennie na Vercel Hobby), wdroż BullMQ: zadania trafiają do kolejki natychmiast po zatwierdzeniu w Telegramie, worker przetwarza je asynchronicznie blisko czasu rzeczywistego. Cron zostaje jako **fallback/health-check** (np. co godzinę sprawdza czy nic nie utknęło), nie jako jedyny mechanizm. To jednocześnie rozwiązuje problem "publikacja od razu po potwierdzeniu" i skaluje się horyzontalnie — więcej workerów = więcej przepustowości, bez zmiany architektury.

### 8.2 Wydzielony proces workera
Worker publikujący (dziś część funkcji cron w tym samym deploymencie co web) docelowo jako osobny proces/usługa. Inaczej długa operacja publikacji (upload dużego wideo na platformę) może blokować zasoby dzielone z resztą aplikacji, i nie da się skalować niezależnie od ruchu webowego.

### 8.3 Indeksy i partycjonowanie pod wielu użytkowników
Przy wzroście liczby kont, kluczowe zapytania (`PublishJob` po statusie i dacie, `content_calendar` po użytkowniku) muszą mieć indeksy złożone `(userId, status, scheduledAt)`. Sprawdź `prisma/schema.prisma` pod tym kątem w Fazie G — dodanie indeksu po fakcie na dużej tabeli jest dużo droższe niż zaplanowanie go teraz.

### 8.4 Rate limiting per tenant, nie tylko globalny
Jeden duży klient (dużo publikacji) nie może zjeść limitu API platformy całej reszcie użytkowników. Limiter musi być per `userId`/`tenantId`, nie tylko globalny na poziomie aplikacji.

### 8.5 Cache dla analityki
Nie licz agregatów analitycznych w locie przy każdym otwarciu dashboardu — pull raz (już masz agenta monitorującego), agreguj, cache'uj w Redis z krótkim TTL. Inaczej dashboard skaluje się liniowo w dół wraz z liczbą użytkowników zamiast płasko.

### 8.6 Event bus Monetyzacji jako rozszerzenie, nie nowy system
Nowi agenci z Fazy E mają korzystać z tego samego mechanizmu zdarzeń co reszta (kolejka z 8.1), żeby dodanie kolejnego agenta w przyszłości nie wymagało zmian w istniejących — tylko subskrypcji nowych zdarzeń.

### 8.7 Obserwowalność ponad błędy
Sentry już jest wdrożony (błędy). Dodaj metryki biznesowe (liczba publikacji/dzień, wskaźnik sukcesu per platforma, opóźnienie kolejki) i prosty alerting na przekroczenie SLA — inaczej skalowanie odkrywa się dopiero jak coś się posypie, a nie wcześniej.

### 8.8 Nie przedwczesna optymalizacja
Jedna baza Postgres z dobrymi indeksami wystarczy na wiele tysięcy użytkowników. Rozdzielanie na osobne bazy per bounded context (billing/content/monetyzacja) ma sens dopiero przy realnym wolumenie, nie teraz — Architekt ma prawo odrzucić przedwczesne rozdrabnianie architektury zgłoszone przez PO lub Inżyniera.

## 9. Bezpieczeństwo agentów

Zasady poniżej obowiązują **wszystkie** agenty (produktowe i operacyjne) i są weryfikowane przez QA (sekcja 0) tak samo jak funkcjonalność — brak testu bezpieczeństwa = zadanie niezamknięte.

### 9.1 Zewnętrzna treść to zawsze dane, nigdy instrukcja
Każdy agent, który przetwarza treść pochodzącą spoza Twojego bezpośredniego działania w panelu (komentarze/DM do Agenta społeczności, wyniki z Agenta trendów, odpowiedzi platform w Agencie sync) musi mieć to wymuszone na poziomie systemowym promptu: analizowana treść jest oznaczona jako dane wejściowe do oceny, nie jako polecenie do wykonania. To ma być techniczne rozgraniczenie w konstrukcji promptu, nie tylko zasada w dokumentacji.

### 9.2 Zasada najmniejszych uprawnień per agent
Żaden agent nie dzieli wspólnego, uniwersalnego klucza/roli serwisowej z resztą. Każdy dostaje tylko te uprawnienia, których realnie potrzebuje:
- Agenci tylko-do-odczytu (Trendy, Analityka, Monitorujący) — brak jakiegokolwiek dostępu zapisu do publikacji czy finansów.
- Agenci finansowi (Sprzedaż, Superfani, Tantiemy, księgowo-podatkowy) — dostęp ograniczony do własnych operacji, bez możliwości zmiany danych wypłat (patrz 9.5).
- **Agent DevOps ma najszersze uprawnienia w całym systemie (produkcja, migracje) — dlatego wymaga osobnych, najwęższych poza tym poświadczeń i jawnego zatwierdzenia człowieka przed każdym działaniem na produkcji, nie tylko na środowisku deweloperskim.**

### 9.3 Weryfikacja źródła webhooków
Każdy webhook przychodzący z zewnątrz (Telegram, Stripe, TikTok) musi być zweryfikowany podpisem/sekretem (Telegram: sprawdzenie tokenu w URL/nagłówku, Stripe: `STRIPE_WEBHOOK_SECRET` — już częściowo istnieje w projekcie, TikTok: `TIKTOK_WEBHOOK_SECRET` — już istnieje w `.env.example`, upewnij się że faktycznie jest sprawdzany w kodzie, nie tylko zdefiniowany). Żądanie bez poprawnej weryfikacji jest odrzucane, nigdy przetwarzane "na wszelki wypadek".

### 9.4 Czyszczenie logów z sekretów i danych osobowych
Przed zapisem do `error_log`/Sentry, treść błędu przechodzi przez filtr usuwający tokeny, hasła, pełne dane osobowe fanów. Test regresyjny: symulowany błąd zawierający token w danych wejściowych → sprawdzenie że token nie pojawia się w zapisanym logu.

### 9.5 Ochrona zmian danych wypłat
Zmiana danych do wypłaty (konto bankowe, adres rozliczeniowy) nigdy nie odbywa się na podstawie samej rozmowy w Telegramie, nawet zatwierdzonej przyciskiem — wymaga dodatkowego potwierdzenia poza czatem (np. link weryfikacyjny wysłany mailem na zarejestrowany adres). To osobna, wyższa bramka niż standardowe zatwierdzenie publikacji.

### 9.6 Dziennik akcji agentów (audit trail)
Osobno od `error_log` (błędy) — zapis każdej **udanej** akcji agenta: który agent, jaka akcja, na czyich danych, kiedy, jaki był wynik. Nie do debugowania błędów, tylko do odtworzenia "co się stało", jeśli kiedykolwiek będzie trzeba zbadać incydent.

## 10. Review końcowy

Po ukończeniu Faz A–I wróć do rozmowy z Claude i poproś o pełny przegląd: czy warstwa Telegram nigdzie nie omija bramki potwierdzenia (łącznie z agentem społeczności — czy *treść* odpowiedzi też zawsze przechodzi przez zatwierdzenie, nie tylko decyzja "wysłać/nie wysłać"), czy kolejka z sekcji 8.1 faktycznie działa niezależnie od crona, czy rebranding na Postfly jest spójny, czy Architekt podpisał się pod skalowalnością każdej nowej warstwy, i czy Design Critic z sekcji 0.1 zatwierdził finalny UI panelu pod kątem prostoty i spójności — zgodnie z definicją "100%" z sekcji 0.

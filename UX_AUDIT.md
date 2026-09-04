# Audyt UX/UI — Postfly (Faza 1)

Data: 2026-09-04
Metoda: każdy ekran odwiedzony w prawdziwej przeglądarce (Playwright/Chromium), zrzuty desktop (1280×900) i mobile (375×812, dotyk) w `tests/e2e/__screenshots__/audit/`, każdy realnie obejrzany przed oceną — nie tylko czytanie kodu. Konto testowe: `audyt.ux@postfly.test`, z 4 zamockowanymi kontami social (patrz Zastrzeżenia).

## Zastrzeżenia metodologiczne (przeczytaj przed oceną)

1. **Konta social są zamockowane** — 4 wiersze `SocialAccount` wstawione bezpośrednio do lokalnej bazy z fałszywym `accessToken`, zgodnie z poleceniem żeby nie wykonywać realnych wywołań do TikTok/IG/YouTube/Facebook. Skutek: wszystko co wymaga **żywego** tokena (np. "Sprawdzanie statusu..." na Pulpicie, "Pobieranie ustawień konta TikTok...") nie może się poprawnie zakończyć w tym środowisku — to oczekiwane i **nie obciąża** oceny samej appki, chyba że explicite zaznaczono inaczej (np. brak timeoutu/obsługi błędu jest realnym problemem niezależnie od tego, czy token jest prawdziwy).
2. **`APP_MODE=personal`** — appka działa w trybie jednoosobowym: brak limitów planu, billing UI ukryty z głównej nawigacji, rejestracja zamknięta po 1. koncie. Oceniam appkę w tym trybie, bo taki jest jej aktualny stan uruchomieniowy.
3. **Artefakt zrzutu pełnostronicowego na mobile**: nawigacja dolna appki ma `position: fixed`. Przy zrzucie `fullPage: true` na długich stronach mobile Chromium "wkleja" ten fixed element w miejscu przewinięcia w trakcie sklejania obrazu — na zrzucie wygląda to tak, jakby pasek nawigacji nakładał się na środek strony. **To artefakt narzędzia, nie błąd appki** — realne zachowanie (pasek zawsze na dole, treść przewija się pod spodem) potwierdzone osobnymi zrzutami samego viewportu (`04b-dashboard-mobile-viewport.png`, `05b-social-accounts-mobile-viewport.png`). Tam gdzie to rozróżnienie ma znaczenie, odwołuję się do zrzutu viewportu.
4. **Przerywany błąd zawieszonego żądania** (opisany niżej jako osobne znalezisko w Pulpicie) reprodukował się losowo na różnych ekranach w trakcie audytu (Schedule, Billing, Social Accounts, logowanie) — za każdym razem inny ekran, ten sam objaw. Traktuję to jako jedno systemowe znalezisko, nie osobny błąd każdego ekranu.
5. **Nie odwiedzono w tej turze**: `/admin/jobs` (panel operacyjny, poza główną nawigacją użytkownika), `/privacy`, `/terms` (strony prawne bez interakcji). Pomijam ocenę tych ekranów zamiast zgadywać.

Legenda: 🟢 dobrze / 🟡 do poprawy / 🔴 problem

---

## 0) Znalezisko systemowe: brak timeoutu żądań API (dotyczy wielu ekranów)

**Status: ✅ Naprawione (Faza 1.5).**

**Opis:** `lib/api-client.ts` tworzy instancję axios (`axios.create({ baseURL, withCredentials: true })`) **bez ustawionego `timeout`**. `AuthProvider.refreshSession()` (`contexts/auth-context.tsx`) czeka na `GET /auth/me` bez własnego limitu czasu — jeśli żądanie się zawiesi (a w trakcie audytu obserwowałem to wielokrotnie, prawdopodobnie pod obciążeniem/współbieżnością), `isLoading` zostaje `true` na zawsze.

**Dowód:** `08-schedule-desktop.png`, `10-billing-desktop.png` (pierwszy przebieg), `05b-social-accounts-mobile-viewport.png` — każdy pokazuje ten sam ekran: "Ładowanie sesji..." zawieszone w nieskończoność + fałszywy komunikat "Problem z połączeniem" w nagłówku. Za każdym razem inny ekran, ta sama przyczyna. Powtórzyłem te same nawigacje wielokrotnie i część przebiegów kończyła się poprawnie (patrz `09-analytics-desktop.png` — ten sam ekran, ten sam request, zakończony sukcesem w innym przebiegu) — to potwierdza, że problem jest **przerywany/zależny od obciążenia**, nie stały.

- **Widoczność stanu systemu (#1): 🔴** — użytkownik widzi tylko "Ładowanie sesji..." bez końca, żadnego komunikatu błędu, żadnego przycisku "spróbuj ponownie". Jedyne wyjście to domyślna wiedza, że trzeba ręcznie odświeżyć stronę — appka tego nie sugeruje.
- **Kontrola użytkownika (#3): 🔴** — brak jakiejkolwiek akcji naprawczej w UI.

**Naprawa:** `lib/api-client.ts` — dodano `timeout: 15_000` do instancji axios. `contexts/auth-context.tsx` — dodano `sessionError`/`retrySession` do `AuthContextValue`: `refreshSession()` odróżnia teraz 401 ("niezalogowany", oczekiwane) od realnego błędu połączenia (`sessionError = true`). Wszystkie 7 ekranów, które miały ten sam duplikowany blok ładowania (`app/{dashboard,analytics,billing,media-library,schedule,social-accounts,admin/jobs}/page.tsx`), dostały ekran "Nie udało się połączyć z serwerem." z przyciskiem "Spróbuj ponownie" *przed* sprawdzeniem `isLoading`, oraz poprawiono efekt przekierowania do `/login`, żeby nie odpalał się w trakcie `sessionError` (pierwsza wersja poprawki miała tu wyścig — user lądował na `/login` zanim zdążył zobaczyć przycisk retry; złapał to test regresyjny poniżej).

**Test regresyjny:** `tests/e2e/session-timeout.spec.ts` — przechwytuje `/api/auth/me` tak, by nigdy nie odpowiedzieć, i sprawdza że po ok. 15s pojawia się przycisk "Spróbuj ponownie", a jego kliknięcie realnie odzyskuje aplikację.

---

## 1) Strona główna (landing)

Zrzuty: `01-landing-desktop.png`, `01-landing-mobile.png`, `pricing-zoom.png` (przybliżenie cennika na mobile)

| # | Heurystyka | Ocena | Komentarz |
|---|---|---|---|
| 1 | Widoczność stanu | 🟢 | Statyczna strona marketingowa, nic do zakomunikowania w locie. |
| 2 | Zgodność z rzeczywistością | 🟡 | Strona prezentuje appkę jako pełne, wielo-najemcze SaaS z cennikiem (Free/Starter/Pro/Business), mimo że appka realnie działa dziś w trybie `personal` (jednoosobowym, bez planów/płatności — patrz `10-billing-desktop.png`). Ktoś klikający "Wypróbuj za darmo" trafi na rejestrację, która i tak jest zamknięta (patrz punkt 2 niżej). |
| 3 | Kontrola użytkownika | 🟢 | Standardowa nawigacja, nic nie blokuje. |
| 4 | Spójność | 🟢 | Spójna z resztą appki wizualnie (kolory, typografia). |
| 5 | Zapobieganie błędom | 🟡 | Patrz punkt 2 — CTA prowadzi donikąd bez ostrzeżenia. |
| 6 | Rozpoznawanie | 🟢 | Kroki "jak to działa" czytelne. |
| 8 | Minimalizm | 🟡 | Bardzo długa strona (mobile: ~13 400px) — dużo sekcji (hero, 3 kroki, 3 zastosowania, cennik, FAQ, formularz kontaktowy). Nie jest to "1 ekran = 1 decyzja", ale to strona marketingowa, nie flow produktowy, więc inne zasady tu obowiązują. |
| 9 | Mobile/dotyk | 🟡 | Cennik responsywnie przechodzi w karty jedna pod drugą (czytelne, brak przewijania w bok — dobrze), ale pływający pasek "Wypróbuj za darmo przez 7 dni" na dole ekranu zachodzi bardzo blisko na przycisk "Zacznij od Free" karty Free tuż nad nim (`pricing-zoom.png`) — wizualne stłoczenie dwóch podobnych CTA blisko siebie. |
| 10 | Kontrast | 🟢 | Ciemne tło, jasny tekst, dobry kontrast wszędzie. |

**Rekomendacja (🟡, punkt 2/5):** Skoro appka działa dziś w trybie personal, landing page wprowadza w błąd co do realnej oferty. Do rozważenia: albo dodać wyraźną notkę/banner "obecnie tryb jednoosobowy, rejestracja zamknięta", albo (prościej) całkowicie wyłączyć/ukryć landing page dopóki appka nie wejdzie w tryb `commercial`.

---

## 2) Rejestracja

Zrzuty: `02-register-desktop.png`, `02-register-mobile.png`

| # | Heurystyka | Ocena | Komentarz |
|---|---|---|---|
| 1 | Widoczność stanu | 🟢 | Formularz jasny, placeholdery pomocne. |
| 2 | Zgodność z rzeczywistością | 🟢 | Prosty, zrozumiały język PL, poprawna polszczyzna. |
| 5 | Zapobieganie błędom | ✅ Naprawione | Formularz **nie informował**, że rejestracja jest zamknięta w trybie personal — backend wiedział to z góry (`APP_MODE=personal` + istniejący 1 użytkownik), ale user dowiadywał się dopiero po wypełnieniu całego formularza i kliknięciu "Utwórz konto". |
| 9 | Mobile/dotyk | 🟢 | Pola i przycisk odpowiednio duże, jedna kolumna. |
| 10 | Kontrast | 🟢 | Dobry. |

**Status: ✅ Naprawione (Faza 1.5).** Dodano `GET /api/auth/register-status` (`lib/server/app-mode.ts` → `isRegistrationOpen()`, współdzielone z `POST /api/auth/register`, więc obie ścieżki nie mogą się rozjechać) i `/register` sprawdza to na starcie — gdy zamknięte, pokazuje kartę blokującą z linkiem do logowania zamiast formularza.

**Test regresyjny:** `tests/e2e/register-status.spec.ts` — dwa scenariusze (mockowany status `open`/`closed`), sprawdzające że strona faktycznie reaguje na wynik statusu.

---

## 3) Logowanie, odzyskiwanie hasła

Zrzuty: `03-login-empty-desktop/mobile.png`, `03b-login-error-desktop.png`, `03c-forgot-password-desktop/mobile.png`

| # | Heurystyka | Ocena | Komentarz |
|---|---|---|---|
| 1 | Widoczność stanu | 🟢 | Błędne logowanie daje jasny, natychmiastowy komunikat (`03b-login-error-desktop.png`: "Logowanie nie powiodło się. Sprawdź e-mail i hasło."). |
| 2 | Zgodność z rzeczywistością | ✅ Naprawione | **Brakujące polskie znaki diakrytyczne w całym flow odzyskiwania hasła** — potwierdzone wizualnie i w kodzie źródłowym: "Zapomniales hasla?" (link na `/login`), nagłówek "Zapomnialem hasla", "Wyslij link resetu", "Pamietasz haslo?", "Wroc do logowania" (`/forgot-password`), oraz w `ResetPasswordForm.tsx`: "Brak tokenu resetu hasla", "Haslo musi miec co najmniej...", "Nie udalo sie zresetowac hasla", "Ten link jest nieprawidlowy" itd. Reszta appki (rejestracja, dashboard, composer) ma poprawną polszczyznę — to sprawiało, że akurat ten fragment wyglądał niedopracowany/nieprofesjonalnie, szczególnie rzucający się w oczy dla native speakera. |
| 5 | Zapobieganie błędom | 🟢 | Walidacja emaila/hasła po stronie przeglądarki (HTML5 `required`, `type="email"`). |
| 9 | Mobile/dotyk | 🟢 | Duże pola i przyciski, jedna kolumna, `03-login-empty-mobile.png` — przycisk "Zaloguj" ma wysokość ok. 60px w px appki (skalowane), zdecydowanie powyżej progu 44px. |
| 10 | Kontrast | 🟢 | Dobry. |

**Status: ✅ Naprawione (Faza 1.5).** Uzupełniono polskie znaki diakrytyczne w `app/login/page.tsx`, `app/forgot-password/page.tsx`, `app/reset-password/ResetPasswordForm.tsx`, `app/api/auth/{forgot-password,reset-password}/route.ts`. Przy okazji tego samego grepa znaleziono i naprawiono ten sam problem w dwóch miejscach poza pierwotnym zakresem audytu: `lib/mail/service.ts` (treść maila resetu hasła — realny e-mail wysyłany do użytkownika miał ten sam problem) i formularzu kontaktowym na landing page (`components/landing/LandingExperience.tsx`).

**Test regresyjny:** `tests/e2e/password-flow-copy.spec.ts` — asertuje konkretne poprawne frazy z polskimi znakami na `/login`, `/forgot-password`, `/reset-password`, więc cofnięcie do wersji bez ogonków realnie wywali test, nie tylko "jakiś tekst istnieje".

**Znalezisko poboczne (nie oceniam osobno, bo to nie UI):** Ukryte pole "honeypot" (`id="login-company-website"` / `id="register-company-website"`) w praktyce może zostać wypełnione przez heurystyki autouzupełniania przeglądarki po wcześniejszej wizycie na powiązanej stronie w tej samej karcie, co fałszywie odrzuca poprawne logowanie (zaobserwowane podczas audytu — logowanie z prawidłowymi danymi kończyło się "Invalid credentials" po wcześniejszej wizycie na `/register` w tej samej sesji przeglądarki, mimo poprawnych danych). Kod ma już wyjątek na autouzupełnienie mobilne (`looksLikeEmailAutofill`), ale tylko dla przypadku gdy pole przyjmie dokładnie wartość emaila — inne wzorce autouzupełnienia nie są objęte wyjątkiem. Warto zweryfikować w prawdziwej przeglądarce z realnym profilem/hasłami zapisanymi w menedżerze haseł.

---

## 4) Pulpit (dashboard)

Zrzuty: `04-dashboard-desktop.png`, `04-dashboard-mobile.png`, `04b-dashboard-mobile-viewport.png`

| # | Heurystyka | Ocena | Komentarz |
|---|---|---|---|
| 1 | Widoczność stanu | 🔴 | Patrz **Znalezisko systemowe (sekcja 0)** — ten sam ekran, w innym przebiegu, potrafił zawiesić się na "Ładowanie sesji...". Dodatkowo: pasek statusu usługi w nagłówku ("Usługa działa" / "Problem z połączeniem") bywał **błędnie czerwony** mimo w pełni działającej appki (dane realnie się ładowały) — pierwsze sprawdzenie `/api/health` startuje razem z resztą żądań po zalogowaniu i pod obciążeniem potrafi nie zdążyć w rozsądnym czasie, a interwał odświeżenia to 30s, więc błędny status może wisieć długo zanim się sam naprawi. |
| 2 | Zgodność z rzeczywistością | 🟢 | Język zrozumiały, bez żargonu ("Opublikowane", "W kolejce", "Skuteczność publikacji"). |
| 3 | Kontrola użytkownika | 🟢 | Czytelne CTA do każdego kroku ("Dodaj materiał", "Otwórz harmonogram"). |
| 4 | Spójność | 🟢 | Karty statusu platform używają identycznego wzorca przycisków co ekran "Połączone konta" (Połącz kolejne konto / Połącz ponownie / Rozłącz). |
| 6 | Rozpoznawanie | 🟢 | Checklista "Start w 4 krokach" cały czas widoczna, user nie musi niczego pamiętać z poprzedniej wizyty. |
| 8 | Minimalizm | 🟢 | Dużo informacji, ale sensownie pogrupowana w karty — nic nie wydaje się zbędne przy pierwszym wejrzeniu. |
| 9 | Mobile/dotyk | 🟡 | Karty i przyciski wystarczająco duże. Ale: zaraz po zalogowaniu toast "Zalogowano pomyślnie." **nakłada się na przycisk "Nowy post" i awatar użytkownika** w prawym górnym rogu (`04b-dashboard-mobile-viewport.png`) — przez kilka sekund główne CTA jest częściowo niedostępne/niewidoczne na wąskim ekranie. Dodatkowo etykiety dolnej nawigacji "Połączone konta" i "Biblioteka mediów" są ucinane do "Połączone..." / "Biblioteka ..." (`max-w-[60px]` + `truncate`) — czytelne z kontekstu ikony, ale niepełne. |
| 10 | Kontrast | 🟢 | Dobry wszędzie. |

**Rekomendacja (🟡, toast):** Na mobile pozycjonować toasty sukcesu tak, by nie nakładały się na stały pasek nagłówka (np. niżej, pod nagłówkiem, albo z dłuższym marginesem od góry na wąskich viewportach).
**Rekomendacja (🟡, status usługi):** Nie pokazywać czerwonego "Problem z połączeniem" na podstawie pojedynczego, pierwszego sprawdzenia zaraz po starcie strony — poczekać na 1-2 nieudane próby z rzędu zanim UI pokaże stan błędu, żeby uniknąć fałszywych alarmów.

---

## 5) Połączone konta (Social accounts)

Zrzuty: `05-social-accounts-desktop.png`, `05-social-accounts-mobile.png`, `05b-social-accounts-mobile-viewport.png`

| # | Heurystyka | Ocena | Komentarz |
|---|---|---|---|
| 1 | Widoczność stanu | 🔴 | Ten sam systemowy problem z sekcji 0 (`05b-social-accounts-mobile-viewport.png` łapie to na żywo). Osobno: nie mogłem w pełni zweryfikować z zamockowanym tokenem, czy "Sprawdzanie statusu..." (widoczne wcześniej na Pulpicie dla tych samych kont) ma sensowny timeout — z realnym, ale wygasłym/nieważnym tokenem, ten sam brak timeoutu z sekcji 0 może dawać identyczny efekt. Niska pewność tego konkretnego pod-znaleziska (wynika z mockowania), ale warto zweryfikować ręcznie z prawdziwym wygasłym tokenem. |
| 4 | Spójność | 🟢 | Cztery karty platform w jednym, powtarzalnym wzorcu (ikona, status "Aktywny", "Połącz kolejne konto", per-konto: "Połącz ponownie" / "Rozłącz"). Dokładnie ten sam wzorzec co na Pulpicie — brak wynajdywania nowych wzorców na nowym ekranie. |
| 9 | Mobile/dotyk | 🟢 | Karty w jednej kolumnie, przyciski pełnej szerokości, wystarczająco duże do kciuka. |
| 10 | Kontrast | 🟢 | Dobry, w tym czytelne czerwone "Rozłącz" na ciemnym tle. |

---

## 6) Biblioteka mediów

Zrzuty: `06-media-library-empty-desktop.png` (po dodaniu 1 materiału), `06-media-library-empty-mobile.png`

| # | Heurystyka | Ocena | Komentarz |
|---|---|---|---|
| 1 | Widoczność stanu | 🟢 | Licznik "Wyników: N", status "Gotowe", data przesłania. |
| 5 | Zapobieganie błędom | 🟢 | Strefa uploadu jasno komunikuje dozwolone formaty i limit rozmiaru *zanim* user wybierze plik (".mp4 · .mov · .jpg · .png · .webp", "Maksymalny rozmiar: 500MB"). |
| 6 | Rozpoznawanie | 🟢 | Puste pole na filtr/wyszukiwanie zawsze widoczne, nie trzeba niczego pamiętać. |
| 8 | Minimalizm | 🟢 | Krótka, skupiona lista — pole uploadu, wyszukiwarka/filtr, lista. Nic zbędnego. |
| 9 | Mobile/dotyk | 🟢 | Strefa "Dotknij, aby wybrać plik" duża, łatwa do trafienia. |
| 10 | Kontrast | 🟢 | Dobry. |

Ten ekran wypadł najlepiej ze wszystkich — prosty, zrobił dokładnie to czego oczekiwałem, bez niespodzianek.

---

## 7) Kreator posta (Post Composer)

Zrzuty: `11*-desktop.png` (pełny flow), `11*-mobile.png` (wszystkie 3 kroki złapane na mobile, choć nie w jednym ciągłym przebiegu — patrz uwaga o zakresie mobile niżej).

### Krok 1 — Materiał
Zrzuty: `11-composer-media-step-desktop.png`, `11-composer-media-step-mobile.png`, `11b-composer-media-uploaded-desktop/mobile.png`

| # | Heurystyka | Ocena | Komentarz |
|---|---|---|---|
| 1 | Widoczność stanu | 🟢 | Stan "Gotowe: [nazwa] (zdjęcie/wideo)" po uploadzie, pasek postępu w trakcie. |
| 3 | Kontrola użytkownika | 🟢 | Baner "Masz niedokończony post. Wrócić do niego?" z jasnym wyborem "Wróć do posta" / "Zacznij nowy" — żaden user nie utyka bez wyjścia (`11-composer-media-step-desktop.png`, `11b-composer-media-uploaded-mobile.png`). |
| 4 | Spójność | 🟡 | Ikona pliku w karcie "przesłano" to zawsze ikona wideo (`FileVideo` z lucide-react), **nawet dla przesłanego zdjęcia** — tekst poniżej poprawnie mówi "(zdjęcie)", ale ikona nie. Drobna, ale realna niespójność (`components/VideoUploader.tsx`). |
| 5 | Zapobieganie błędom | 🟢 | Ekran jasno mówi "Wideo lub zdjęcie" *zanim* user wybierze plik — dokładnie zgodnie z zamierzeniem projektowym z `flow-dodawania-posta-rap.md`. |
| 8 | Minimalizm | 🟢 | Dokładnie 3 pola (plik, typ treści, tytuł) — żadnego harmonogramu, wyboru platform ani ustawień prywatności na tym ekranie. Realizacja zasady "1 ekran = 1 decyzja". |
| 9 | Mobile/dotyk | 🟢 | Strefa uploadu i pola tekstowe pełnej szerokości, przyciski kroków ("Krok 1/2/3") czytelne mimo mniejszej czcionki. |
| 10 | Kontrast | 🟢 | Dobry. |

**Rekomendacja (🟡):** W `VideoUploader.tsx`, w bloku "File info", użyć warunkowo `ImageIcon` (już zaimportowany gdzie indziej w projekcie) zamiast zawsze `FileVideo`, na podstawie `uploadedFile.mediaType`.

### Krok 2 — Treść (przegląd per platforma)
Zrzuty: `11d-composer-content-review-desktop.png`, `11e-composer-tiktok-tab-desktop.png`

| # | Heurystyka | Ocena | Komentarz |
|---|---|---|---|
| 1 | Widoczność stanu | ✅ Naprawione | Panel "Ustawienia publikacji TikTok" pokazywał "Pobieranie ustawień konta TikTok..." i **nie wychodził z tego stanu** (zweryfikowane w dwóch krokach flow, `11d` i `11e`) — ten sam brak timeoutu z sekcji 0. Naprawione tam (sekcja 0 opisuje ogólną przyczynę; ten konkretny panel miał już zresztą poprawną obsługę błędu w `catch`, problem był wyłącznie w braku timeoutu samego żądania). |
| 2 | Zgodność z rzeczywistością | 🟢 | Pytanie "Czy ta treść zawiera wulgaryzmy (explicit)?" zadane raz, z jasnym wyjaśnieniem "zapamiętamy Twoją odpowiedź jako domyślną" — trafny, niebranżowy język dla rapera. |
| 5 | Zapobieganie błędom | ✅ Naprawione | Wymagana prawnie zgoda TikTok ("Potwierdzam, że publikacja na TikTok...") była w tym samym panelu co nieskończenie ładujące się "Pobieranie ustawień konta TikTok..." i wizualnie ucięta przez sticky stopkę (Wstecz/Dalej) na dole panelu (`11e-composer-tiktok-tab-desktop.png`) — checkbox był ledwo widoczny nad dolną krawędzią. Jeśli pobieranie ustawień się zawiesiło (jak w tym audycie), user mógł nie być w stanie w ogóle dotrzeć do checkboxa, a to jedyne miejsce we flow, które z założenia *musi* blokować dalsze kroki (zgodnie z `flow-dodawania-posta-rap.md`). |
| 8 | Minimalizm | 🟡 | Wygenerowane hashtagi ("#tiktok", "#update") są bardzo generyczne — nie realizują zamierzenia z dokumentu projektowego ("3-5 hashtagów muzycznych + niszowe, np. #polskirap, #nowyrap"). To nie błąd UI sensu stricto, ale rozjazd między obiecanym a dostarczonym doświadczeniem dla docelowego użytkownika (rapera). Pozostawione bez zmian w tej turze (🟡, nie było w zakresie napraw priorytetowych). |
| 4 | Spójność | 🟢 | Zakładki platform pokazują tylko podłączone konta (YouTube/TikTok/Instagram/Facebook), zgodnie z zasadą "nic więcej niż podłączone". |

**Status: ✅ Naprawione (Faza 1.5).** Checkbox zgody TikTok przeniesiony z `TikTokSettingsPanel.tsx` (renderowany wewnątrz przewijanego panelu per-platforma) do zawsze widocznej stopki w `components/PostComposer.tsx` — renderowany obok przycisków "Wstecz"/"Dalej", tylko gdy aktywna zakładka to TikTok, niezależnie od stanu ładowania reszty panelu.

**Test regresyjny:** `tests/e2e/tiktok-consent.spec.ts` — tworzy realnego użytkownika z draftem TikTok (fixtures + ciasteczko sesji, bez przechodzenia przez UI logowania) i sprawdza strukturalnie, że checkbox zgody **nie jest** potomkiem przewijanego kontenera `.overflow-y-auto` oraz że jest w pełni w viewport bez przewijania.

### Krok 3 — Kiedy i gdzie
Zrzuty: `11f-composer-schedule-step-desktop.png`

| # | Heurystyka | Ocena | Komentarz |
|---|---|---|---|
| 1 | Widoczność stanu | 🟢 | Jasna notka "YouTube pominięty — nie obsługuje publikacji zdjęć jako posta" — appka tłumaczy *dlaczego* platforma zniknęła, zamiast po prostu jej nie pokazywać. |
| 2 | Zgodność z rzeczywistością | 🟢 | **Bardzo dobre, uczciwe zdanie**: "Publikacja tego dnia — dokładna godzina zależy od crona (Vercel Hobby: raz na dobę), więc traktuj godzinę jako orientacyjną, nie co-do-minuty." — appka nie obiecuje precyzji, której backend nie dowozi. Dokładnie zgodnie z zastrzeżeniem z dokumentu projektowego. |
| 5 | Zapobieganie błędom | 🟢 | Czerwone ostrzeżenie o brakującej zgodzie TikTok pojawia się *przed* próbą publikacji, nie dopiero po błędzie serwera. |
| 8 | Minimalizm | 🟢 | Dokładnie dwa duże przyciski na dole ("Zaplanuj" / "Opublikuj teraz"), zgodnie z zamierzeniem "tylko dwa". Domyślnie wszystkie podłączone platformy zaznaczone. |
| 9 | Mobile/dotyk | 🟢 | Potwierdzone `11f-composer-schedule-step-mobile.png`: układ przechodzi poprawnie w jedną kolumnę, przyciski platform i pole terminu pełnej szerokości, dwa duże CTA na dole łatwe do trafienia kciukiem. (Na tym samym zrzucie widoczny osobny błąd techniczny — patrz niżej.) |

To najlepiej zaprojektowany ekran w całej appce — konkretny, uczciwy, bez nadmiaru.

**Zakres mobile dla kroków 2-3 composera:** W trakcie audytu serwer deweloperski kilkukrotnie zawieszał żądania w trakcie automatyzacji mobile (ten sam systemowy problem z sekcji 0), co utrudniło powtarzalne dotarcie do kroków "Treść" i "Kiedy i gdzie" na viewport 375px — jeden zrzut (`11d-composer-content-review-mobile.png`) okazał się nieużywalny (złapał zamknięty sheet, usunięty z katalogu) i został pominięty. Krok 1 (Materiał) w pełni zweryfikowany na mobile i wypada dobrze (patrz wyżej). Kroki 2-3 udało się jednak też złapać poprawnie na mobile w jednym z przebiegów — `11e-composer-tiktok-tab-mobile.png` (zakładka TikTok, krok "Treść") i `11f-composer-schedule-step-mobile.png` (krok "Kiedy i gdzie") — obie potwierdzają, że układ jednokolumnowy z desktopu (przyciski platform, pole terminu, dwa duże CTA) trzyma się dobrze na 375px, bez ucinania czy nakładania się elementów.

**Znalezisko z `11f-composer-schedule-step-mobile.png` (mobile) — Status: ✅ Naprawione (Faza 1.5).** Na górze ekranu widoczny był techniczny komunikat błędu **"Invalid encrypted payload format"** — surowy, deweloperski język wyciekający wprost do interfejsu użytkownika, naruszający heurystykę #2 (zrozumiały język) i #9 (pomoc przy błędach — nic nie mówił userowi co zrobić).

Rzeczywista przyczyna (ustalona podczas naprawy, koryguję wcześniejszą hipotezę o `VIDEO_SOURCE_SIGNING_SECRET`, która była błędna): `SocialAccount.accessToken` jest przechowywany zaszyfrowany (`lib/server/crypto.ts`, AES-256-GCM). Zamockowane konta social z Fazy 1 tego audytu miały wstawiony bezpośrednio do bazy **niezaszyfrowany** token (`'mock-token'`) — kiedy `fetchTikTokCreatorInfo` (`lib/server/tiktok-creator-info.ts`) próbował go odszyfrować, `decrypt()` rzucał `Invalid encrypted payload format` (bo string nie ma oczekiwanego formatu `iv.tag.ciphertext`), a `app/api/social-accounts/tiktok/creator-info/route.ts` łapał ten błąd i odsyłał `error.message` **bez zmian** wprost do klienta. To był w części artefakt metodologii audytu (mock nie pasował do realnego formatu appki) — ale sam wzorzec `catch (error) { badRequest(error.message) }` jest realną luką: każdy nieoczekiwany błąd (uszkodzony token po rotacji `ENCRYPTION_KEY`, awaria API TikToka, cokolwiek) trafiłby do użytkownika w tej samej, surowej formie.

**Naprawa:** `app/api/social-accounts/tiktok/creator-info/route.ts` — blok `catch` loguje teraz pełny błąd po stronie serwera (`console.error`) i zwraca generyczny, zrozumiały komunikat PL ("Nie udało się pobrać ustawień konta TikTok. Spróbuj ponownie później.") zamiast `error.message`. Nie przeglądałem pozostałych ~kilkunastu miejsc w API o tym samym wzorcu (`catch (error) { badRequest(error.message) }`) — to był jedyny z listy priorytetów, ale warto to potraktować jako wskazówkę do szerszego przeglądu poza zakresem tej sesji.

**Test regresyjny:** `tests/e2e/tiktok-creator-info-error.spec.ts` — tworzy realne konto TikTok z celowo niepoprawnym tokenem (dokładnie ten sam kształt, który wywołał błąd w audycie), otwiera composer i sprawdza, że user widzi przyjazny komunikat, a napis "Invalid encrypted payload format" nigdzie się nie pojawia.

---

## 8) Kampanie i harmonogram

Zrzuty: `07-campaigns-desktop/mobile.png`, `08-schedule-desktop.png` (uwaga: `/campaigns` przekierowuje na `/schedule` — to jedna i ta sama strona, potwierdzone w kodzie: `app/campaigns/page.tsx` to czysty `redirect('/schedule')`)

| # | Heurystyka | Ocena | Komentarz |
|---|---|---|---|
| 1 | Widoczność stanu | 🟢 (z zastrzeżeniem) | W normalnym przebiegu ekran ładuje się poprawnie i pokazuje liczniki w zakładkach ("Do akceptacji (0)", "Zaplanowane (1)"...). W jednym przebiegu złapałem ten sam systemowy problem z sekcji 0 (`08-schedule-desktop.png`, pierwszy przebieg) — nie liczę tego osobno, już opisane w sekcji 0. |
| 4 | Spójność | 🟢 | Te same wzorce przycisków/badge'y statusu co reszta appki. |
| 6 | Rozpoznawanie | 🟢 | Materiały do kampanii pokazane z checkboxem i nazwą, user nie musi pamiętać co wybrał wcześniej. |
| 8 | Minimalizm | 🟢 | Panel "Planer kampanii AI" + zakładki statusu — logiczny podział, nic nie przytłacza mimo że to jeden z bardziej złożonych ekranów appki. |
| 9 | Mobile/dotyk | 🟢 | Przyciski i zakładki statusu czytelne i klikalne na 375px (`07-campaigns-mobile.png`). |
| 10 | Kontrast | 🟢 | Dobry. |

---

## 9) Analityka

Zrzuty: `09-analytics-desktop.png`

| # | Heurystyka | Ocena | Komentarz |
|---|---|---|---|
| 1 | Widoczność stanu | 🟢 | Liczby i "Trend dzienny" ładują się poprawnie. |
| 8 | Minimalizm | 🟡 | "Trend dzienny" to czysto tekstowa lista 14 dni, każda linia w formacie "Wideo: 0 • Zadania: 0 • Opublikowane: 0 • Nieudane: 0" — dla nowego konta to ściana powtarzających się zer, bez żadnej wizualizacji (wykresu/sparkline). Nie jest to błąd, ale słabo skanowalne i mało zachęcające, szczególnie dla użytkownika niebranżowego, który wolałby zobaczyć prosty wykres niż czytać 14 identycznych linii tekstu. |
| 10 | Kontrast | 🟢 | Dobry. |

**Rekomendacja (🟡):** Zamienić listę tekstową "Trend dzienny" na prosty wykres słupkowy/liniowy (biblioteka `recharts` jest już w zależnościach projektu — `components/ui/chart.tsx` już istnieje), zachowując tekstowe wartości jako tooltip/alternatywę dostępności.

---

## 10) Subskrypcja (Billing)

Zrzuty: `10-billing-desktop.png`, `10-billing-mobile.png`

| # | Heurystyka | Ocena | Komentarz |
|---|---|---|---|
| 2 | Zgodność z rzeczywistością | 🟡 | Treść wprost pokazuje techniczną nazwę zmiennej środowiskowej `APP_MODE=commercial` w interfejsie użytkownika ("przełącz zmienną środowiskową `APP_MODE=commercial`"). To poprawne i uczciwe dla dewelopera, ale dla docelowego użytkownika (raper, nie programista) to żargon bez znaczenia — choć w praktyce ten ekran i tak nie jest wyeksponowany w głównej nawigacji w trybie personal, więc trafi na niego głównie ktoś świadomy (np. sam deweloper appki), co obniża wagę tego znalezienia. |
| 8 | Minimalizm | 🟢 | Jedna, krótka karta z jasnym wyjaśnieniem stanu — bez zbędnego szumu. |
| 9 | Mobile/dotyk | 🟢 | Czytelne, dobrze się skaluje. |
| 10 | Kontrast | 🟢 | Dobry, w tym kod `APP_MODE=commercial` w czytelnym monospace na wyróżnionym tle. |

---

## Podsumowanie priorytetów

**Naprawione w tej sesji (🔴 → ✅), z testami regresyjnymi Playwright w `tests/e2e/` (`npm run test:e2e`, wymaga działającego `npm run dev`):**
1. Brak timeoutu żądań API (sekcja 0) — `lib/api-client.ts` + `contexts/auth-context.tsx` + 7 ekranów. Test: `session-timeout.spec.ts`.
2. Checkbox zgody TikTok w composerze — przeniesiony do zawsze widocznej stopki (sekcja 7, Krok 2). Test: `tiktok-consent.spec.ts`.
3. Rejestracja nie ostrzegała z góry, że jest zamknięta w trybie personal (sekcja 2) — nowy `GET /api/auth/register-status`. Test: `register-status.spec.ts`.
4. Brakujące polskie znaki diakrytyczne w całym flow odzyskiwania hasła, plus 2 dodatkowe miejsca znalezione przy okazji (mail resetu hasła, formularz kontaktowy na landingu) (sekcja 3). Test: `password-flow-copy.spec.ts`.
5. Surowy błąd techniczny "Invalid encrypted payload format" widoczny w UI na kroku "Kiedy i gdzie" (sekcja 7, mobile) — `app/api/social-accounts/tiktok/creator-info/route.ts` nie odsyła już surowego `error.message`. Test: `tiktok-creator-info-error.spec.ts`.

Wszystkie 5 zweryfikowane: `npx tsc --noEmit` czysty, `npm run test:personal` + `npm run test:commercial` (istniejąca suita Vitest, 19/19 w obu trybach) bez regresji, `npx playwright test` — 8/8 zielone.

**Warte poprawy (🟡), niższy priorytet:**
6. Ikona pliku zawsze "wideo" nawet dla zdjęć (composer, Krok 1).
7. Wygenerowane hashtagi nie są tematycznie dopasowane do muzyki/rapu.
8. Toast "Zalogowano pomyślnie" zasłania CTA "Nowy post" na mobile tuż po logowaniu.
9. Fałszywie czerwony wskaźnik "Problem z połączeniem" przy starcie strony.
10. Analityka jako ściana tekstu zamiast wykresu.
11. Landing page pozycjonuje appkę jako pełne SaaS mimo trybu personal.

**Co działa dobrze i warto to utrzymać:**
- Krok "Kiedy i gdzie" w composerze (uczciwa komunikacja o precyzji harmonogramu, dokładnie 2 CTA).
- Krok "Materiał" w composerze (1 ekran = 1 decyzja, jasne rozróżnienie wideo/zdjęcie).
- Baner wznowienia niedokończonego posta.
- Spójne wzorce kart/przycisków dla kont social (Pulpit i Połączone konta identyczne).
- Biblioteka mediów — najprostszy, najbardziej przewidywalny ekran appki.

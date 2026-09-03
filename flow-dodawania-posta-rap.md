# Nowy flow dodawania posta — dla początkującego rapera

## Zasady, którymi się kierowałem

1. **1 ekran = 1 decyzja.** Użytkownik nigdy nie widzi naraz 4 platform, ustawień TikToka, brief AI i harmonogramu.
2. **Domyślne ustawienia > pytania.** System sam proponuje najlepszy caption, hashtagi i godzinę — user tylko akceptuje albo poprawia.
3. **To, co widzisz, to co się opublikuje.** Podgląd na ekranie musi być dokładnie tym, co poleci na dany portal (to naprawia błąd z poprzedniej wersji, gdzie treść ginęła po drodze).
4. **Muzyk, nie marketer.** Język, sugestie i domyślne teksty są pisane pod kontekst promocji utworu/rapu, a nie generycznego „content creatora".

---

## Flow w skrócie (5 kroków, każdy w osobnym ekranie)

```
[0] Połącz konta (raz, przy starcie)
        ↓
[1] Wgraj kawałek treści
        ↓
[2] AI dopasowuje pod każdy portal (automatycznie)
        ↓
[3] Szybki przegląd i poprawki per platforma
        ↓
[4] Kiedy i gdzie publikować
```

Zero cofania się między "trybami", zero osobnego ekranu na ustawienia TikToka wrzuconego w środek — wszystko co platformowo-specyficzne pojawia się przy danej platformie, we właściwym kroku.

---

## Krok 0 — Połącz konta (warunek wstępny)

Pierwsza rzecz, zanim user w ogóle zobaczy przycisk "Dodaj post": połączenie min. 1 platformy (YouTube/TikTok/IG/Facebook) przez OAuth. Bez tego kreator posta się nie otwiera — zamiast tego duży, jasny ekran "Połącz pierwsze konto".

To wcześniej istniało w aplikacji jako osobna sekcja "Połączone konta", ale kreator posta i tak dawał się otworzyć bez podłączonych kont i dopiero na końcu (krok harmonogramu) informował błędem "Brak podłączonych kont". Dla początkującego to złe miejsce na tę informację — lepiej zablokować wejście do flow niż dać dojść do końca i się rozczarować.

---

## Krok 1 — Wgraj materiał

Ekran ma dokładnie 3 pola:

- **Plik** (wideo z klipu / fragment teledysku / freestyle) — drag & drop albo z telefonu.
- **Co to za treść?** — 1 pole tekstowe: *"Nowy kawałek", "zapowiedź", "freestyle", "behind the scenes", "clip z koncertu"*. To pojedyncze pole steruje później doborem tonu w kroku 2 (zapowiedź ≠ premierowy klip ≠ vlog).
- **Tytuł utworu / projektu** (opcjonalnie, ale mocno sugerowane) — np. "Cień miasta". To pole jest kluczowe dla rapera: system użyje go do generowania hashtagów, opisu i linku do Spotify/YouTube Music jeśli jest podpięty.

Brak w tym kroku: harmonogramu, wyboru platform, ustawień prywatności. To wszystko przychodzi później i nie blokuje uploadu.

Uwaga: to nie musi być wideo — appka obsługuje też zdjęcia (okładka singla, grafika promo, screenshot z sesji). Krok 1 powinien to od razu jasno pokazywać ("wideo lub zdjęcie"), bo część platform (IG, FB) świetnie działa też na samym obrazku, a rapowi zapowiedzi/okładki to częsty typ posta.

Jeśli plik jest za długi dla którejś platformy (np. TikTok ma limit czasu trwania zależny od konta) albo w złym formacie — system informuje o tym **od razu tutaj**, a nie dopiero przy próbie publikacji na końcu flow.

---

## Krok 2 — Automatyczna adaptacja (dzieje się w tle, user czeka ~10s)

System generuje **osobny wariant dla każdej podłączonej platformy**, biorąc pod uwagę specyfikę contentu muzycznego:

| Platforma | Co system robi automatycznie |
|---|---|
| **TikTok / IG Reels** | Krótki, chwytliwy caption z hookiem z tekstu (jeśli podano), 3-5 hashtagów muzycznych + niszowe (np. #polskirap, #nowyrap obok generycznych), pytanie angażujące w komentarzach ("Jaki wers najlepszy?") |
| **YouTube Shorts/Video** | Dłuższy opis z pełnym kontekstem, linkiem do streamingu, tagami SEO (nazwisko artysty, gatunek, "official audio/video") |
| **Instagram** | Caption pomiędzy TikTokiem a YT — miejsce na story-driven opis + CTA "link w bio", hashtagi w drugim akapicie |
| **Facebook** | Najdłuższy, bardziej opisowy — dobrze sprawdza się przy starszej publiczności/organizatorach koncertów |

Ważne techniczne: **to musi być realnie zapisywane per-platforma przy poście**, nie tylko generowane i gubione (to był główny błąd w starej wersji — treść z tego kroku nigdzie nie trafiała do faktycznej publikacji). Każdy wygenerowany wariant to pełnoprawny rekord powiązany z konkretnym postem na konkretną platformę.

Beginner-friendly detal: jeśli user nie ma jeszcze podłączonego Spotify/streaming linka, system o to **nie pyta w tym momencie** — po prostu pomija tę część opisu. Nie blokuje flow.

Dodatkowo w tym kroku, w tle:
- **Sprawdzenie bezpieczeństwa treści** (np. wulgaryzmy niepasujące do wybranej platformy, ryzykowne sformułowania) — jeśli coś wygląda na problematyczne, user widzi to jako łagodne ostrzeżenie przy danej platformie w kroku 3, a nie jako błąd blokujący cały post.
- **Oznaczenie "explicit"** — rap często ma wulgarny tekst; system powinien zapytać raz, przy pierwszym poście, czy treść jest explicit, i zapamiętać to jako domyślne ustawienie profilu (nie pytać za każdym razem).

---

## Krok 3 — Szybki przegląd (nie edycja od zera)

Jeden ekran, zakładki = platformy (tylko te podłączone, nic więcej). Pod każdą zakładką:

- Gotowy caption (edytowalny inline, bez osobnego "trybu edycji")
- Hashtagi jako "chippy" które można kliknąć żeby usunąć / dodać własny
- Miniatura wideo z możliwością wyboru klatki na okładkę (jedno przesuwane pole, nie osobny kreator)
- Licznik znaków widoczny tylko gdy user zbliża się do limitu (nie zawsze na widoku)

Rzeczy specyficzne dla platformy (np. TikTok: prywatność, komentarze/duet/stitch) pojawiają się **tylko na zakładce TikTok**, nie wiszą globalnie nad całym formularzem jak wcześniej. Tam samo znajduje się wymagana prawnie zgoda TikToka na warunki publikacji/wykorzystania muzyki (musi zostać zaznaczona, żeby przycisk publikacji na TikTok był aktywny — to jedyne miejsce, gdzie flow **musi** zablokować dalsze kroki).

Jeśli chodzi o featurowanie innych artystów (częste w rapie) — pole "oznacz artystę" przy captionie, które podpowiada `@` w zależności od platformy. To nowy element względem starej wersji, ale bardzo przydatny dla tej grupy użytkowników.

Nie ma tu przycisku "Generuj AI" — to się stało automatycznie w kroku 2. Jest tylko: *"Wygeneruj ponownie"* (mały link, nie duży przycisk) jeśli coś nie pasuje.

---

## Krok 4 — Gdzie i kiedy

- Domyślnie: **wszystkie podłączone platformy** zaznaczone (odznaczasz, jeśli czegoś nie chcesz).
- Data/godzina: system proponuje **jedną, najlepszą godzinę** na podstawie typowych szczytów aktywności dla muzyki/rapu (wieczór, czwartek-piątek) — user klika "Użyj" albo wybiera własną. Nie ma osobnego kalendarza-eksperta na start.
  ⚠️ *Zastrzeżenie z sekcji o Vercel Free niżej: na obecnym hostingu godzina jest orientacyjna ("w ciągu tego dnia"), nie co-do-minuty — UI musi to uczciwie komunikować, żeby nie obiecywać czegoś, czego backend nie dowiezie.*
- Dwa duże przyciski na dole, i tylko dwa: **"Opublikuj teraz"** / **"Zaplanuj"**. Nic więcej.
- Szkice (draft) znikają jako osobna koncepcja — jeśli user wyjdzie w połowie, wszystko zapisuje się automatycznie jako "niedokończony post" i wraca do tego samego miejsca, zamiast osobnej listy szkiców, które trzeba było ręcznie odtwarzać.

---

## Po publikacji

Jeden prosty ekran statusu per post: miniatura + 4 małe ikonki platform z kolorem (zielony = opublikowano, żółty = zaplanowane, czerwony = błąd z jasnym opisem po polsku typu *"TikTok: brak zgody na publikację — kliknij, żeby połączyć ponownie"*). Klik w błąd = jedna akcja naprawcza (retry/reconnect), nie stos technicznych logów.

Dla opublikowanych postów: proste liczby (wyświetlenia, polubienia, komentarze) prosto pod postem, bez przechodzenia do osobnej zakładki Analytics — to dobre miejsce, żeby początkujący raper od razu widział, co zadziałało, bez uczenia się nowego ekranu. Pełny Analytics zostaje jako miejsce do głębszej analizy w czasie, ale nie jest wymagany do zamknięcia pętli "wrzuciłem → widzę efekt".

---

## Co znika w porównaniu do starej wersji (i dlaczego to dobre dla początkującego)

- ❌ Osobny "Asystent AI" jako oddzielny przycisk do klikania — adaptacja AI jest teraz **domyślnym zachowaniem systemu**, nie dodatkową funkcją do odkrycia.
- ❌ "Zakres publikacji: wszystkie / wybrane" jako osobna decyzja — zastąpione checkboxami przy platformach w kroku 4.
- ❌ Toggle "auto-kadrowanie 9:16" bez żadnego efektu — albo realnie działa (auto-crop pod pionowy format), albo go nie ma.
- ❌ Oddzielna, niepowiązana z niczym lista "szkiców" — zastąpiona autozapisem w toku.
- ❌ Liczenie limitów planu w 2 miejscach (front i backend) — jedno źródło prawdy, front tylko je wyświetla.

---

## Co świadomie zostawiam poza tym flow (na razie)

Appka ma też funkcje "Kampanie" (tygodniowy plan treści) i osobną bibliotekę mediów. To realne, wartościowe funkcje, ale **nie powinny być częścią pierwszego, prostego flow dodawania posta** — dla początkującego rapera to na start przytłoczenie. Proponuję: kreator posta zostaje maksymalnie prosty tak jak wyżej, a "Kampanie" i "Biblioteka mediów" żyją jako osobne, opcjonalne miejsca w appce, do których user trafia dopiero gdy zacznie publikować regularnie i będzie chciał planować z wyprzedzeniem albo remiksować stare materiały (np. "opublikuj ponownie ten klip, zmień tylko caption"). To świadome ograniczenie zakresu, nie przeoczenie — chciałem to jasno zaznaczyć, żebyś wiedział, że o tym pomyślałem.

Też świadomie pomijam na start: temat limitów planu (FREE/PRO/BUSINESS) — skoro appka na razie jest tylko dla Ciebie, ten temat w ogóle znika z flow (patrz sekcja "Wersja tylko dla siebie" wyżej), a nie tylko jest odłożony na później.

---

## Wersja "tylko dla siebie" — co to upraszcza

Skoro na start appka jest tylko dla Ciebie (nie dla płacących userów), znika cała warstwa, która najbardziej napompowała starą wersję kreatora:

- **Zero planów/limitów/upsellu.** Wszystkie platformy zawsze odblokowane, brak liczników "X/Y uruchomień AI w tym miesiącu", brak przycisków "Przejdź na Pro". To był spory kawałek złożoności w starym `PostComposer.tsx` (billing capabilities, plan checkout, subtitle per plan) — teraz po prostu nie istnieje.
- **Zero Stripe.** Nie trzeba nawet myśleć o rozliczeniach, webhookach, `/api/billing/*` — to wszystko może zostać wyłączone/pominięte, dopóki appka nie ma drugiego użytkownika.
- **Vercel Hobby przestaje być problemem prawnym.** Skoro to użycie osobiste, non-commercial — dokładnie to, do czego Hobby jest przeznaczony. Zostaje tylko techniczne ograniczenie crona (raz na dobę, patrz sekcja niżej) — to nadal warto uczciwie pokazać w UI, ale nie ma presji "muszę przejść na Pro, bo ktoś płaci".
- **Auth może być trywialny.** Zamiast pełnego systemu kont/rejestracji/reset hasła (który w kodzie już istnieje, ale jest zbędny dla 1 osoby), wystarczy prosty dostęp — appka i tak działa tylko na Twoim koncie.

Krok 0 z flow (połącz konta) zostaje — to nie jest o wielu userach appki, tylko o Twoich kontach na TikToku/YouTube/IG/FB, które i tak trzeba podłączyć niezależnie od tego, ile appka ma użytkowników.

Jeśli kiedyś zechcesz to udostępnić innym raperom jako produkt — cała warstwa planów/Stripe już jest w starym kodzie napisana i można ją z powrotem włączyć. Ale nie projektujemy pod to teraz.

---

## Ograniczenia techniczne — Vercel Free/Hobby (ważne, wpływa na flow)

Projekt jest wdrożony na darmowym koncie Vercel (Hobby). To nie jest tylko szczegół infrastrukturalny — dotyka bezpośrednio dwóch rzeczy, o których mówimy w tym dokumencie:

1. **Harmonogram publikacji nie może być tak precyzyjny, jak sugeruje UI.**
   W `vercel.json` crony `/api/cron/publish` i `/api/cron/refresh-tokens` są ustawione na konkretne godziny (`0 3 * * *`, `0 4 * * *`). Na planie Hobby Vercel **pozwala na maksymalnie 1 uruchomienie crona na dobę**, z tolerancją "gdzieś w tej godzinie" (nie co do minuty). To znaczy: jeśli w kroku 4 wybierzesz "opublikuj o 18:00", post **fizycznie nie opublikuje się o 18:00** — poczeka do najbliższego przebiegu crona (raz dziennie, w nocy). Dla wychwycenia konkretnej godziny szczytu to realny problem, nie kosmetyka.
   - **Rozwiązanie krótkoterminowe (zero kosztów):** zamiast pola "godzina" pokazywać uczciwie *"publikacja tego dnia"* zamiast fałszywej precyzji co do minuty — nie obiecywać w UI czegoś, czego backend na tym planie nie dowiezie.
   - **Rozwiązanie docelowe, jeśli kiedyś zależy Ci na dokładnej godzinie:** darmowy zewnętrzny scheduler (np. cron-job.org) uderzający raz na godzinę w ten sam endpoint `/api/cron/publish` — to nie wymaga zmiany kodu appki ani przejścia na płatny plan Vercela, tylko innego "wywoływacza" tego samego adresu.

Poza tym: upload wideo już poprawnie używa `@vercel/blob/client` (upload bezpośrednio do storage, z pominięciem limitu rozmiaru requestu do funkcji) — to jeden z niewielu elementów w obecnym kodzie, który jest zrobiony dobrze pod kątem hostingu na Vercelu, więc tego nie trzeba ruszać.

---

## Tryb "tylko dla siebie" / "komercyjny" przez APP_MODE

Nowa zmienna środowiskowa `APP_MODE` (`personal` domyślnie, `commercial` gdy gotowy z JDG), rozwiązywana w jednym miejscu (`lib/server/app-mode.ts`), analogicznie do istniejącego `resolveBillingMode()`. To jest jedyne źródło prawdy — front i backend czytają z niego, żadnej duplikacji logiki (to był jeden z problemów w starej wersji: limity liczone osobno na froncie i backendzie).

**Tryb `personal` wyłącza:**
- Rejestrację nowych kont (`/api/auth/register` odrzuca request, jeśli w bazie istnieje już 1 użytkownik).
- Wszystkie limity planu — `assertUsageAllowed`, `assertScheduleWindowAllowed`, `getSubscriptionSnapshot` w `lib/server/subscription.ts` zwracają "bez limitów" zamiast liczyć realne zużycie.
- Cały UI billingowy (`/billing`, upsell w kreatorze, liczniki AI runs) — sterowane osobną publiczną flagą `NEXT_PUBLIC_APP_MODE`, bo backendowa zmienna środowiskowa nie jest widoczna w przeglądarce.

**Tryb `commercial` włącza z powrotem dokładnie to, co appka już dziś ma zaimplementowane** (rejestracja, limity, Stripe, upsell) — zero nowego kodu na tę gałąź, tylko flaga.

**Wymóg jakości:** przed każdym wdrożeniem ten sam zestaw testów integracyjnych uruchamiany jest dwukrotnie — raz jako `APP_MODE=personal`, raz jako `APP_MODE=commercial`. Kluczowe scenariusze do pokrycia testem (nie tylko ręcznym sprawdzeniem):
1. Rejestracja: zablokowana w `personal` po 1. koncie, działająca w `commercial`.
2. `enqueue publish job` → caption i hashtagi faktycznie trafiają do rekordu w bazie i są tym, co wychodzi do platformy (test na to, co złapałem wcześniej jako bug w starej wersji).
3. Limity planu: w `personal` nieaktywne (można dodać 4 platformy na FREE), w `commercial` wymuszane zgodnie z planem.
4. Zgoda TikTok — wymagana w obu trybach (to nie jest kwestia planu, tylko wymogu prawnego TikToka).

---

## Nadzór nad pracami wdrożeniowymi (zamiast "agenta nadzorcy")

Realną gwarancję poprawności daje nie kolejny model AI patrzący na pracę innego, tylko trzyelementowy proces, wymuszany niezależnie od tego, kto/co pisze kod:

1. **Ten dokument jako kontrakt.** Każda zmiana zaczyna się od planu porównanego z tym plikiem, zanim padnie pierwsza linijka kodu.
2. **Testy integracyjne jako sędzia** — nie opinia, tylko przechodzi/nie przechodzi. Uruchamiane w obu trybach `APP_MODE` przy każdym wdrożeniu.
3. **Świeża sesja jako code review** — po implementacji, nowa sesja (bez kontekstu "jak to pisałem") dostaje diff + ten dokument z jednym zadaniem: znaleźć rozjazdy między tym, co obiecuje UI, a tym, co faktycznie robi backend.

Do samej pracy nad kodem (migracja Prisma, zmiany w wielu plikach, uruchamianie testów) właściwe narzędzie to Claude Code — pracuje bezpośrednio na repozytorium, a nie w tym czacie.

---

## Techniczna podstawa modelu danych (skrót dla dewelopera)

Żeby powyższy flow działał *poprawnie*, a nie tylko ładnie wyglądał, potrzebne są w modelu danych trzy zmiany, nie jedna:

1. **Caption/hashtagi/tytuł per platforma, na rekordzie zadania publikacji** — nie osobno w "szkicu" i nie zastępowane tytułem/opisem samego pliku wideo. To jest warunek konieczny, żeby krok 3 ("to co widzisz, to co się opublikuje") był prawdziwy.
2. **Scalenie `Draft` z `PublishJob` w jeden model** ze statusem `DRAFT | SCHEDULED | PUBLISHING | PUBLISHED | FAILED`. Dzisiejszy `Draft` to ślepa gałąź (zero endpointu, który zamienia go w realną publikację) — "autozapis niedokończonego posta" z kroku 4 to w praktyce ten sam rekord, tylko w statusie `DRAFT`, bez potrzeby osobnej tabeli i osobnego flow odtwarzania.
3. **Wspólny identyfikator grupujący** (`postGroupId` / `submissionId`) na rekordach z jednej "wysyłki" kreatora — dziś każda platforma to osobny, niepowiązany ze sobą `PublishJob`. Ekran "Po publikacji" (4 ikonki platform pod jedną miniaturą) wymaga sposobu, żeby połączyć te rekordy z powrotem w jeden "post" w UI.

## Rozbicie komponentu `PostComposer.tsx`

1440-linowy komponent trzeba rozbić na mniejsze, jednozadaniowe części (np.):
- `MediaStep.tsx` — upload/wybór materiału (krok 1)
- `ContentPreviewStep.tsx` + `PlatformCaptionTab.tsx` — przegląd/edycja per platforma (krok 3)
- `TikTokSettingsPanel.tsx` — wydzielone z reszty, renderowane tylko gdy TikTok jest w grze
- `ScheduleStep.tsx` — krok 4
- `usePostComposerState.ts` — jeden hook/reducer zamiast kilkunastu `useState`, jako jedyne źródło prawdy stanu kreatora

## Dodatkowy bug do naprawienia (niezależny od flow, ale wart naprawy przy okazji)

`app/api/orchestrate-content/route.ts` woła `assertUsageAllowed`/`incrementUsage` dla metryki `publish_jobs` nawet gdy `mode: 'ai-autopilot'` i `publishMode: 'draft'` — czyli samo wygenerowanie opisów AI (bez żadnej publikacji) zjada limit publikacji. W trybie `personal` to niewidoczne (limity wyłączone), ale to prawdziwy bug logiczny, który ujawni się w trybie `commercial` — do naprawienia przy tej samej okazji.

## Uwaga o istniejącym `smart-autopilot/safety.ts`

Ten plik dziś broni **wejścia użytkownika przed AI** (prompt injection, wyciek PII) — to nie jest to samo, co "sprawdzenie czy caption pasuje do platformy / flaga explicit" opisane w Kroku 2 tego dokumentu. To nowa funkcjonalność do dopisania, a nie coś, co już istnieje i wystarczy podłączyć.

## Testy — od zera

W projekcie **nie ma dziś żadnego frameworka testowego** (brak Jest/Vitest/Playwright w `package.json`). Wymóg "testy integracyjne w obu trybach `APP_MODE`" z tego dokumentu wymaga najpierw dodania takiego frameworka (rekomendacja: Vitest do testów API/integracyjnych na bazie testowej), a dopiero potem napisania samych testów.

Jeśli chcesz, mogę to teraz przełożyć na konkretny plan wdrożenia (zmiany w bazie danych + podział komponentu) albo na klikalną makietę tego flow, żebyś zobaczył jak to wygląda w praniu.

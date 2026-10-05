# YouTube (Google): nagranie i zgłoszenie review

Są **dwa osobne procesy**, wykonywane po kolei:
1. **Weryfikacja OAuth w Google.** Bez niej przy łączeniu kanału pojawia się ekran „Google hasn't verified this app” i obowiązuje limit 100 użytkowników.
2. **Audyt YouTube API.** Bez niego YouTube **wymusza widoczność „prywatny”** na każdym filmie wgranym przez Postfly.

Wymagania: [Sensitive scope verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification) (19.08.2026), [YouTube API Developer Policies](https://developers.google.com/youtube/terms/developer-policies) (14.09.2026).
Postfly spełnia je od PR #123 i #124:
- wybór widoczności bez wartości domyślnej;
- podgląd tytułu i opisu;
- link do Warunków YouTube;
- odwołanie tokenu przy rozłączeniu konta;
- usuwanie statystyk po 30 dniach;
- wymagane zapisy w polityce prywatności;
- oficjalne logo i przycisk Google.

## 0. Najpierw etap 1 z [README](README.md)

Środki w Anthropic, domena w Resend, konto recenzenta (`REVIEWER_EMAILS`) i test generalny. Bez tego nagranie pokaże YouTube jako „Wkrótce” albo komunikat o niedostępnym AI.

## 1. Przed nagraniem: konfiguracja w Google Cloud Console

Projekt `raperapp` (numer 1043758221513), klient „Klient internetowy 1” → menu **Google Auth Platform**. Stan sprawdzony **5.10.2026**: wszystko poniżej jest zrobione.

- [x] **Weryfikacja domeny.** W [Google Search Console](https://search.google.com/search-console) dodaj usługę typu *Domena* `postfly.pl` i potwierdź ją rekordem DNS TXT. Zrób to tym samym kontem Google, które jest Owner lub Editor projektu.
- [x] **Branding**:
  - App name: `PostFly` (**nie zmieniaj**: marka jest już zatwierdzona, zmiana zresetowałaby ten etap; bez słowa „YouTube” w nazwie);
  - logo: Postfly;
  - User support email;
  - App home page: `https://postfly.pl`;
  - Privacy policy: `https://postfly.pl/privacy`;
  - Terms of service: `https://postfly.pl/terms`;
  - Authorized domains: `postfly.pl`;
  - Developer contact email.
- [x] **Clients**: w kliencie OAuth (Web) redirect URI `https://postfly.pl/api/auth/callback/youtube` (oraz `…/api/auth/google/callback` dla logowania).
- [x] **Data Access**: tylko te scope'y. Usuń inne, jeśli są:
  - `openid`
  - `.../auth/userinfo.email`
  - `.../auth/userinfo.profile`
  - `.../auth/youtube.upload`
  - `.../auth/youtube.readonly`
- [x] **Audience**: Publishing status = **In production** (przycisk „Publish app”).
- [x] Kanał YouTube podłączony do konta recenzenta, próbna publikacja (prywatna) działa.

**Tuż przed nagraniem (żeby ekrany zgody na pewno się pokazały):**
1. Wejdź na https://myaccount.google.com/permissions (zalogowany kontem Google z kanałem YouTube) → **PostFly** → **Usuń wszystkie połączenia / Remove access**. Przy logowaniu przez Google ekran zgody pokazuje się tylko za pierwszym razem; po usunięciu dostępu zobaczysz go znowu w scenie 1b. TikToka to nie dotyczy.
2. W Postfly na koncie recenzenta **Połączone konta → YouTube → Rozłącz** (w scenie 2 łączysz od zera).
3. Język konta Google na czas nagrania: **English** (https://myaccount.google.com/language), wtedy oba ekrany zgody są po angielsku bez przełączania.

## 2. Scenariusz filmu do weryfikacji OAuth

Wymagania Google:
- film po angielsku (napisy), a **ekran zgody Google w języku angielskim** (Google wymaga tego wprost, same napisy nie wystarczą);
- **pasek adresu widoczny w każdej scenie** (Google sprawdza domenę i `client_id`);
- **widoczna nazwa aplikacji na ekranie zgody**;
- **widoczny `client_id` w pasku adresu**;
- pokazane użycie każdego wrażliwego scope'a.

| # | Co robisz na ekranie | Napis (EN) |
|---|---|---|
| 1 | Otwórz `https://postfly.pl`, przewiń do sekcji **„Integracje”** (karta YouTube z opisem, co aplikacja robi z kanałem), potem do stopki, otwórz **Politykę Prywatności** i przewiń do sekcji **14** (YouTube/Google, z angielskim podsumowaniem). | Postfly home page and privacy policy, including the section on YouTube API Services and Google user data (Limited Use). |
| 1b | **Logowanie przez Google** (ten sam klient OAuth co YouTube, Google wymaga pokazania wszystkich): `https://postfly.pl/login` → **„Zaloguj się przez Google”** → ekran zgody po angielsku z nazwą **PostFly** i `client_id` w pasku adresu → zaakceptuj → pulpit → **wyloguj się**. | Sign in with Google uses the same OAuth client: openid, email and profile only identify the user's Postfly account. |
| 2 | **„Zaloguj się”** do Postfly na konto testowe z [README](README.md) (adres z `REVIEWER_EMAILS`) → menu **„Połączone konta”** → karta YouTube → **„Kontynuuj z Google”**. | The user connects their YouTube channel with Google OAuth. |
| 3 | **Ekran zgody Google: zatrzymaj się.** Jeśli jest po polsku, zmień język w selektorze **na dole ekranu** na **English (United States)** (albo przed nagraniem ustaw język konta Google na angielski). Kliknij w pasek adresu, żeby był widoczny cały URL z **`client_id=…`**. Pokaż nazwę **„PostFly”** i listę uprawnień (zaznacz oba pola, jeśli Google pokazuje je jako checkboxy). Zaakceptuj. | Google consent screen: app name "PostFly" and the OAuth client ID in the address bar. The user grants youtube.upload and youtube.readonly. |
| 4 | Powrót do Postfly: kanał widoczny jako połączony. | The YouTube channel is connected. |
| 5 | **„Nowy post”** → **„Wgraj materiał”** (własny film) → w polu **„O czym jest ten post?”** wpisz jedno zdanie → **„Dalej”** → zakładka **YouTube**: pokaż tytuł i opis zaproponowane przez AI, potem wpisz własny **„Tytuł”**, popraw opis i hashtagi. | youtube.upload: the title and description are suggested by AI from the user's own note and fully edited by the user. |
| 6 | **„Dalej”** → blok **„Publikacja na YouTube (YouTube upload)”**: pokaż podgląd tytułu i opisu. Rozwiń **„Widoczność filmu (Visibility)”**: nic nie jest wybrane. Wybierz **„Prywatny (Private)”**. Pokaż link **„YouTube Terms of Service”**. | The exact title and description that will be sent are shown. The user must choose the visibility (no default) and agrees to the YouTube Terms of Service. |
| 7 | **„Opublikuj teraz”** → ekran statusu → **„Opublikowano”** → **„Zobacz post”** → film na YouTube. | The video is uploaded only after the user clicks Publish, with exactly the chosen settings. |
| 8 | Menu **„Rozwój”**: liczba subskrybentów kanału (w razie potrzeby **„Odśwież teraz”**). Menu **„Analityka”** → sekcja **„Wyniki opublikowanych postów”** → **„Odśwież statystyki”**: wiersz YouTube z wyświetleniami, polubieniami i komentarzami filmu. | youtube.readonly: subscriber count of the user's own channel and statistics of their own videos. Stored at most 30 days. |
| 9 | **„Połączone konta”** → przy kanale YouTube **„Rozłącz”**. | Disconnecting revokes the Google token immediately and deletes the channel's data from Postfly. |

**Po nagraniu** połącz YouTube ponownie na koncie recenzenta (Google może sam przetestować aplikację) i przywróć język konta Google.

Na nagraniu wybierz „Prywatny”: przed audytem YouTube i tak wymusza tę widoczność, a wtedy nagranie zgadza się z efektem.

**Ekran „Google hasn't verified this app”** między scenami 2 i 3 jest przed weryfikacją normalny. Kliknij **„Advanced” → „Go to PostFly (unsafe)”** i nagrywaj dalej. Google wie, że aplikacja jest w trakcie weryfikacji, i tego nie ocenia. Najważniejsze, żeby na samym ekranie zgody były widoczne nazwa „PostFly”, lista uprawnień i `client_id`.

**Wgraj film na YouTube jako „Niepubliczny” (Unlisted)** i skopiuj link. Ten link podajesz we wniosku.

## 2b. Stan weryfikacji (sprawdzony 5.10.2026)

Wniosek jest w toku od marca 2026 (projekt `raperapp`, klient „Klient internetowy 1”, nazwa aplikacji **PostFly**: zostaje, bo marka jest już zatwierdzona, a zmiana nazwy zresetowałaby ten etap).
- ✅ Wymagania dotyczące strony głównej, ✅ wskazówki dotyczące marki (30.06.2026).
- ❌ Funkcje aplikacji (23.03.2026): „film demonstracyjny nie pokazuje procesu wyrażania zgody OAuth”.
- Do zrobienia: nowy film (sceny 1b i 3 szczególnie starannie), uzasadnienie zakresów po angielsku w **Dostęp do danych**, nowy link do filmu w tym samym miejscu, a potem **odpowiedź w wątku e-mailowym** od Google (nie nowy wniosek).

## 3. Wysłanie poprawki do weryfikacji OAuth: krok po kroku

Wniosek już trwa (punkt 2b), więc **nie składasz nowego**: aktualizujesz dane i odpowiadasz w wątku e-mailowym.

1. Wgraj film na YouTube jako **Niepubliczny (Unlisted)** i skopiuj link.
2. Google Cloud Console → **Google Auth Platform → Dostęp do danych**: w polu „W jaki sposób zakresy będą używane?” wklej tekst z punktu 4, a w polu „Link do YouTube” nowy link → **Save** → **Potwierdź**. Rób to **jeden raz**, wszystko naraz (każdy zapis aktualizuje wniosek).
3. W Gmailu znajdź wątek od Google w sprawie weryfikacji projektu `raperapp` (nadawca typu `api-oauth-dev-verification-reply@google.com`) i **odpowiedz w nim** tekstem z punktu 3b.
4. Pozostałe informacje dla zespołu weryfikacji:
   - zgodność z [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy) potwierdza polityka prywatności, punkt 14;
   - jeśli zespół weryfikacji poprosi o **konto testowe**: *Test account: https://postfly.pl → "Zaloguj się" (Log in), email <E-MAIL KONTA RECENZENTA>, password <HASŁO>. While verification is pending, the YouTube connection is enabled only for this test account; other accounts see YouTube as "Wkrótce" (coming soon).*
4. Odpowiadaj na maile od zespołu weryfikacji (przychodzą na adres kontaktowy z Brandingu). Często proszą o drobne poprawki: przekaż mi je, a poprawię.
5. Czas: zwykle 2–4 tygodnie.

### 3b. Odpowiedź w wątku e-mailowym Google (wklej, wstaw link)

> Hello,
>
> Thank you for the review. We have recorded a new demo video that shows the complete OAuth consent flow for our only OAuth client: Sign in with Google, and connecting a YouTube channel. Both consent screens are shown in English with the app name and the OAuth client ID visible in the address bar; the user grants youtube.upload and youtube.readonly, and the video then demonstrates how each scope is used in the app.
>
> Demo video (unlisted): <LINK DO FILMU>
>
> Since the previous submission we also updated the app: the user must explicitly choose the video visibility (no default), titles and descriptions are never truncated, YouTube statistics are shown to the user on the Analytics screen, and data received from YouTube API Services is not sent to any AI service. Privacy policy: https://postfly.pl/privacy
>
> Best regards,
> Paweł Sawczuk

## 4. Uzasadnienie zakresów (pole „W jaki sposób zakresy będą używane?”, limit 1000 znaków)

Jedno pole na oba zakresy wrażliwe (ok. 880 znaków):

> Postfly is a web app for creators and small businesses to publish their own content to their own social accounts.
> youtube.upload: uploads a video the user prepared in Postfly to the user's own YouTube channel, only after the user clicks "Publish now". The user writes the title and description (shown before publishing, never truncated) and must choose the visibility (public, unlisted or private, no default). Uploads use videos.insert. No narrower scope allows uploading videos.
> youtube.readonly: shows the user the subscriber count of their own channel (channels.list) and statistics of videos they published through Postfly (videos.list) on the Growth and Analytics screens. youtube.upload cannot read these statistics. YouTube data is not sent to any AI service, never sold, shared or used for ads, and is refreshed or deleted within 30 days. Disconnecting revokes the token.

*openid / email / profile* nie są wrażliwe: służą do „Zaloguj się przez Google” (Sign in with Google) i nie wymagają uzasadnienia.

## 5. Audyt YouTube API (po zatwierdzeniu weryfikacji OAuth)

Formularz: [YouTube API Services – Audit and Quota Extension Form](https://support.google.com/youtube/contact/yt_api_form).

Przygotuj:
- **numer projektu Google Cloud** (Project number, strona główna projektu);
- **link do filmu** z punktu 2 (ten sam);
- **zrzuty ekranu**:
  1. blok „Publikacja na YouTube” (widoczność i podgląd tytułu i opisu);
  2. ekran „Rozwój” ze statystykami kanału i „Analityka” → „Wyniki opublikowanych postów” ze statystykami filmu;
  3. polityka prywatności, sekcja 14;
  4. regulamin, punkt 4 (zapis o YouTube Terms of Service);
  5. karta YouTube w „Połączone konta” (oficjalne logo i „Kontynuuj z Google”);
- **opis zastosowania**: *Postfly uploads a creator's own videos to their own channel only after an explicit user action, with the title, description and visibility chosen by the user and shown before publishing. It shows the user statistics of their own channel and videos (YouTube data is not sent to any AI service). Titles and descriptions may be suggested by AI from the user's own note and are always edited and approved by the user. API data is stored for at most 30 days. Tokens are revoked and data deleted on disconnect. Privacy policy: https://postfly.pl/privacy, terms: https://postfly.pl/terms.*;
- **limity**: domyślnie projekt ma 100 wywołań `videos.insert` dziennie i 10 000 jednostek na pozostałe metody. Na start to wystarcza. Jeśli prosisz o więcej, podaj realistyczną dzienną liczbę uploadów wszystkich użytkowników.

Po pozytywnym audycie filmy wgrywają się z widocznością wybraną przez użytkownika.

## 6. AI a dane Google (jeśli Google zapyta)

Google może zapytać, czy aplikacja przekazuje dane użytkowników Google do usług AI. Odpowiedź (zgodna z polityką prywatności, punkt 6 i 14):

> Postfly uses Anthropic (Claude) as a data processor only to suggest a title and description from the user's own note and the thumbnail of the user's own video, before it is uploaded. Data received from YouTube API Services (channel and video statistics) is not sent to any AI service. Google user data is not used to train AI models, is not sold and is not used for advertising, in line with the Google API Services User Data Policy, including the Limited Use requirements.

## 7. Logowanie przez Google („Zaloguj się przez Google”)

Używa tylko `openid`, `email` i `profile`, które nie są wrażliwe.
- Jeśli `GOOGLE_LOGIN_CLIENT_ID` jest w **tym samym projekcie** co YouTube, obejmuje go weryfikacja z punktu 3.
- Jeśli to **osobny projekt**, wystarczy w nim Branding z punktu 1, domena i status „In production”. Weryfikacja marki nie wymaga nagrania.

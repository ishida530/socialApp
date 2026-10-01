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

## 1. Przed nagraniem: konfiguracja w Google Cloud Console

Projekt, z którego pochodzi `GOOGLE_CLIENT_ID` (YouTube) → menu **Google Auth Platform**:

- [ ] **Weryfikacja domeny.** W [Google Search Console](https://search.google.com/search-console) dodaj usługę typu *Domena* `postfly.pl` i potwierdź ją rekordem DNS TXT. Zrób to tym samym kontem Google, które jest Owner lub Editor projektu.
- [ ] **Branding**:
  - App name: `Postfly` (bez słowa „YouTube” w nazwie);
  - logo: Postfly;
  - User support email;
  - App home page: `https://postfly.pl`;
  - Privacy policy: `https://postfly.pl/privacy`;
  - Terms of service: `https://postfly.pl/terms`;
  - Authorized domains: `postfly.pl`;
  - Developer contact email.
- [ ] **Clients**: w kliencie OAuth (Web) redirect URI `https://postfly.pl/api/auth/callback/youtube`.
- [ ] **Data Access**: tylko te scope'y. Usuń inne, jeśli są:
  - `openid`
  - `.../auth/userinfo.email`
  - `.../auth/userinfo.profile`
  - `.../auth/youtube.upload`
  - `.../auth/youtube.readonly`
- [ ] **Audience**: Publishing status = **In production** (przycisk „Publish app”).
- [ ] Na nagraniu użyj kanału YouTube z **co najmniej jednym** wcześniejszym filmem, żeby ekran „Rozwój” pokazywał dane.

## 2. Scenariusz filmu do weryfikacji OAuth

Wymagania Google:
- film po angielsku (napisy);
- **widoczna nazwa aplikacji na ekranie zgody**;
- **widoczny `client_id` w pasku adresu**;
- pokazane użycie każdego wrażliwego scope'a.

| # | Co robisz na ekranie | Napis (EN) |
|---|---|---|
| 1 | Otwórz `https://postfly.pl`, przewiń do stopki, otwórz **Politykę Prywatności** i przewiń do sekcji **14** (YouTube/Google, z angielskim podsumowaniem). | Postfly home page and privacy policy, including the section on YouTube API Services and Google user data (Limited Use). |
| 2 | **„Zaloguj się”** do Postfly → menu **„Połączone konta”** → karta YouTube → **„Kontynuuj z Google”**. | The user connects their YouTube channel with Google OAuth. |
| 3 | **Ekran zgody Google: zatrzymaj się.** Kliknij w pasek adresu, żeby był widoczny cały URL z **`client_id=…`**. Pokaż nazwę **„Postfly”** i listę uprawnień. Zaakceptuj. | Google consent screen: app name "Postfly" and the OAuth client ID in the address bar. The user grants youtube.upload and youtube.readonly. |
| 4 | Powrót do Postfly: kanał widoczny jako połączony. | The YouTube channel is connected. |
| 5 | **„Nowy post”** → **„Wgraj materiał”** (własny film) → **„Dalej”** → zakładka **YouTube**: wpisz **„Tytuł”**, popraw opis i hashtagi. | youtube.upload: the user writes the video title and description. |
| 6 | **„Dalej”** → blok **„Publikacja na YouTube (YouTube upload)”**: pokaż podgląd tytułu i opisu. Rozwiń **„Widoczność filmu (Visibility)”**: nic nie jest wybrane. Wybierz **„Prywatny (Private)”**. Pokaż link **„YouTube Terms of Service”**. | The exact title and description that will be sent are shown. The user must choose the visibility (no default) and agrees to the YouTube Terms of Service. |
| 7 | **„Opublikuj teraz”** → ekran statusu → **„Opublikowano”** → **„Zobacz post”** → film na YouTube. | The video is uploaded only after the user clicks Publish, with exactly the chosen settings. |
| 8 | Menu **„Rozwój”**: liczba subskrybentów kanału. Menu **„Analityka”**: statystyki filmu. | youtube.readonly: subscriber count of the user's own channel and statistics of their own videos. Stored at most 30 days. |
| 9 | **„Połączone konta”** → przy kanale YouTube **„Rozłącz”**. | Disconnecting revokes the Google token immediately and deletes the channel's data from Postfly. |

Na nagraniu wybierz „Prywatny”: przed audytem YouTube i tak wymusza tę widoczność, a wtedy nagranie zgadza się z efektem.

**Wgraj film na YouTube jako „Niepubliczny” (Unlisted)** i skopiuj link. Ten link podajesz we wniosku.

## 3. Zgłoszenie weryfikacji OAuth: krok po kroku

1. Google Cloud Console → **Google Auth Platform → Verification Center** (Centrum weryfikacji).
2. Sprawdź, czy lista kontrolna jest zielona: branding, domena, linki i scope'y.
3. **Submit for verification** (Prześlij do weryfikacji). Formularz poprosi o:
   - **uzasadnienie każdego wrażliwego scope'a**: wklej teksty z punktu 4;
   - **link do filmu demo**: link Unlisted z punktu 2;
   - potwierdzenie zgodności z [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy).
4. Odpowiadaj na maile od zespołu weryfikacji (przychodzą na adres kontaktowy z Brandingu). Często proszą o drobne poprawki: przekaż mi je, a poprawię.
5. Czas: zwykle 2–4 tygodnie.

## 4. Uzasadnienia scope'ów (do wklejenia)

- **youtube.upload**: *Postfly lets creators publish their own videos to their own YouTube channel. The user writes the title and description, chooses the visibility (public, unlisted or private, with no default) and explicitly clicks "Publish now". The app then uploads that single video with videos.insert, with exactly the values shown to the user. There is no narrower scope that allows uploading videos.*
- **youtube.readonly**: *Used only to show the user statistics of their own channel (subscriber count, channels.list part=statistics) and of the videos they published through Postfly (videos.list part=statistics) on the Growth and Analytics screens. The data is never shared or used for advertising, and is refreshed or deleted within 30 days. youtube.upload does not allow reading these statistics, and no narrower read-only scope covers them.*
- *openid / email / profile*: these scopes are not sensitive. They serve „Zaloguj się przez Google” (Sign in with Google) and identify the connected account.

## 5. Audyt YouTube API (po zatwierdzeniu weryfikacji OAuth)

Formularz: [YouTube API Services – Audit and Quota Extension Form](https://support.google.com/youtube/contact/yt_api_form).

Przygotuj:
- **numer projektu Google Cloud** (Project number, strona główna projektu);
- **link do filmu** z punktu 2 (ten sam);
- **zrzuty ekranu**:
  1. blok „Publikacja na YouTube” (widoczność i podgląd tytułu i opisu);
  2. ekran „Rozwój” ze statystykami kanału;
  3. polityka prywatności, sekcja 14;
  4. regulamin, punkt 4 (zapis o YouTube Terms of Service);
  5. karta YouTube w „Połączone konta” (oficjalne logo i „Kontynuuj z Google”);
- **opis zastosowania**: *Postfly uploads a creator's own videos to their own channel only after an explicit user action, with the title, description and visibility chosen by the user and shown before publishing. It shows the user statistics of their own channel and videos. API data is stored for at most 30 days. Tokens are revoked and data deleted on disconnect. Privacy policy: https://postfly.pl/privacy, terms: https://postfly.pl/terms.*;
- **limity**: domyślnie projekt ma 100 wywołań `videos.insert` dziennie i 10 000 jednostek na pozostałe metody. Na start to wystarcza. Jeśli prosisz o więcej, podaj realistyczną dzienną liczbę uploadów wszystkich użytkowników.

Po pozytywnym audycie filmy wgrywają się z widocznością wybraną przez użytkownika.

## 6. Logowanie przez Google („Zaloguj się przez Google”)

Używa tylko `openid`, `email` i `profile`, które nie są wrażliwe.
- Jeśli `GOOGLE_LOGIN_CLIENT_ID` jest w **tym samym projekcie** co YouTube, obejmuje go weryfikacja z punktu 3.
- Jeśli to **osobny projekt**, wystarczy w nim Branding z punktu 1, domena i status „In production”. Weryfikacja marki nie wymaga nagrania.

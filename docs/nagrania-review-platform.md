# Review platform: co nagrać, żeby przeszło

Stan na **1.10.2026**. Wymagania sprawdzone dziś w oficjalnych dokumentach:
- [TikTok Content Sharing Guidelines](https://developers.tiktok.com/doc/content-sharing-guidelines) i [App Review Guidelines](https://developers.tiktok.com/doc/app-review-guidelines), aktualizacja 4.08.2026;
- [Meta: Screen Recordings](https://developers.facebook.com/docs/app-review/submission-guide/screen-recordings/) i [Instagram App Review](https://developers.facebook.com/docs/instagram-platform/app-review);
- [Google: Sensitive scope verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification), aktualizacja 19.08.2026;
- [YouTube API Developer Policies](https://developers.google.com/youtube/terms/developer-policies), aktualizacja 14.09.2026.

## Czy kod jest gotowy?

| Platforma | Kod | Co zostało po Twojej stronie |
|---|---|---|
| **TikTok** (Content Posting API, Direct Post) | ✅ gotowy (PR #120, #121) | portal TikTok (weryfikacja `postfly.pl`, scope'y), nagranie, wniosek |
| **Facebook + Instagram** (publikacja) | ✅ gotowy. Uprawnienia do publikacji masz już zatwierdzone (Advanced Access), więc **nowe review nie jest potrzebne** | potwierdź w panelu Meta: tryb Live + Advanced Access (pkt 2.1) |
| **Facebook + Instagram** (odpowiedzi na komentarze) | ✅ gotowy | **nowe review** dla `pages_manage_engagement` i `instagram_manage_comments`, tylko jeśli chcesz tę funkcję (pkt 2.2) |
| **YouTube** | ✅ gotowy po wdrożeniu PR „YouTube policy compliance” (wybór widoczności, podgląd tytułu i opisu, link do Warunków YouTube, odwołanie tokenu przy rozłączeniu, usuwanie statystyk po 30 dniach, wymagane zapisy w polityce prywatności) | konfiguracja w Google Cloud, nagranie i weryfikacja OAuth, potem audyt YouTube API (pkt 3) |

## Zasady wspólne dla wszystkich nagrań

- Nagrywaj na **https://postfly.pl** (produkcja), w **1080p**, z większym kursorem myszy i bez dźwięku. Meta i TikTok nie słuchają ścieżki audio.
- Interfejs jest po polsku, więc **dodaj angielskie napisy** do każdej sceny. Meta i Google wprost tego wymagają, gdy UI nie jest po angielsku. Gotowe napisy są w tabelach poniżej.
- Pokazuj przepływ **od wylogowania**: logowanie do Postfly → połączenie konta → użycie każdego uprawnienia → efekt na platformie.
- Każdy element trzymaj na ekranie 2–3 sekundy. Nie przyspieszaj nagrania.
- Jeśli na nagraniu pojawi się błąd, nagraj od nowa.

---

## 1. TikTok

Pełny scenariusz (19 scen z napisami EN): **[tiktok-demo-nagranie.md](tiktok-demo-nagranie.md)**.
Lista kontrolna i tekst wniosku: [tiktok-audit-ponowne-zgloszenie.md](tiktok-audit-ponowne-zgloszenie.md).

Przed nagraniem zrób w portalu TikTok:
1. *Manage URL properties*: zweryfikuj `https://postfly.pl/`.
2. Usuń z aplikacji `video.upload` i `user.info.profile`.
3. Redirect URI: `https://postfly.pl/api/auth/callback/tiktok`. Website URL: `https://postfly.pl`.

Format: maksymalnie 5 plików po 50 MB. Domena na nagraniu musi być taka sama jak Website URL we wniosku.

---

## 2. Meta (Facebook + Instagram)

### 2.1 Publikacja: najpierw sprawdź, bez nagrywania
Produkcja prosi wyłącznie o uprawnienia, które już masz zatwierdzone:
- Facebook: `pages_show_list`, `pages_manage_posts`, `pages_read_engagement`;
- Instagram: dodatkowo `instagram_basic`, `instagram_content_publish`, `business_management`.

W [Meta for Developers](https://developers.facebook.com/apps) → Twoja aplikacja sprawdź:
- **App Mode = Live**;
- **App Review → Permissions and Features**: przy każdym z uprawnień wyżej „Advanced access”;
- **Business verification** zakończona.

Jeśli wszystko się zgadza, nic nie nagrywasz. Jeśli któreś uprawnienie ma tylko „Standard access”, nagraj scenariusz 2.3 dla tej platformy.

### 2.2 Odpowiedzi na komentarze (opcjonalne, nowe review)
Funkcja „Społeczność → Sprawdź komentarze → Wyślij odpowiedź” potrzebuje `pages_manage_engagement` (Facebook) i `instagram_manage_comments` (Instagram). W App Review → *Request advanced access* dla obu uprawnień wgraj **osobne nagranie dla każdego**:

| # | Co robisz | Napis (EN) |
|---|---|---|
| 1 | Wyloguj się z Postfly i zaloguj ponownie e-mailem i hasłem. | The user logs in to Postfly. |
| 2 | Połączone konta → Facebook/Instagram → „Połącz”. W oknie Facebooka kliknij „Edytuj ustawienia”, **zaznacz Stronę** (i konto IG), pokaż listę uprawnień i zaakceptuj. | The user connects their Facebook Page / Instagram professional account and grants the requested permissions, choosing which Page the app may access. |
| 3 | Na Facebooku lub Instagramie dodaj (z innego konta) komentarz pod postem opublikowanym przez Postfly. | A follower comments on a post the user published with Postfly. |
| 4 | Postfly → menu „Społeczność” → „🔄 Sprawdź komentarze teraz”. Komentarz pojawia się na liście. | pages_read_engagement / instagram_manage_comments: Postfly reads new comments on the user's own posts. |
| 5 | Przy komentarzu wpisz odpowiedź (lub użyj sugestii) → „Wyślij”. | pages_manage_engagement / instagram_manage_comments: the user replies to the comment from Postfly. Nothing is sent without this click. |
| 6 | Otwórz post na Facebooku/Instagramie i pokaż odpowiedź pod komentarzem. | The reply appears under the comment on Facebook/Instagram. |

**Po zatwierdzeniu** (ja to zrobię): dodam oba uprawnienia do `FACEBOOK_OAUTH_SCOPES` / `INSTAGRAM_OAUTH_SCOPES` w Vercelu. Konta trzeba będzie wtedy połączyć ponownie.

W polu „Instructions for reviewers” podaj login i hasło **testowego konta Postfly** (załóż je na `postfly.pl/register`) oraz krok po kroku, gdzie kliknąć: Połączone konta → Połącz → Społeczność.

### 2.3 Publikacja (tylko jeśli Meta poprosi o ponowne review)

| # | Co robisz | Napis (EN) |
|---|---|---|
| 1 | Logowanie do Postfly, połączenie Facebooka i Instagrama (wybór Strony i konta IG w oknie Facebooka). | The user connects their own Facebook Page and Instagram professional account (pages_show_list, business_management, instagram_basic). |
| 2 | „Nowy post” → wgraj zdjęcie lub film → zakładki Facebook/Instagram: edytuj opis i hashtagi. | The user writes the caption and hashtags for each platform. |
| 3 | „Dalej” → zaznacz Facebook i Instagram → „Opublikuj teraz”. | The user explicitly publishes to their Page and Instagram account (pages_manage_posts, instagram_content_publish). |
| 4 | Ekran statusu → „Zobacz post” przy obu platformach → post widoczny na Stronie i w profilu IG. | The post is live on the Facebook Page and the Instagram profile. |
| 5 | Ekrany „Rozwój” (obserwujący) i „Analityka” (statystyki postów). | pages_read_engagement / instagram_basic: the user sees follower counts and post statistics. |

---

## 3. YouTube (Google)

Są **dwa osobne procesy**:
- **A. Weryfikacja OAuth.** Bez niej przy łączeniu pojawia się ekran „Google hasn't verified this app” i obowiązuje limit 100 użytkowników.
- **B. Audyt YouTube API.** Bez niego **każdy film z Postfly jest wymuszenie prywatny**.

Najpierw A, potem B.

### 3.A Konfiguracja w Google Cloud Console (raz, przed nagraniem)
Projekt z `GOOGLE_CLIENT_ID` → **Google Auth Platform**:
1. [Google Search Console](https://search.google.com/search-console): zweryfikuj domenę **postfly.pl** kontem, które jest Owner/Editor projektu.
2. **Branding**:
   - nazwa aplikacji „Postfly” i logo;
   - home page `https://postfly.pl`, privacy `https://postfly.pl/privacy`, terms `https://postfly.pl/terms`;
   - authorized domain `postfly.pl`.
3. **Data Access**: tylko `openid`, `email`, `profile`, `.../auth/youtube.upload`, `.../auth/youtube.readonly`.
4. **Audience**: *Publishing status = In production*.
5. **Verification Center** → *Submit for verification*. Uzasadnienia scope'ów do wklejenia:
   - `youtube.upload`: *Postfly lets creators publish their own videos to their own YouTube channel. The user writes the title and description, chooses the visibility (public/unlisted/private) and explicitly clicks Publish; the app then uploads that single video with videos.insert. A narrower scope does not exist for uploading.*
   - `youtube.readonly`: *Used only to show the user statistics of their own channel (subscriber count, channels.list part=statistics) and of the videos they published through Postfly (videos.list part=statistics) on the Growth and post statistics screens. Data is refreshed or deleted within 30 days. youtube.upload does not allow reading these statistics.*

### 3.B Nagranie do weryfikacji OAuth (wgraj na YouTube jako **Niepubliczny / Unlisted**)

| # | Co robisz | Napis (EN) |
|---|---|---|
| 1 | Strona główna `postfly.pl`, przewiń do linków Privacy/Terms, otwórz politykę prywatności na sekcji 14 (YouTube/Google). | Postfly home page and privacy policy, including the YouTube / Google API Services data section. |
| 2 | Zaloguj się do Postfly → Połączone konta → YouTube → „Połącz”. | The user starts connecting their YouTube channel. |
| 3 | **Ekran zgody Google: zatrzymaj się. Pokaż pasek adresu z `client_id=...` (kliknij w niego, żeby był widoczny cały URL) i nazwę „Postfly”.** Zaakceptuj uprawnienia. | Google consent screen: app name "Postfly" and OAuth client ID in the address bar. The user grants youtube.upload and youtube.readonly. |
| 4 | Powrót do Postfly, kanał widoczny jako połączony. | The channel is connected. |
| 5 | „Nowy post” → wgraj **własny** film → zakładka YouTube: wpisz **Tytuł**, edytuj opis i hashtagi. | youtube.upload: the user writes the title and description. |
| 6 | „Dalej” → blok „Publikacja na YouTube”: pokaż podgląd tytułu i opisu, rozwiń **Widoczność**, gdzie nic nie jest wybrane, wybierz ją ręcznie. Pokaż link „YouTube Terms of Service”. | The exact title and description that will be sent are shown. The user must choose the visibility (no default) and agrees to the YouTube Terms of Service. |
| 7 | „Opublikuj teraz” → ekran statusu → „Opublikowano” → „Zobacz post” → film na YouTube. | The video is uploaded only after the user clicks Publish, with the chosen settings. |
| 8 | Menu „Rozwój”: liczba subskrybentów kanału. Menu „Analityka”: statystyki opublikowanego filmu. | youtube.readonly: subscriber count and statistics of the user's own videos. |
| 9 | Połączone konta → przy YouTube „Rozłącz”. | Disconnecting revokes the Google token immediately and deletes the channel's data from Postfly. |

Uwaga: przed audytem z punktu 3.C YouTube i tak ustawi film jako prywatny, bez względu na wybór. Na nagraniu wybierz „Prywatny (Private)”, żeby nie było rozbieżności.

### 3.C Audyt YouTube API (po weryfikacji OAuth)
Formularz: [YouTube API Services: Audit and Quota Extension Form](https://support.google.com/youtube/contact/yt_api_form). Przygotuj:
- link do tego samego nagrania (3.B) i zrzuty ekranów: blok „Publikacja na YouTube” (widoczność, podgląd), ekran „Rozwój” i „Analityka”, polityka prywatności (sekcja 14) i regulamin (zapis o YouTube Terms of Service);
- opis: *Postfly uploads a creator's own videos to their own channel only after explicit user action, with user-chosen title, description and visibility; shows the user statistics of their own channel and videos; stores API data max 30 days; revokes tokens and deletes data on disconnect.*;
- limit: domyślnie projekt ma **100 wywołań `videos.insert` dziennie** (osobna pula) i 10 000 jednostek na pozostałe metody, a statystyki kosztują 1 jednostkę na wywołanie ([źródło](https://developers.google.com/youtube/v3/determine_quota_cost)). Na start to wystarczy. Większy limit zamów w tym samym formularzu, podając realistyczną dzienną liczbę uploadów wszystkich użytkowników.

### 3.D Logowanie przez Google („Zaloguj przez Google”)
Używa tylko `openid`, `email`, `profile`. Jeśli to ten sam projekt co YouTube, obejmuje go weryfikacja z 3.A. Jeśli osobny, potrzebna jest tylko weryfikacja marki (Branding + domena), bez nagrania.

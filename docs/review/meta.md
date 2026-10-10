# Meta (Facebook + Instagram): nagranie i zgłoszenie review

Facebook i Instagram łączą się przez **Facebook Login** (Instagram to konto firmowe lub twórcy podpięte do Strony).
Zasady nagrań Meta: [Screen Recordings](https://developers.facebook.com/docs/app-review/submission-guide/screen-recordings/).
W skrócie:
- angielski interfejs albo angielskie napisy (okno logowania Facebooka najlepiej po angielsku: na czas nagrania ustaw język konta FB na English);
- pasek adresu przeglądarki widoczny w każdej scenie;
- bez dźwięku, 1080p;
- pokazać logowanie, udzielanie uprawnień i użycie **każdego** zgłoszonego uprawnienia.

## 0. Najpierw etap 1 z [README](README.md)

Środki w Anthropic, domena w Resend, konto recenzenta (`REVIEWER_EMAILS`) i test generalny. Uprawnienia do komentarzy **nie** są już dodawane automatycznie (od 10.10.2026) — przed nagraniem B patrz sekcja 3.

## 1. Stan i ustawienia panelu

**Stan na 10.10.2026 (sprawdzony w panelu):** publikacja **nie jest zatwierdzona** — wszystkie uprawnienia mają „Ready for testing” (Standard access), więc działają tylko dla kont z rolą w aplikacji. Wcześniejszy zapis o „Advanced access” był błędny. Potrzebne jest **nagranie A** i zgłoszenie review.

Zgłoszenie publikacji (Review → Recenzja aplikacji → „New requests”) obejmuje 7 uprawnień:

| Platforma | Uprawnienia |
|---|---|
| Facebook | `pages_show_list`, `pages_manage_posts`, `pages_read_engagement`, `public_profile` |
| Instagram | `instagram_basic`, `instagram_content_publish`, `business_management` |

Uprawnienia do komentarzy (`pages_manage_engagement`, `instagram_manage_comments`) są **usunięte z tego zgłoszenia** (ikona kosza) — osobne review z nagraniem B, później.

W [Meta for Developers](https://developers.facebook.com/apps) → aplikacja Postfly sprawdź:
- [x] **App Mode: Live** (Opublikuj: „Published”) — potwierdzone 10.10;
- [x] **Business verification**: Verified (Code94 Paweł Sawczuk) — potwierdzone 10.10. **Access verification** (Tech Provider): In review od 10.10, toczy się niezależnie;
- [ ] **Settings → Basic**:
  - Privacy Policy URL `https://postfly.pl/privacy`;
  - Terms of Service URL `https://postfly.pl/terms`;
  - **User data deletion**: „Data deletion instructions URL” = `https://postfly.pl/data-deletion`;
  - ikona 1024×1024, kategoria i e-mail kontaktowy;
- [ ] **Uprawnienie `email` nie jest zgłoszone ani używane** (Postfly już o nie nie prosi od 3.10.2026). Jeśli w Vercelu jest zmienna `FACEBOOK_OAUTH_SCOPES`, upewnij się, że nie zawiera `email`.
- [ ] **Facebook Login → Settings → Valid OAuth Redirect URIs**: `https://postfly.pl/api/auth/callback/facebook` i `https://postfly.pl/api/auth/callback/instagram`.

---

## 2. Nagranie A: publikacja

Jedno nagranie wgrywasz przy wszystkich 7 uprawnieniach, które pokazuje.

**Przed nagraniem:**
- [ ] Anthropic: saldo i miesięczny limit wystarczą; szybki test w Postfly — opis od AI dotyczy Twojego zdjęcia.
- [ ] Konto recenzenta w Postfly: **rozłącz** Facebooka i Instagrama w „Połączonych kontach”, żeby nagrać łączenie od zera.
- [ ] Facebook → [Integracje biznesowe](https://www.facebook.com/settings?tab=business_tools): **usuń postfly** (bez usuwania postów) — inaczej Facebook pominie listę uprawnień w scenie 3.
- [ ] Język konta Facebook: **English** na czas nagrania.
- [ ] Materiał: **zdjęcie** (najprościej — jednakowo na obu platformach). Film też zadziała: na Instagramie idzie zawsze jako Reels (kreator pokazuje „Format publikacji: Reels”).

| # | Co robisz na ekranie | Napis (EN) |
|---|---|---|
| 1 | Zaczynasz wylogowany: `https://postfly.pl` → **„Zaloguj się”** → e-mail i hasło konta recenzenta z [README](README.md). | The user logs in to Postfly. |
| 2 | Menu **„Połączone konta”** → karta Facebook → **„Kontynuuj z Facebookiem”**. | The user connects their Facebook Page with Facebook Login. |
| 3 | Okno Facebooka: **„Edytuj ustawienia”** → **zaznacz Stronę** → pokaż listę uprawnień → zaakceptuj. Powrót: Strona widoczna jako połączona. | pages_show_list: the user chooses which Page Postfly may access and grants the permissions. |
| 4 | Karta Instagram → **„Kontynuuj z Facebookiem”** → zaznacz Stronę **i konto Instagram** → zaakceptuj. | business_management, instagram_basic: the user connects the Instagram professional account linked to the Page. |
| 5 | **„Nowy post”** → **„Wgraj materiał”** (zdjęcie lub film) → w polu **„O czym jest ten post?”** wpisz jedno zdanie → **„Dalej”**. | The user uploads their own photo or video and adds a short note. |
| 6 | Zakładki **Facebook** i **Instagram**: pokaż opis zaproponowany przez AI, potem go edytuj i dodaj hashtag. | The caption is an AI suggestion; the user edits the caption and hashtags for each platform. |
| 7 | **„Dalej”** → pokaż przyciski platform z **nazwą Strony i konta IG** → **„Opublikuj teraz”**. | The user sees exactly which Page and Instagram account the post goes to, and explicitly publishes (pages_manage_posts, instagram_content_publish). |
| 8 | Ekran statusu → **„Zobacz post”** przy Facebooku i Instagramie → post widoczny na Stronie i w profilu IG. | The post is live on the Facebook Page and the Instagram profile. |
| 9 | Menu **„Rozwój”** (obserwujący, **„Odśwież teraz”**) i **„Analityka”** → **„Wyniki opublikowanych postów”** → **„Odśwież statystyki”** (polubienia i komentarze postów). | pages_read_engagement, instagram_basic: the user sees follower counts and statistics of their own posts. |

## 3. Nagranie B: odpowiedzi na komentarze (`pages_manage_engagement`, `pages_read_user_content`, `instagram_manage_comments`)

**Nagrywaj na koncie testowym z [README](README.md)** (adres z `REVIEWER_EMAILS`) albo na koncie administratora. Zwykli użytkownicy nie są o te uprawnienia proszeni, dopóki nie zostaną zatwierdzone.

**Przed nagraniem B (od 10.10.2026):** uprawnienia do komentarzy nie są już dodawane automatycznie, bo Facebook blokował okno logowania („Invalid Scopes: pages_read_user_content”), a nagranie A ma pokazywać tylko uprawnienia do publikacji. Dlatego:
1. W panelu Mety: Przykłady użycia → „Zarządzaj wszystkim na swojej stronie” → **Dostosuj** → „Add more to this use case” → dodaj **`pages_read_user_content`**.
2. Vercel → `META_COMMENT_SCOPES_FOR_REVIEW` = `1` (Production) → Redeploy. Wtedy konto recenzenta i administratora dostaną uprawnienia do komentarzy przy łączeniu Facebooka i Instagrama.
3. Po nagraniu i wysłaniu review ustaw zmienną z powrotem na pustą wartość. Jeśli łączyłeś Stronę wcześniej, rozłącz ją i połącz ponownie, żeby token miał nowe uprawnienia.

Nagraj **osobny film dla Facebooka** (pokazuje oba uprawnienia: `pages_manage_engagement` i `pages_read_user_content`) **i dla Instagrama** (`instagram_manage_comments`). Komentarze są pobierane tylko spod postów opublikowanych przez Postfly w ostatnich 30 dniach, więc najpierw opublikuj post przez Postfly.

| # | Co robisz na ekranie | Napis (EN) |
|---|---|---|
| 1 | Logowanie do Postfly (jak w A1). | The user logs in to Postfly. |
| 2 | **„Połączone konta”** → Facebook (albo Instagram) → **„Kontynuuj z Facebookiem”** → wybierz Stronę lub konto → pokaż na liście uprawnień **pages_manage_engagement** i **pages_read_user_content** (lub **instagram_manage_comments**) → zaakceptuj. | The user grants permission to read and reply to comments on their own Page / Instagram account. |
| 3 | Z innego konta dodaj komentarz pod postem opublikowanym przez Postfly. | A follower comments on a post the user published with Postfly. |
| 4 | Postfly → menu **„Społeczność”** → **„🔄 Sprawdź komentarze teraz”**. Komentarz pojawia się na liście **z nazwą autora** (zatrzymaj się na niej). | pages_read_user_content: Postfly reads new comments and their authors' names on the user's own posts. |
| 5 | Pokaż sugestię odpowiedzi AI, **wyraźnie ją popraw** (dopisz słowo) → **„Wyślij”**. | pages_manage_engagement: the AI only suggests a reply; the user edits it and sends it. Nothing is sent without this click. |
| 6 | Otwórz post na Facebooku lub Instagramie i pokaż odpowiedź pod komentarzem. | The reply appears under the comment on Facebook / Instagram. |

---

## 4. Zgłoszenie review: krok po kroku

1. **Wymagane testowe wywołanie API.** Meta nie przepuści zgłoszenia, dopóki w ciągu ostatnich 30 dni nie było **co najmniej jednego udanego wywołania API** z każdym zgłaszanym uprawnieniem. Dla publikacji wystarczy opublikować z Postfly post na Facebooku i Instagramie oraz kliknąć „Analityka” → „Odśwież statystyki” i „Rozwój” → „Odśwież teraz” (nagranie A robi to samo). Sprawdzisz to w Przykłady użycia → **Dostosuj** → kolumna **API Calls** (aktualizuje się do 24 h).
2. **Review → Recenzja aplikacji**: lista „New requests” (7 uprawnień z sekcji 1) → **Next**.
3. Jeśli pojawi się prośba: dokończ **Business verification** i odpowiedz na **pytania o przetwarzanie danych** (data handling).
4. **Complete App Settings**: potwierdź dane z punktu 1 (ikona, polityka prywatności, URL usuwania danych, kategoria).
5. **Complete App Verification**: wklej instrukcję dla recenzenta (punkt 5).
6. **Requested Permissions and Features**: przy każdym uprawnieniu wklej opis (punkt 6), wgraj nagranie i zaznacz zgodę na zasady użycia.
7. **Submit for Review** → zaakceptuj Platform Onboarding Terms. Decyzja przychodzi zwykle w ciągu tygodnia (do 2–4 tygodni).
8. Tylko po zatwierdzeniu **komentarzy** (osobne review z nagraniem B): ustaw w Vercelu `COMMENTS_FEATURE_ENABLED` = `1` i zrób Redeploy. Uprawnienia do komentarzy będą wtedy wymagane od wszystkich łączących konta. Użytkownicy, którzy połączyli konta wcześniej, muszą je połączyć ponownie.

## 5. Instrukcja dla recenzenta (pole „App Verification”)

**Zgłoszenie publikacji (teraz)** — wklej punkty 1–3 i ostatnie zdanie; punkt 4 dodaj dopiero przy zgłoszeniu komentarzy:

> 1. Go to https://postfly.pl and click "Zaloguj się" (Log in). Email: <E-MAIL KONTA TESTOWEGO Z REVIEWER_EMAILS>, password: <HASŁO>.
> 2. Open "Połączone konta" (Connected accounts) in the left menu and click "Kontynuuj z Facebookiem" (Continue with
>    Facebook) on the Facebook or Instagram card. Select the Page (and the Instagram account) and grant the permissions.
> 3. Publishing: click "Nowy post" (New post) → "Wgraj materiał" (Upload) → "Dalej" (Next) → edit the caption →
>    "Dalej" → "Opublikuj teraz" (Publish now).
> 4. Comments: first publish a post to the Page via Postfly (step 3), then comment on it from another Facebook account.
>    In Postfly open "Społeczność" (Community) → "Sprawdź komentarze teraz" (Check comments now) → edit the suggested
>    reply → "Wyślij" (Send). Only comments under posts published through Postfly in the last 30 days are shown.
> The UI is in Polish; English names are given in brackets. The screen recordings have English captions.

## 6. Opisy uprawnień (pole „How will your app use this permission?”)

- **public_profile**: *Identifies the Facebook user who connects their Page so the connection is linked to their Postfly account. Only the name and ID are used.*
- **pages_show_list**: *Lets the user choose which of their Facebook Pages to connect to Postfly. We show the Page name so the user sees where content will be published.*
- **pages_read_engagement**: *Reads the follower count of the connected Page and engagement statistics (likes, comments, shares) of posts the user published through Postfly, shown to that user on the Growth and Analytics screens.*
- **pages_manage_posts**: *Publishes a post (photo, video or text) to the user's own Page only after the user writes the caption and clicks "Publish now" in Postfly.*
- **business_management**: *Required to access the Page and the Instagram professional account the user manages through Meta Business, so they can connect them to Postfly.*
- **instagram_basic**: *Reads the connected Instagram account's username, follower count and basic media statistics to identify the account and show the user their results.*
- **instagram_content_publish**: *Publishes a photo or Reel to the user's own Instagram professional account only after the user writes the caption and clicks "Publish now" in Postfly.*

Poniższe trzy — dopiero przy zgłoszeniu komentarzy (nagranie B):
- **pages_manage_engagement**: *Lets the user reply to comments under their own Page posts from Postfly's Community screen. Postfly may suggest a reply with AI; the user edits it, and a reply is sent only when the user clicks "Send".*
- **pages_read_user_content**: *Reads comments (text and the commenter's name) under posts the user published to their own Page through Postfly, so the user can see them on Postfly's Community screen and reply. The data is shown only to that user and deleted when the Page is disconnected.*
- **instagram_manage_comments**: *Reads new comments under the user's own Instagram posts and lets the user reply from Postfly's Community screen. Postfly may suggest a reply with AI; the user edits it, and a reply is sent only when the user clicks "Send".*

Jeśli w opisie publikacji (`pages_manage_posts`, `instagram_content_publish`) pojawi się pytanie o treść: *The caption may be pre-filled with an AI suggestion based on the user's own note and photo; the user always reviews and edits it before clicking "Publish now".*

## 7. Pytania o przetwarzanie danych (Data Handling Questions)

Meta pyta o to przy App Review i przy corocznym Data Use Checkup. Odpowiedzi zgodne z polityką prywatności (punkt 5, 6 i 14):

| Pytanie | Odpowiedź |
|---|---|
| Czy udostępniasz dane z platformy podmiotom przetwarzającym (data processors / service providers)? | **Tak.** Vercel (hosting i pliki), Supabase (baza danych), Anthropic (AI: propozycje opisów i odpowiedzi na komentarze, podsumowania wyników), Sentry (raporty błędów), Resend (e-maile do użytkownika). |
| W jakim celu? | *Only to provide Postfly's features to the same user: hosting and storage, and AI suggestions (captions, comment replies, performance tips) that the user reviews and approves. Platform data is never sold, used for advertising or used to train AI models.* |
| Czy podmioty przetwarzające mają umowę ograniczającą użycie danych? | **Tak**: warunki przetwarzania danych (DPA) Vercela, Supabase i Anthropic. Anthropic nie trenuje modeli na danych przesyłanych przez API. |
| Czy przekazujesz dane organom publicznym? | **Nie** (poza obowiązkiem prawnym; nie otrzymaliśmy takich żądań). |
| Kto odpowiada za dane? | Administrator z polityki prywatności (punkt 1), kontakt z punktu 15. |

Jeśli formularz pyta o kraj przetwarzania: aplikacja działa w UE (Vercel, region Paryż), region bazy sprawdzisz w Supabase → Project Settings → General → Region, a zapytania do Anthropic trafiają do USA (polityka prywatności, punkt o przekazywaniu danych poza EOG).

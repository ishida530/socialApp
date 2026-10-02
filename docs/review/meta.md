# Meta (Facebook + Instagram): nagranie i zgłoszenie review

Facebook i Instagram łączą się przez **Facebook Login** (Instagram to konto firmowe lub twórcy podpięte do Strony).
Zasady nagrań Meta: [Screen Recordings](https://developers.facebook.com/docs/app-review/submission-guide/screen-recordings/).
W skrócie:
- angielski interfejs albo angielskie napisy;
- bez dźwięku, 1080p;
- pokazać logowanie, udzielanie uprawnień i użycie **każdego** zgłoszonego uprawnienia.

## 1. Najpierw sprawdź, może nic nie trzeba nagrywać

Produkcja prosi wyłącznie o uprawnienia, które według dokumentacji projektu (13.09.2026) masz już zatwierdzone:

| Platforma | Uprawnienia |
|---|---|
| Facebook | `pages_show_list`, `pages_manage_posts`, `pages_read_engagement` |
| Instagram | `instagram_basic`, `instagram_content_publish`, `pages_show_list`, `pages_read_engagement`, `business_management` |

W [Meta for Developers](https://developers.facebook.com/apps) → aplikacja Postfly sprawdź:
- [ ] **App Mode: Live** (przełącznik u góry panelu);
- [ ] **App Review → Permissions and Features**: przy każdym uprawnieniu z tabeli status **Advanced access**;
- [ ] **Business verification**: zakończona (Settings → Basic albo komunikat w App Review);
- [ ] **Settings → Basic**:
  - Privacy Policy URL `https://postfly.pl/privacy`;
  - Terms of Service URL `https://postfly.pl/terms`;
  - **User data deletion**: „Data deletion instructions URL” = `https://postfly.pl/data-deletion`;
  - ikona 1024×1024, kategoria i e-mail kontaktowy;
- [ ] **Facebook Login → Settings → Valid OAuth Redirect URIs**: `https://postfly.pl/api/auth/callback/facebook` i `https://postfly.pl/api/auth/callback/instagram`.

**Jeśli wszystko jest zielone, publikacji nie zgłaszasz.** Nagrywasz tylko to, czego brakuje:
- któreś uprawnienie ma tylko „Standard access” → nagranie A;
- chcesz odpowiadać na komentarze z Postfly → nagranie B.

---

## 2. Nagranie A: publikacja (tylko gdy brakuje Advanced access)

Jedno nagranie możesz wgrać przy kilku uprawnieniach, które pokazuje.

| # | Co robisz na ekranie | Napis (EN) |
|---|---|---|
| 1 | Zaczynasz wylogowany: `https://postfly.pl` → **„Zaloguj się”** → e-mail i hasło konta testowego. | The user logs in to Postfly. |
| 2 | Menu **„Połączone konta”** → karta Facebook → **„Kontynuuj z Facebookiem”**. | The user connects their Facebook Page with Facebook Login. |
| 3 | Okno Facebooka: **„Edytuj ustawienia”** → **zaznacz Stronę** → pokaż listę uprawnień → zaakceptuj. Powrót: Strona widoczna jako połączona. | pages_show_list: the user chooses which Page Postfly may access and grants the permissions. |
| 4 | Karta Instagram → **„Kontynuuj z Facebookiem”** → zaznacz Stronę **i konto Instagram** → zaakceptuj. | business_management, instagram_basic: the user connects the Instagram professional account linked to the Page. |
| 5 | **„Nowy post”** → **„Wgraj materiał”** (zdjęcie lub film) → **„Dalej”**. | The user uploads their own photo or video. |
| 6 | Zakładki **Facebook** i **Instagram**: edytuj opis, dodaj hashtag. | The user writes the caption and hashtags for each platform. |
| 7 | **„Dalej”** → pokaż przyciski platform z **nazwą Strony i konta IG** → **„Opublikuj teraz”**. | The user sees exactly which Page and Instagram account the post goes to, and explicitly publishes (pages_manage_posts, instagram_content_publish). |
| 8 | Ekran statusu → **„Zobacz post”** przy Facebooku i Instagramie → post widoczny na Stronie i w profilu IG. | The post is live on the Facebook Page and the Instagram profile. |
| 9 | Menu **„Rozwój”** (obserwujący) i **„Analityka”** (statystyki postów). | pages_read_engagement, instagram_basic: the user sees follower counts and statistics of their own posts. |

## 3. Nagranie B: odpowiedzi na komentarze (`pages_manage_engagement`, `instagram_manage_comments`)

**Nagrywaj na koncie testowym z [README](README.md)** (adres z `REVIEWER_EMAILS`) albo na koncie administratora. Zwykli użytkownicy nie są o te uprawnienia proszeni, dopóki nie zostaną zatwierdzone. Konto recenzenta i konto administratora dostają je automatycznie przy łączeniu Facebooka i Instagrama. Jeśli łączyłeś Stronę wcześniej, rozłącz ją i połącz ponownie, żeby token miał nowe uprawnienia.

Nagraj **osobny film dla każdego z dwóch uprawnień** (Facebook i Instagram):

| # | Co robisz na ekranie | Napis (EN) |
|---|---|---|
| 1 | Logowanie do Postfly (jak w A1). | The user logs in to Postfly. |
| 2 | **„Połączone konta”** → Facebook (albo Instagram) → **„Kontynuuj z Facebookiem”** → wybierz Stronę lub konto → pokaż na liście uprawnień **pages_manage_engagement** (lub **instagram_manage_comments**) → zaakceptuj. | The user grants permission to manage comments on their own Page / Instagram account. |
| 3 | Z innego konta dodaj komentarz pod postem opublikowanym przez Postfly. | A follower comments on a post the user published with Postfly. |
| 4 | Postfly → menu **„Społeczność”** → **„🔄 Sprawdź komentarze teraz”**. Komentarz pojawia się na liście. | Postfly reads new comments on the user's own posts. |
| 5 | Wpisz odpowiedź (albo popraw sugestię) → **„Wyślij”**. | The user replies to the comment from Postfly. Nothing is sent without this click. |
| 6 | Otwórz post na Facebooku lub Instagramie i pokaż odpowiedź pod komentarzem. | The reply appears under the comment on Facebook / Instagram. |

---

## 4. Zgłoszenie review: krok po kroku

1. **Wymagane testowe wywołanie API.** Przycisk „Request advanced access” jest nieaktywny, dopóki w ciągu ostatnich 30 dni nie było **co najmniej jednego udanego wywołania API** z danym uprawnieniem. Wystarczy wykonać w Postfly akcję z nagrania (np. wysłać odpowiedź na komentarz) albo zrobić wywołanie w [Graph API Explorer](https://developers.facebook.com/tools/explorer/).
2. **App Review → Permissions and Features**: wyszukaj każde uprawnienie → **Request advanced access**.
3. Jeśli pojawi się prośba: dokończ **Business verification** i odpowiedz na **pytania o przetwarzanie danych** (data handling).
4. **Complete App Settings**: potwierdź dane z punktu 1 (ikona, polityka prywatności, URL usuwania danych, kategoria).
5. **Complete App Verification**: wklej instrukcję dla recenzenta (punkt 5).
6. **Requested Permissions and Features**: przy każdym uprawnieniu wklej opis (punkt 6), wgraj nagranie i zaznacz zgodę na zasady użycia.
7. **Submit for Review** → zaakceptuj Platform Onboarding Terms. Decyzja przychodzi zwykle w ciągu tygodnia (do 2–4 tygodni).
8. Po zatwierdzeniu ustaw w Vercelu `COMMENTS_FEATURE_ENABLED` = `1` i zrób Redeploy. Uprawnienia do komentarzy będą wtedy wymagane od wszystkich łączących konta. Użytkownicy, którzy połączyli konta wcześniej, muszą je połączyć ponownie.

## 5. Instrukcja dla recenzenta (pole „App Verification”)

> 1. Go to https://postfly.pl and click "Zaloguj się" (Log in). Email: <E-MAIL KONTA TESTOWEGO Z REVIEWER_EMAILS>, password: <HASŁO>.
> 2. Open "Połączone konta" (Connected accounts) in the left menu and click "Kontynuuj z Facebookiem" (Continue with
>    Facebook) on the Facebook or Instagram card. Select the Page (and the Instagram account) and grant the permissions.
> 3. Publishing: click "Nowy post" (New post) → "Wgraj materiał" (Upload) → "Dalej" (Next) → edit the caption →
>    "Dalej" → "Opublikuj teraz" (Publish now).
> 4. Comments: open "Społeczność" (Community) → "Sprawdź komentarze teraz" (Check comments now) → type a reply →
>    "Wyślij" (Send).
> The UI is in Polish; English names are given in brackets. The screen recordings have English captions.

## 6. Opisy uprawnień (pole „How will your app use this permission?”)

- **pages_show_list**: *Lets the user choose which of their Facebook Pages to connect to Postfly. We show the Page name so the user sees where content will be published.*
- **pages_read_engagement**: *Reads the follower count of the connected Page and engagement statistics (likes, comments, shares) of posts the user published through Postfly, shown to that user on the Growth and Analytics screens.*
- **pages_manage_posts**: *Publishes a post (photo, video or text) to the user's own Page only after the user writes the caption and clicks "Publish now" in Postfly.*
- **business_management**: *Required to access the Page and the Instagram professional account the user manages through Meta Business, so they can connect them to Postfly.*
- **instagram_basic**: *Reads the connected Instagram account's username, follower count and basic media statistics to identify the account and show the user their results.*
- **instagram_content_publish**: *Publishes a photo or Reel to the user's own Instagram professional account only after the user writes the caption and clicks "Publish now" in Postfly.*
- **pages_manage_engagement**: *Lets the user reply to comments under their own Page posts from Postfly's Community screen. A reply is sent only when the user clicks "Send".*
- **instagram_manage_comments**: *Reads new comments under the user's own Instagram posts and lets the user reply from Postfly's Community screen. A reply is sent only when the user clicks "Send".*

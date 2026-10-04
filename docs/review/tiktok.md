# TikTok: nagranie i zgłoszenie review (Content Posting API, Direct Post)

Poprzedni wniosek (ref. `20260913074631`) został odrzucony z powodu niezgodności z
[Content Sharing Guidelines](https://developers.tiktok.com/doc/content-sharing-guidelines) (aktualizacja z 4.08.2026).
Interfejs jest już poprawiony. Ten plik opisuje, co nagrać i jak wysłać wniosek ponownie.

## 0. Najpierw etap 1 z [README](README.md)

Środki w Anthropic, domena w Resend, konto recenzenta (`REVIEWER_EMAILS`) i test generalny. Bez tego nagranie pokaże TikToka jako „Wkrótce” albo komunikat o niedostępnym AI.

## 1. Przed nagraniem: portal TikTok

[developers.tiktok.com](https://developers.tiktok.com) → **Manage apps** → aplikacja Postfly:

Stan sprawdzony w portalu **4.10.2026** (`[x]` = zrobione, `[ ]` = do zrobienia):

- [ ] **App details**:
  - [ ] nazwa: jest `PostFly`, zmień na **`Postfly`** (tak jak na stronie i w regulaminie; bez słów TikTok czy innych serwisów);
  - [ ] ikona Postfly 1024×1024 (sprawdź, czy jest wgrana);
  - [x] kategoria: Social Networking;
  - [ ] **opis (max 120 znaków)**: obecny („comprehensive dashboard for music creators…”) nie zgadza się z aplikacją. Wklej:
    `Postfly lets creators and small businesses plan and publish their own photos and videos to TikTok and other socials.`
  - [x] **Website URL** `https://postfly.pl`;
  - [x] **Terms of Service** `https://postfly.pl/terms`;
  - [x] **Privacy Policy** `https://postfly.pl/privacy`.
- [x] **Login Kit → Redirect URI**: `https://postfly.pl/api/auth/callback/tiktok`.
- [x] **Content Posting API**: włączony, **Direct Post** włączony (przycisk „Reapply” = wniosek o audyt składasz ponownie, punkt 3).
- [x] **Verify domains** (Content Posting API → **Verify**): `postfly.pl` jest w **Verified properties** jako Domain (sprawdzone 4.10.2026). Z tej domeny TikTok pobiera filmy (`PULL_FROM_URL`). Nie klikaj czerwonego „—” przy niej: to usuwa weryfikację.
- [x] **Scopes** (zrobione 4.10.2026): w rewizji (**Create Revision**) usunięty przyciskiem **„—”** tylko **`user.info.profile`** (Postfly go nie używa, a TikTok odrzuca wnioski z nieużywanymi scope'ami). Zostają:
  - [x] `user.info.basic`
  - [x] `video.publish`
  - [x] `user.info.stats` (**nie usuwaj**: ekran „Rozwój”)
  - [ ] **`video.list`: usuń go też przyciskiem „—”** (zmiana 4.10.2026). TikTok udostępnia przez niego tylko **publiczne** filmy, a przed audytem możesz publikować wyłącznie „Tylko ja” na prywatnym koncie, więc tego scope'u nie da się pokazać na filmie. Postfly już o niego nie prosi. Wrócimy do niego po audycie (statystyki postów TikToka).
  - `video.upload` **zostaje**: nie ma przycisku „—”, TikTok dołącza go na stałe do Content Posting API. Postfly go nie używa (publikuje tylko przez Direct Post), co wyjaśnia ostatni akapit tekstu z punktu 4.
- [ ] **App review → opis produktów i scope'ów**: obecny tekst („performance dashboard… user.info.profile…”) jest nieaktualny. Zastąp go tekstem z punktu 4.
- [ ] **Demo video**: obecne (`2026-03-04_21h12_51.mp4`) jest stare. Usuń je i wgraj nowe nagranie według punktu 2.
- [ ] Konto TikTok do nagrania jest **prywatne**. Przed audytem TikTok pozwala publikować tylko jako „Tylko ja”, a publikować może maksymalnie 5 użytkowników na dobę.

## 2. Scenariusz filmu (jedno ciągłe nagranie)

Przez całe nagranie **pasek adresu przeglądarki ma być widoczny** (TikTok sprawdza domenę). Okno logowania TikToka nagrywaj **po angielsku**: przed nagraniem ustaw w nim język English (selektor języka na stronie logowania TikToka albo język przeglądarki).

| # | Co robisz na ekranie | Napis (EN) |
|---|---|---|
| 1 | Otwórz `https://postfly.pl`, przewiń do sekcji **„Integracje”** (karta TikTok), potem do stopki z linkami „Regulamin” i „Polityka Prywatności”. | Postfly is a web app for independent creators and small businesses to publish their own content to their own social accounts. The TikTok integration is described on the home page. Terms and Privacy Policy are linked on every page. |
| 2 | Pokaż stronę `/register` (bez wysyłania formularza), potem **„Zaloguj się”** na konto testowe z [README](README.md) (adres z `REVIEWER_EMAILS`, potwierdzony e-mail). Nie zakładaj nowego konta na nagraniu: zobaczyłoby TikToka jako „Wkrótce”. | Any creator can sign up for their own account. For this demo we log in to a prepared account. |
| 3 | Menu **„Połączone konta”** → karta TikTok → **„Kontynuuj z TikTok”**. | The creator connects their own TikTok account with TikTok Login Kit. |
| 4 | Okno TikToka (po angielsku): zaloguj się, pokaż listę uprawnień, zaakceptuj. Po powrocie konto jest widoczne jako połączone. | Requested scopes: user.info.basic (account name), video.publish (Direct Post), user.info.stats (follower count on the Growth screen). |
| 5 | Przycisk **„Nowy post”** → **„Wgraj materiał”** → wybierz swój film z dysku → w polu **„O czym jest ten post?”** wpisz jedno zdanie (np. „efekt remontu elewacji po 2 dniach”) → **„Dalej”**. | The creator uploads their own original video and adds a short note about it. |
| 6 | Krok przeglądu, zakładka **TikTok**: pokaż opis zaproponowany przez AI, potem ręcznie zmień pole **„Tytuł (Title)”**, dodaj albo usuń hashtag. Hashtagi mają być wyraźnie widoczne, a zmiana czytelna (zatrzymaj się na sekundę). | The caption is an AI suggestion based on the creator's own note and photo. The title and hashtags are fully editable before posting. |
| 7 | **„Dalej”** → ekran publikacji. Pokaż podgląd filmu i treści (prawa kolumna). | Final "Post to TikTok" page: a preview of exactly what will be posted. |
| 8 | Najedź na **„Publikujesz na koncie TikTok (posting to): …”**. Pokaż też nazwę konta na przycisku TikTok. | The creator's TikTok nickname is shown, fetched live from creator_info. |
| 9 | Rozwiń listę **„Kto może zobaczyć ten post (Who can view this post)”**. Nic nie jest wybrane. | Privacy options come from creator_info. There is no default value, and the user must choose manually. |
| 10 | Pokaż odznaczone **Allow Comment / Duet / Stitch**, potem zaznacz ręcznie „Allow Comment”. | Comment, Duet and Stitch are all off by default and turned on manually. Options disabled in the creator's TikTok settings are greyed out. |
| 11 | Włącz **„Ujawnij treść komercyjną (Disclose commercial content)”** i **nic nie zaznaczaj**. Pokaż komunikat i najedź myszą na nieaktywny przycisk **„Opublikuj teraz”**. | Commercial content disclosure is off by default. When it is on with nothing selected, publishing is disabled with: "You need to indicate if your content promotes yourself, a third party, or both." |
| 12 | Zaznacz **„Twoja marka (Your brand)”**. | "Your brand" → "Your video will be labeled as 'Promotional content'". |
| 13 | Zaznacz też **„Treść sponsorowana (Branded content)”**. Pokaż zmieniony komunikat, deklarację z „Branded Content Policy” i wyszarzoną opcję **„Tylko ja (Only me)”**. | "Branded content" → "Paid partnership" label. The declaration adds TikTok's Branded Content Policy, and "Only me" is disabled: "Branded content visibility cannot be set to private." |
| 14 | Odznacz „Branded content” i wybierz **„Tylko ja (Only me)”**. Teraz „Branded content” jest wyszarzone. | In the reverse order, Branded content is disabled while visibility is "Only me". |
| 15 | Wyłącz ujawnianie treści komercyjnej (albo zostaw „Your brand”). Pokaż deklarację tuż nad przyciskiem i **zaznacz ją**. Zmiana dowolnego ustawienia odznacza zgodę, więc zaznacz ją na końcu. | Right above the Publish button the creator must accept: "By posting, you agree to TikTok's Music Usage Confirmation." |
| 16 | Pokaż informację pod przyciskiem, potem kliknij **„Opublikuj teraz”**. | Content is sent to TikTok only after this explicit action. Processing on TikTok may take a few minutes. |
| 17 | Ekran statusu: „TikTok przetwarza publikację…” zmienia się samo na „Opublikowano”. | The post status is polled from TikTok (publish/status/fetch) and shown to the creator. |
| 18 | Otwórz TikToka (aplikację albo tiktok.com) → profil → opublikowany film. | The video is on the creator's profile, unchanged, with no watermark or branding added by Postfly. |
| 19 | W Postfly: menu **„Rozwój”** → sekcja **„Wzrost obserwujących”**: karta TIKTOK z liczbą obserwujących. Jeśli karty nie ma, kliknij **„Odśwież teraz”** i zatrzymaj się na liczbie. | user.info.stats: the creator sees the follower count of their own TikTok account on the Growth screen. |

Limity: maksymalnie 5 plików po 50 MB. Jeśli film wyjdzie większy, wyeksportuj go w 720p albo podziel na 2–3 części (np. sceny 1–8, 9–16 i 17–19).

## 3. Zgłoszenie review: krok po kroku

1. [developers.tiktok.com](https://developers.tiktok.com) → **Manage apps** → Postfly.
2. Sprawdź, czy wszystko z punktu 1 jest zrobione, i kliknij **Save**.
3. Przejdź do sekcji **App review**.
4. W polu z opisem działania produktów i scope'ów wklej tekst z punktu 4.
5. Wgraj demo video (lub kilka części), maksymalnie 5 plików po 50 MB.
6. Jeśli formularz pyta o szacunki, podaj realistyczną dzienną liczbę twórców i postów. Na tej podstawie TikTok ustala dzienny limit twórców.
7. **Save** → **Submit for review**.
8. Decyzja zwykle przychodzi w 1–2 tygodnie (TikTok podaje 2–4). Jeśli wniosek zostanie odrzucony, przekaż mi treść odpowiedzi, a poprawię to, co wskażą.

## 4. Tekst do formularza (pole „App review”, limit 1000 znaków)

Wklej poniższy tekst w całości, wpisując dane konta recenzenta w miejsce `<E-MAIL>` i `<HASŁO>`. Z e-mailem `pawel.sawczuk.email+review@gmail.com` i hasłem do 16 znaków wychodzi ok. 990 znaków, więc nie dopisuj nic więcej. Linijka „Changes in this revision” jest wymagana: formularz prosi o opis zmian przy rewizji.

> Postfly (https://postfly.pl) lets creators and small businesses publish their own videos and photos to their own TikTok profile.
> Login Kit, user.info.basic: shows the connected account name.
> Content Posting API, video.publish: Direct Post after explicit confirmation. video.upload is bundled with the product; we do not use draft upload.
> user.info.stats: follower count on the Growth screen.
> Before posting, the creator sees their nickname (creator_info), picks the privacy level (no default), opts in to comments/duet/stitch (off by default), can disclose commercial content, edits the caption (AI text is only a draft) and accepts the Music Usage Confirmation. Nothing is posted automatically; no watermarks.
> Changes in this revision: removed user.info.profile and video.list; posting UI updated to the Content Sharing Guidelines.
> Polish UI, English captions in the video. Test account: https://postfly.pl, <E-MAIL>, <HASŁO>

## 5. Gdzie to jest w kodzie (na wypadek pytań TikToka)

| Wymóg | Miejsce |
|---|---|
| 1a nazwa konta, 1b „can't post”, 1c długość filmu | `components/composer/ScheduleStep.tsx`, `TikTokSettingsPanel.tsx`, `useTikTokCreatorInfo.ts`, `app/api/social-accounts/tiktok/creator-info/route.ts`, `lib/server/tiktok-creator-info.ts` |
| 1b także w chwili wysyłki | `lib/server/publish-processor.ts` → `assertTikTokCreatorCanPost` |
| 2b/2c brak wartości domyślnych, zdjęcia bez Duet/Stitch | `TikTokSettingsPanel.tsx`, `app/api/publish-jobs/drafts/[id]/route.ts`, `publish-processor.ts` → `requireTikTokPrivacyLevel` |
| 3a/3b/4 ujawnienie treści komercyjnej i deklaracje | `TikTokSettingsPanel.tsx`, `ScheduleStep.tsx`, `lib/server/publish-jobs.ts` |
| 5c zgoda tylko ręcznie w panelu web | `lib/server/publish-jobs.ts` (`tiktokConsentAt`), `app/api/publish-jobs/drafts/[id]/route.ts` (każda edycja kasuje zgodę). Telegram, autopilot i plan kampanii nie publikują TikToka |
| 5d/5e przetwarzanie i status | `ScheduleStep.tsx`, `PostStatusScreen.tsx`, `POST /api/publish-jobs/status-refresh`, QStash w `publish-processor.ts` |

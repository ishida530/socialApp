# TikTok Content Posting API: ponowne zgłoszenie do audytu

Poprzedni wniosek (ref. `20260913074631`) został odrzucony z powodu niezgodności z
[Content Sharing Guidelines](https://developers.tiktok.com/doc/content-sharing-guidelines).
Kod jest już poprawiony: zobacz gałąź `fix/tiktok-audit-compliance-and-oauth` i tabelę
„Gdzie to jest w kodzie” niżej. Ten dokument zbiera **wszystko, czego nie da się zrobić kodem**.
Przejdź przez to w podanej kolejności, zanim wyślesz wniosek ponownie.

## 1. Konfiguracja produkcji (Vercel)

- [ ] `APP_MODE=commercial` i `NEXT_PUBLIC_APP_MODE=commercial`. W trybie `personal` rejestracja
      jest zamknięta po pierwszym koncie. Narusza to punkt „Intended Use” TikToka („must not be limited
      to internal/private use”), a recenzent nie założy konta testowego.
- [ ] Własna domena zamiast `*.vercel.app`, np. `postfly.pl`. `FRONTEND_URL`, wszystkie
      `*_REDIRECT_URI` i domena, pod którą użytkownik się loguje, muszą być **identyczne**.
      Inaczej ciasteczko PKCE TikToka i sesja giną po powrocie z logowania.
- [ ] Na stronie głównej, bez otwierania menu, widoczne są linki do `/privacy` i `/terms`.
      Strona musi wyglądać na gotowy produkt, a nie sam ekran logowania.
- [ ] (Zalecane) QStash (`QSTASH_TOKEN` i klucze podpisu). Sprawdzanie statusu TikToka działa wtedy
      co minutę także przy zamkniętym panelu. Bez QStash status odświeża się tylko, gdy ekran
      statusu jest otwarty, a w pozostałych przypadkach dopiero przez dobowy cron.
- [ ] Po wdrożeniu wykonaj pełną ścieżkę na produkcji: rejestracja nowego konta → podłączenie TikToka →
      publikacja. Na nagraniu nie może być żadnego błędu.

## 2. TikTok Developer Portal

- [ ] **Manage URL properties**: zweryfikuj domenę z `FRONTEND_URL`. Stąd TikTok pobiera wideo
      (`PULL_FROM_URL`, podpisane linki `/api/videos/.../source`). Bez weryfikacji publikacja się nie uda.
- [ ] Redirect URI: `https://<domena>/api/auth/callback/tiktok` (HTTPS, bez localhost).
- [ ] Nazwa i ikona aplikacji **nie mogą** nawiązywać do TikToka ani innych serwisów społecznościowych.
- [ ] Zakresy (scopes): zostaw tylko te, których aplikacja używa, i pokaż każdy na nagraniu:
  - `user.info.basic` / `user.info.profile`: nazwa i avatar konta po podłączeniu;
  - `video.publish`: publikacja (Direct Post);
  - `video.upload`: tylko jeśli jest używany. Postfly publikuje przez Direct Post z `PULL_FROM_URL`.
    Jeśli nie korzystasz z „Upload to inbox”, **usuń go** z aplikacji i z `TIKTOK_OAUTH_SCOPES`;
  - `user.info.stats` (ekran Wzrost, liczba obserwujących) i `video.list` (statystyki postów):
    zostaw tylko, jeśli pokażesz te ekrany na nagraniu. W przeciwnym razie usuń.

## 3. Meta i Google (żeby nowi użytkownicy mogli się podłączyć bez błędów)

- [ ] Meta for Developers: aplikacja w trybie **Live**, Advanced Access dla wszystkich uprawnień z
      `FACEBOOK_OAUTH_SCOPES` / `INSTAGRAM_OAUTH_SCOPES`. Zwróć uwagę na
      `pages_manage_engagement` i `instagram_manage_comments`, które doszły 14.09 i mogą nie być
      jeszcze zatwierdzone. Bez zatwierdzenia nowy użytkownik dostanie błąd na ekranie zgody Facebooka.
- [ ] Google Cloud Console (YouTube): ekran zgody OAuth w stanie **In production** i zweryfikowany
      (`youtube.upload` to scope wrażliwy). W trybie „Testing” łączyć się mogą tylko dodani testerzy,
      a tokeny wygasają po 7 dniach.
- [ ] Konta Facebook/Instagram podłączone **przed** tą zmianą trzeba raz połączyć ponownie
      („Połącz ponownie” w Konta social). Dopiero wtedy dostaną niewygasające tokeny stron.

## 4. Nagranie demo (najważniejsze)

Recenzent sprawdza nagranie punkt po punkcie. Nagraj **jeden ciągły film** na **domenie
produkcyjnej**, zgodnej z adresem strony podanym we wniosku. Maksymalnie 5 plików po 50 MB.
Interfejs Postfly jest po polsku, dlatego:
- dodaj **angielskie napisy lub lektora** opisujące każdy krok. Elementy wymagane przez TikToka
  mają w UI angielskie brzmienie z wytycznych („By posting, you agree to…”, „Your video will be
  labeled as…”, etiquety „(Everyone)”, „(Allow Comment)” itd.), ale napisy ułatwiają recenzentowi pracę;
- nie przewijaj zbyt szybko. Każdy element pokaż wyraźnie przez 2–3 sekundy.

Scenariusz:

1. Strona główna z linkami Privacy/Terms → **rejestracja nowego konta** (pokazuje, że aplikacja
   jest dla wielu niezależnych twórców).
2. Konta social → „Połącz” przy TikToku → logowanie w oknie TikToka, ekran zgody ze scope'ami →
   powrót, konto widoczne jako połączone.
3. Nowy post → wgranie **własnego** wideo z dysku (autentyczna, oryginalna treść).
4. Krok przeglądu, zakładka TikTok: edytowalny **Tytuł (Title)** i hashtagi (2a, 5b). Zmień coś
   ręcznie na nagraniu. Przy zdjęciu widać osobno „Tytuł (Title)” i „Opis (Description)”.
5. „Dalej” → **ekran publikacji** („Post to TikTok”). Wszystko jest na jednej stronie:
   - **podgląd materiału** z treścią i hashtagami (5a);
   - **nazwa konta TikTok** („Publikujesz na koncie TikTok (posting to): …”) (1a);
   - lista „Kto może zobaczyć ten post (Who can view this post)” **bez wybranej wartości**, opcje z konta (2b);
   - checkboxy Comment/Duet/Stitch **odznaczone** (2c). Przy zdjęciu jest tylko „Allow Comment”.
     Zaznacz jeden ręcznie;
   - przełącznik „Disclose commercial content” **wyłączony** (3a). Włącz go, **nic nie zaznaczaj**:
     pojawia się „You need to indicate…”, przycisk publikacji jest nieaktywny, a po najechaniu
     pokazuje ten sam tekst;
   - zaznacz „Your brand” → „Your video will be labeled as 'Promotional content'”;
   - zaznacz „Branded content” → „…'Paid partnership'”. Opcja „Tylko ja (Only me)” jest wyłączona,
     pod listą widać „Branded content visibility cannot be set to private.” (3b);
   - odznacz „Branded content”, wybierz „Tylko ja” → „Branded content” jest wyszarzone z tym samym
     komunikatem (3b, odwrotna kolejność);
   - deklaracja tuż nad przyciskiem: „By posting, you agree to TikTok's Music Usage Confirmation”
     z linkiem. Przy Branded content: „…Branded Content Policy and Music Usage Confirmation” (4).
     **Zmiana dowolnego ustawienia odznacza zgodę.** Zaznacz ją na końcu, kliknij „Opublikuj teraz” (5c);
   - pod przyciskiem: informacja, że przetwarzanie może potrwać kilka minut (5d).
6. Ekran statusu: „TikTok przetwarza publikację…”, status odświeża się sam, aż do „Opublikowano”
   (5e). Otwórz profil TikTok i pokaż opublikowany post **bez żadnego znaku wodnego** Postfly.
7. (Jeśli zostawiasz `user.info.stats` / `video.list`.) Pokaż ekran, który ich używa.

## 5. Formularz wniosku: opis zastosowania (do wklejenia i dopasowania)

> Postfly is a web-based social media publishing tool (SaaS) for independent creators and small
> businesses. Any creator can sign up at <domain>, connect their own TikTok account via Login Kit
> and publish their own original videos and photos to their own profile. Before every TikTok post
> the creator sees their TikTok nickname, manually selects the privacy level (options come from
> creator_info, no default), manually opts in to comments/duet/stitch (all off by default), can
> disclose commercial content (Your brand / Branded content), reviews a preview and edits the
> caption, and explicitly agrees to TikTok's Music Usage Confirmation (and Branded Content Policy
> when applicable) right before the publish button. Content is sent with Direct Post using
> PULL_FROM_URL from our verified domain; we poll publish/status/fetch and show the post status to
> the user. Postfly never adds watermarks or branding to creators' content, and never republishes
> content from other platforms to TikTok automatically — every TikTok post is initiated and
> confirmed by the creator in the web app.

Szacunki użytkowników (creator cap) podaj realistycznie. To one wyznaczają dzienny limit twórców.

## Gdzie to jest w kodzie

| Wymóg | Miejsce |
|---|---|
| 1a nick, 1b „can't post”, 1c długość | `components/composer/TikTokSettingsPanel.tsx`, `ScheduleStep.tsx`, `useTikTokCreatorInfo.ts`, `app/api/social-accounts/tiktok/creator-info/route.ts`, `lib/server/tiktok-creator-info.ts` |
| 1b także w chwili wysyłki (posty zaplanowane) | `lib/server/publish-processor.ts` → `assertTikTokCreatorCanPost` |
| 2b/2c brak wartości domyślnych, zdjęcia bez Duet/Stitch | `TikTokSettingsPanel.tsx`, `app/api/publish-jobs/drafts/[id]/route.ts`, `publish-processor.ts` → `requireTikTokPrivacyLevel` |
| 3a/3b/4 ujawnienie treści komercyjnej i deklaracje | `TikTokSettingsPanel.tsx`, `ScheduleStep.tsx`, `lib/server/publish-jobs.ts` |
| 5c zgoda tylko ręcznie w panelu web | `lib/server/publish-jobs.ts` (`tiktokConsentAt` wymagane, także w `/approve`, `/retry`; „optymalny termin”, autopilot, plan kampanii i Telegram zostawiają TikToka jako szkic), `app/api/publish-jobs/drafts/[id]/route.ts` (każda edycja kasuje zgodę) |
| 5d/5e przetwarzanie i status | `ScheduleStep.tsx`, `PostStatusScreen.tsx`, `POST /api/publish-jobs/status-refresh`, sprawdzanie statusu przez QStash w `publish-processor.ts` |

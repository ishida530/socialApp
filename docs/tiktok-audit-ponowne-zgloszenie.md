# TikTok Content Posting API: ponowne zgłoszenie do audytu

Poprzedni wniosek (ref. `20260913074631`) został odrzucony z powodu niezgodności z
[Content Sharing Guidelines](https://developers.tiktok.com/doc/content-sharing-guidelines).
Kod jest poprawiony i wdrożony na `postfly.pl` (PR #120). Scenariusz nagrania z gotowymi
angielskimi napisami jest w [tiktok-demo-nagranie.md](tiktok-demo-nagranie.md).

Stan na 2026-09-30: ✅ zrobione, ⏳ wymaga Twojej decyzji albo logowania na Twoje konto.

## 1. Konfiguracja produkcji (Vercel)

- ⏳ `APP_MODE=commercial` i `NEXT_PUBLIC_APP_MODE=commercial`. W trybie `personal` rejestracja jest
  zamknięta po pierwszym koncie (`/api/auth/register-status` → `{"open":false}`), a recenzent nie
  założy konta. **Najpierw** trzeba podnieść istniejące konta do planu BUSINESS, bo w trybie
  `commercial` Twoje konto spadnie do FREE (1 kanał, 3 posty/mies.). Nowi użytkownicy dostają 7 dni
  PRO. Automatyczny tryb uprawnień zablokował tę zmianę na produkcyjnej bazie, więc potrzebna jest
  Twoja zgoda.
- ✅ Domena `postfly.pl`: `FRONTEND_URL` i wszystkie `*_REDIRECT_URI` są spójne.
- ✅ Linki `/terms` i `/privacy` są w stopce strony głównej.
- ✅ QStash jest skonfigurowany. Status TikToka sprawdza się co minutę, a ekran statusu dodatkowo
  odświeża go na żywo.
- ✅ Zablokowana migracja produkcyjna (P3009) jest naprawiona, deploy działa.

## 2. TikTok Developer Portal (wymaga logowania na Twoje konto deweloperskie)

- ✅ Scope'y w aplikacji Postfly ograniczone do używanych: `user.info.basic`, `video.publish`,
  `user.info.stats`, `video.list` (kod i `TIKTOK_OAUTH_SCOPES` w Vercelu). Usunięte:
  `user.info.profile`, `video.upload`.
- ⏳ W portalu (Products/Scopes) wyłącz `video.upload` i `user.info.profile`, jeśli są dodane, a we
  wniosku zaznacz tylko 4 scope'y z punktu wyżej.
- ⏳ **Manage URL properties**: zweryfikuj `https://postfly.pl/` (prefiks URL albo domena przez DNS
  TXT). Stąd TikTok pobiera media (`PULL_FROM_URL`, `/api/videos/.../source`). Jeśli portal da plik
  weryfikacyjny, wrzuć go do `public/` i zrób deploy, albo przekaż mi, a zrobię to ja.
- ⏳ Sprawdź, czy Redirect URI to `https://postfly.pl/api/auth/callback/tiktok`, a „Website URL” to
  `https://postfly.pl`.
- ⏳ Nazwa i ikona aplikacji nie mogą nawiązywać do TikToka ani innych serwisów społecznościowych.

## 3. Meta i Google (onboarding nowych użytkowników, niezależny od TikToka)

- ✅ Produkcyjne `FACEBOOK_OAUTH_SCOPES` / `INSTAGRAM_OAUTH_SCOPES` zawierają tylko uprawnienia
  zatwierdzone w App Review (`docs/status-audytow-api.md`). Nowe (`pages_manage_engagement`,
  `instagram_manage_comments`) nie są wymagane przy łączeniu. Dopóki nie przejdą App Review, bez nich
  nie działają tylko odpowiedzi na komentarze.
- ⏳ Meta for Developers: potwierdź, że aplikacja jest w trybie **Live**.
- ⏳ Google Cloud Console (YouTube): ekran zgody OAuth w stanie **In production**.
- ⏳ Konta Facebook/Instagram podłączone przed 30.09 połącz raz ponownie („Połącz ponownie” w Konta
  social). Dopiero wtedy dostaną niewygasające tokeny stron.

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

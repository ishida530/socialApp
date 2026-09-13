# Status audytów API platform (TASK-1.2.2)

Data sprawdzenia: **2026-09-13**

## TikTok — Content Posting API

**Status: złożony, czeka na decyzję.**

- Appka działa dziś produkcyjnie na kontach dodanych jako target users w TikTok Developer Portal (Sandbox), z pełnym scope OAuth (`video.publish`, `video.upload`, `user.info.profile`, `user.info.stats`, `video.list` — patrz `TIKTOK_OAUTH_SCOPES` w `.env.example`).
- Wniosek o pełny audyt produkcyjny (dostęp dla dowolnego konta TikTok, nie tylko dodanych ręcznie jako testowe) został złożony. Standardowy czas decyzji TikTok: 2-4 tygodnie.
- Do czasu zatwierdzenia: appka może publikować wyłącznie na kontach TikTok jawnie dodanych jako testerzy/target users w konsoli deweloperskiej — próba użycia niedodanego konta kończy się błędem `unaudited_client` (zobacz `BUGS.md`, historia debugowania realnej publikacji TikTok, TASK-3.3.1).

## Meta (Facebook + Instagram) — Graph API

**Status: zatwierdzony (Advanced Access).**

- Appka ma pełny, zatwierdzony dostęp produkcyjny dla uprawnień: `pages_show_list`, `pages_manage_posts`, `pages_read_engagement`, `instagram_basic`, `instagram_content_publish`, `business_management` (patrz `FACEBOOK_OAUTH_SCOPES`/`INSTAGRAM_OAUTH_SCOPES` w `.env.example`).
- Działa dla dowolnego konta Facebook/Instagram, nie tylko kont testowych.

## Statystyki/metryki postów — status pól API (sprawdzone 2026-09-13)

Research pod `PostMetric` (`lib/server/post-metrics.ts`) — realne zbieranie wyświetleń/polubień/komentarzy/udostępnień z każdej platformy, weryfikacja przeciw aktualnej dokumentacji każdej platformy:

- **TikTok** — potwierdzony: `POST https://open.tiktokapis.com/v2/video/query/` (scope `video.list`, już przyznany), pola `like_count,comment_count,share_count,view_count`, filtr po `video_ids` (max 20 na żądanie). To standardowe Display API, nie osobne Research API wymagające dodatkowej akredytacji.
- **Instagram** — **ważna zmiana od 2024-07-02**: metryka `impressions`/`plays` przestała działać dla nowszych mediów, zastąpiona przez `views` (przez `/{media-id}/insights?metric=views`). `like_count`/`comments_count` (bezpośrednio na węźle media, nie przez insights) bez zmian. Appka pobiera oba (dwa niezależne, odporne na błędy wywołania).
- **Facebook** — **deprecacja od 2026-06-15**: cała rodzina metryk `*_impressions*` (Page i Post) wycofana z Graph API. Appka NIE używała tych metryk (tylko `likes.summary`, `comments.summary`, `shares` — bezpośrednie pola węzła, nie insights), więc deprecacja jej nie dotyczy.
- **YouTube** — potwierdzony: `channels.list?part=statistics` (poza zakresem dzisiejszego `PostMetric`, per-post) daje `subscriberCount`/`viewCount`/`videoCount` na poziomie całego kanału — realny sygnał wzrostu konta, nie tylko pojedynczego posta. Nie zaimplementowane w tej sesji (świadomie poza zakresem `PostMetric`, który jest per-post) — kandydat na przyszłe rozszerzenie, jeśli pojawi się konkretna funkcja potrzebująca wzrostu obserwujących, nie tylko wyników pojedynczych postów.

Źródła: oficjalna dokumentacja TikTok for Developers, Meta for Developers (Instagram Media Insights, Graph API Insights reference) — sprawdzone przez WebFetch bezpośrednio z tych domen, nie przez wtórne źródła.

## Przy następnym sprawdzeniu

Zaktualizuj datę i stan powyżej, gdy TikTok podejmie decyzję o audycie (zatwierdzony/odrzucony) — wpłynie to na zakres realnie dostępny dla nowych użytkowników appki w `APP_MODE=commercial`.

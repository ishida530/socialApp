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

## Przy następnym sprawdzeniu

Zaktualizuj datę i stan powyżej, gdy TikTok podejmie decyzję o audycie (zatwierdzony/odrzucony) — wpłynie to na zakres realnie dostępny dla nowych użytkowników appki w `APP_MODE=commercial`.

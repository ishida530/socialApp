# Handoff — Pryzmat marketing automation + Postfly TikTok compliance

Data: 2026-09-30. Ten plik to kontekst do wklejenia w nowym oknie/sesji Claude Code, żeby nie
tracić historii tej rozmowy. Obejmuje pracę w **dwóch repo**: `C:\postfly` (ten katalog) i
`C:\pryzmat\przymat-claude`.

## Cel całej inicjatywy

Biuro nieruchomości PRYZMAT (`www.pryzmatnieruchomosci.pl`) chce automatyzacji marketingu:
1. Nowy artykuł na blogu → automatycznie tworzy się (po zatwierdzeniu) post na social media.
2. Nowa oferta w Asari (CRM, wrzuca mama właściciela) → automatycznie tworzy się (po
   zatwierdzeniu) post na social media z ceną/lokalizacją/linkiem.
3. Publikacja social media idzie przez **Postfly** — własną apkę (ten katalog), która już
   wcześniej działała jako narzędzie do publikacji na Facebook/Instagram/TikTok/LinkedIn/YouTube.

## Status: WSZYSTKO zaimplementowane, przetestowane i **wypchnięte na oba repo (main, zdalnie)**

```
postfly:  main @ 220261e (fix(tiktok): comply with Content Posting API audit guidelines)
pryzmat:  main @ ce8c0e8 (feat(blog): fact-checked articles, SEO, Poradnik in menu, safer social posts)
```

Obydwa `git status` czyste, `main` zgodny z `origin/main` (sprawdzone `git fetch` + `status -sb`).

**Uwaga:** pryzmat ma na koncie commity, których ja (ta sesja) nie robiłem — `16315b0` i `ce8c0e8`
to kontynuacja mojej pracy przez inną sesję/Ciebie (fact-checking artykułów przez web search,
sprawdzanie SEO on-page, link do /poradnik w menu, bezpieczniejsze posty social). Nie znam
pełnej treści tych zmian z pierwszej ręki — jeśli coś w pryzmat wygląda inaczej niż się
spodziewasz, sprawdź `git log`/`git show` tam, nie zakładaj że to ja.

## Co dokładnie zbudowano

### 1. Postfly — `POST /api/external/content-intake` (fundament)
- `lib/server/external-content.ts`, `app/api/external/content-intake/route.ts`.
- Przyjmuje `{type: "blog"|"listing", sourceRef, title, excerpt, url, imageUrl, price?, location?, category?}`.
- Auth: `Authorization: Bearer EXTERNAL_CONTENT_SECRET` (jak `CRON_SECRET`).
- Idempotentne po `sourceRef` (unique na `Video.sourceRef`) — retry nie tworzy duplikatu.
- Claude generuje caption+hashtagi per platforma (FB/IG zawsze, LinkedIn tylko dla blogu — profil
  osobisty, nie strona firmowa, patrz niżej).
- Tworzy DRAFT `PublishJob`, wysyła podgląd na Telegram (Publikuj/Anuluj — reuse istniejącego bota).
- Testy: `tests/api/external-content-intake.test.ts`.

### 2. Pryzmat — blog na wzorcu code94 (MDX + PR + Telegram), Claude zamiast GPT-4o
- SEO-agent (`scripts/seo-agent/`) generuje artykuł przez Claude, teraz **z fact-checkingiem
  przez web search** (dodane w `ce8c0e8`, po mojej pierwszej wersji) — patrz
  `scripts/seo-agent/lib/claude-client.ts` (`researchFacts`, `factCheckArticle`,
  `findUnverifiedLinks`) i `lib/anthropic-client.ts` (`researchWithWebSearch`, oficjalne SDK
  `@anthropic-ai/sdk`, nie surowy `fetch` jak w mojej pierwszej wersji).
- Publikacja = PR z brancha `blog/{slug}` → GitHub webhook (`app/api/telegram/pr-notify`) →
  Telegram (Zatwierdź/Odrzuć) → merge = live pod `/poradnik/{slug}` **i** automatyczne wywołanie
  Postfly (`app/api/telegram/webhook`'s `triggerSocialDraft`).
- `lib/blog-checks.ts` ma teraz też sprawdzanie SEO on-page (długość title/description, fraza
  kluczowa w tytule/wstępie/H2), blokery przy brakującym fact-checku/placeholderach — dodane po
  mojej wersji.
- `/poradnik` jest teraz w głównym menu (wcześniej nie było).
- Obrazek OG do posta na blogu: **programowo renderowana grafika** (gradient marki + tytuł,
  `lib/og-article.tsx`, `next/og` `ImageResponse`) — **zero tokenów, nie AI**. Świadoma decyzja:
  zostać przy gradiencie zamiast zdjęć z Unsplash (patrz `AskUserQuestion` w tej rozmowie).

### 3. Pryzmat — `/api/sync` (Asari) wykrywa nowe oferty
- Rozróżnia nową ofertę od zmienionej (`newIds` vs `changedIds`).
- Pomija dzieci "Investment" (`parent_listing_id` — nowa kolumna, migracja `0003_listings_social_sync.sql`).
- Retry niezależny od zmiany danych w Asari: kolumna `social_post_synced_at`, ustawiana tylko po
  sukcesie — zapytanie o kandydatów do zgłoszenia jest osobne od logiki diff/upsert.
- `lib/postfly-client.ts` — wywołanie Postfly, **teraz też z `brandContext`/`platformGuides`/
  `brandHashtag`/`siteLabel`** (dodane w `ce8c0e8`, nie było w mojej wersji — sprawdź
  `lib/social-style.ts` i `lib/constants.ts`'s `BRAND_CONTEXT` w pryzmat, jeśli potrzebujesz
  szczegółów).

### 4. Postfly — TikTok Content Posting API: naprawiony odrzucony audyt (ref 20260913074631)
To był osobny wątek — TikTok odrzucił wniosek o audyt Direct Post API. Znalezione i naprawione:
- Prywatność/Komentarze/Duet/Stitch miały wartości domyślne (TikTok tego zabrania — "no default
  value", "none checked by default"). Naprawione w `TikTokSettingsPanel.tsx`,
  `app/api/publish-jobs/drafts/[id]/route.ts`, `lib/server/publish-processor.ts`.
- "Sticky defaults" (dziedziczenie ustawień z poprzedniego posta na koncie) **usunięte dla
  TikToka** (`lib/server/publish-jobs.ts`) — zostały tylko dla Mety.
- Telegram miał osobny auto-default (BUG-003: SELF_ONLY przy uploadzie) — zastąpiony wykluczeniem
  TikToka z auto-publikacji (`excludedFromPublish: true`), z informacją że trzeba dokończyć w
  panelu web.
- Zbudowana od zera: **Commercial Content Disclosure** (wymagana sekcja 3 wytycznych TikToka) —
  przełącznik + "Twoja marka"/"Treść sponsorowana", walidacja serwerowa w dwóch miejscach
  (`enqueueDraftGroup` i PATCH), wysyłane do TikToka jako `brand_organic_toggle`/
  `brand_content_toggle`.
- Migracja: `prisma/migrations/20260930120000_tiktok_commercial_disclosure/` — **już uruchomiona
  na produkcyjnej Supabase przez użytkownika** (ręcznie, ja nie miałem stąd dostępu sieciowego).
- Testy: `tests/api/tiktok-commercial-disclosure.test.ts` + zaktualizowane istniejące (640/640
  zielone przed pushem, `npm run build` czysty).

## Co NIE jest zrobione / wymaga Twojej akcji (nie kodu)

1. **TikTok: ponownie wyślij wniosek o audyt** Content Posting API - Direct Post, teraz że UX jest
   zgodny z wytycznymi. W formularzu opisz Postfly jako SaaS dla wielu niezależnych klientów, nie
   jako narzędzie do zarządzania własnymi/zespołowymi kontami (sekcja "Intended Use" wytycznych).
2. **Konta social nie są jeszcze utworzone/podłączone** dla PRYZMAT w Postfly (Facebook Page + IG
   Business + LinkedIn profil osobisty) — blocker dla realnej publikacji.
3. **Meta App Review** dla `pages_manage_posts`/`instagram_content_publish` itd. — sprawdź status
   w Meta for Developers (wg wcześniejszego audytu subagenta: powinno być już zatwierdzone
   "Advanced Access", ale zweryfikuj że apka jest w trybie Live).
4. **Google Cloud Console** — ekran zgody OAuth dla YouTube musi być "In production"/zweryfikowany
   (nie "Testing"), bo `youtube.upload` to scope wrażliwy. Nieudokumentowane w kodzie, tylko
   ręczna weryfikacja w konsoli.
5. **Webhooki (jednorazowa konfiguracja w pryzmat, jeśli jeszcze nie zrobione):**
   - GitHub → Settings → Webhooks: Payload URL `https://www.pryzmatnieruchomosci.pl/api/telegram/pr-notify`,
     Content-Type `application/json`, Secret = `GITHUB_WEBHOOK_SECRET`, event: "Pull requests".
   - Telegram `setWebhook` na `https://www.pryzmatnieruchomosci.pl/api/telegram/webhook` z
     `secret_token=TELEGRAM_WEBHOOK_SECRET`.
6. **Zmienne środowiskowe** — pełna lista była w mojej wcześniejszej wiadomości w tej rozmowie
   (sekcja "Zmienne środowiskowe do uzupełnienia"); kluczowe: `EXTERNAL_CONTENT_SECRET` musi być
   **identyczny** w obu repo (pryzmat i postfly), `POSTFLY_URL` w pryzmat musi wskazywać na
   faktyczny adres wdrożenia Postfly.
7. **Vercel deploy postfly** — push poszedł do `main` z bypassem reguły "Required status check
   'test'" (masz uprawnienia do bypassu). Sprawdź w dashboardzie Vercela czy build faktycznie
   przeszedł.
8. Opcjonalnie/na później (nieblokujące, nie robione): przypomnienie w Telegramie o
   niezatwierdzonych draftach starszych niż X godzin; LinkedIn Company Page (świadomie odłożone —
   wymaga ciężkiego procesu partnerskiego LinkedIn, patrz research w tej rozmowie); TikTok
   pominięty jako platforma docelowa dla samych ofert (tylko blog, i to po audycie).

## Kluczowe pliki do orientacji

**Postfly:**
- `lib/server/external-content.ts`, `app/api/external/content-intake/route.ts` — intake z pryzmat.
- `lib/server/publish-jobs.ts` — `createDraftGroupForVideo`, `enqueueDraftGroup` (gate TikToka).
- `components/composer/TikTokSettingsPanel.tsx` — UI ustawień TikTok + disclosure.
- `app/api/telegram/webhook/route.ts` — bot Telegram (zatwierdzanie postów, w tym TikTok exclude).
- `lib/server/publish-processor.ts` — realna publikacja (per platforma), `publishToTikTok(Photo)`.

**Pryzmat:**
- `scripts/seo-agent/` — worker generujący artykuły (cron, GitHub Actions).
- `lib/blog.ts`, `lib/blog-checks.ts`, `lib/github.ts`, `lib/telegram.ts`, `lib/postfly-client.ts`.
- `app/api/telegram/pr-notify/route.ts`, `app/api/telegram/webhook/route.ts` — approval pipeline.
- `app/api/sync/route.ts` — sync Asari + zgłaszanie nowych ofert do Postfly.

## Jak testować od zera (skrót — pełne instrukcje były wcześniej w tej rozmowie)

```bash
# Postfly
npm run docker:up
npx prisma migrate deploy
npx vitest run

# Pryzmat
npm run build
npm run export-articles   # jednorazowo, migracja starych artykułów Supabase -> MDX
npm run seo-agent         # albo workflow_dispatch w GitHub Actions
```

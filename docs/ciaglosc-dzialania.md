# Plan ciągłości działania — Postfly (TASK-7.5)

## Cel dokumentu

Mapa **technicznych** dostępów potrzebnych do utrzymania/przejęcia appki w razie niedyspozycji właściciela (Paweł Sawczuk). To NIE jest skarbiec haseł — żaden prawdziwy sekret/hasło nie jest tu zapisany, tylko lista "co istnieje, gdzie się tym zarządza, co się stanie bez dostępu". Same sekrety żyją wyłącznie w Vercel (env vars produkcji) i lokalnym `.env` (nieśledzonym przez git).

**Kogo dopuścić do listy poniżej to decyzja wyłącznie właściciela — appka/ten dokument jej nie podejmuje.** Sekcja na końcu czeka na tę decyzję.

## Lista dostępów, w kolejności krytyczności

| # | Usługa | Do czego służy | Panel zarządzania | Co się stanie bez dostępu |
|---|---|---|---|---|
| 1 | **Vercel** | Hosting produkcji, deploy, wszystkie zmienne środowiskowe (w tym sekrety poniżej) | vercel.com, projekt `social-app` (zespół `shoqers-projects`) | Appka przestaje się wdrażać przy zmianach; istniejący deploy działa dalej, dopóki Vercel go nie wygasi |
| 2 | **Domena postfly.pl** | Adres appki | Rejestrator domeny (do potwierdzenia przez właściciela, który) | Bez odnowienia domena wygasa, appka znika spod tego adresu (Vercel URL nadal by działał) |
| 3 | **Supabase (Postgres)** | Baza danych produkcyjna — wszystkie dane userów, treści, publikacji | supabase.com, projekt powiązany z `aws-1-eu-west-3.pooler.supabase.com` | Appka całkowicie niedostępna (żadna funkcja nie działa bez bazy) |
| 4 | **GitHub** | Kod źródłowy, historia, CI/CD (Actions), Dependabot | github.com/ishida530/socialApp | Bez dostępu nie da się wdrożyć żadnej zmiany w kodzie ani zmergować PR-a |
| 5 | **Stripe** | Płatności/subskrypcje (obecnie: konto zwykłe Stripe; docelowo Stripe Connect dla wypłat — patrz decyzja EPIC 5) | dashboard.stripe.com | Bez dostępu: nie da się obsłużyć zwrotów/reklamacji płatności, nie da się zmienić cen/planów |
| 6 | **Anthropic Console** | Klucz API do Claude (sugestie treści, Smart Autopilot, agent-mentor na Telegramie) | console.anthropic.com | Appka nadal działa (wszystkie funkcje AI mają uczciwy fallback na heurystyki/szablony), ale traci realne generowanie treści |
| 7 | **Google Cloud Console** | OAuth do logowania Google + integracja YouTube | console.cloud.google.com | Logowanie przez Google i publikacja na YouTube przestają działać dla nowych połączeń; istniejące tokeny działają do wygaśnięcia |
| 8 | **Meta for Developers** | OAuth + publikacja na Facebook/Instagram | developers.facebook.com | Jak wyżej, dla Facebooka/Instagrama |
| 9 | **TikTok for Developers** | OAuth + publikacja na TikTok | developers.tiktok.com | Jak wyżej, dla TikToka |
| 10 | **Telegram — @BotFather** | Token bota, przez którego działa cała warstwa kontroli appki (powiadomienia, zatwierdzanie publikacji, agent-mentor) | Telegram, konto które założyło bota u @BotFather | Bez dostępu nie da się zmienić ustawień bota (nazwa, opis, webhook) — sam bot dalej działa, dopóki token jest ważny w Vercel |
| 11 | **Resend** | Wysyłka e-maili (powitalny, reset hasła, przypomnienie o Telegramie, nieudana płatność) | resend.com | E-maile przestają wychodzić dla nowych zdarzeń |
| 12 | **Upstash** | Redis (rate-limiting) + QStash (precyzyjny harmonogram publikacji) | upstash.com | Appka działa dalej na fallbackach (dzienny cron zamiast precyzyjnego QStash), rate-limiting przestaje działać |
| 13 | **Sentry** | Monitoring błędów produkcji | sentry.io | Appka działa dalej, ale nikt nie widzi nowych błędów produkcyjnych |

## Co appka NIE potrzebuje w tej liście

Środowisko deweloperskie (lokalny Postgres/Redis w Dockerze) nie jest tu wymienione — nie dotyczy ciągłości produkcji, tylko lokalnej pracy nad appką.

## Otwarte: komu nadać dostęp

*Właściciel jeszcze nie zdecydował. Miejsce na: kto dostaje dostęp do której pozycji z listy wyżej, w jakiej kolejności/warunkach (np. "dopiero po X dniach braku kontaktu"), i jak przekazać faktyczne hasła/klucze (menedżer haseł ze współdzielonym sejfem, nie ten dokument).*

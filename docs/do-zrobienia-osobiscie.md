# Postfly: co musisz zrobić osobiście

Stan na **3.10.2026**. Postfly startuje jako **darmowa beta** (każde konto z potwierdzonym e-mailem ma plan PRO, płatności są wyłączone), bo JDG Code94 jest zawieszona, a przy zawieszonej działalności nie można sprzedawać. Poniższe kroki wymagają Twoich kont albo decyzji, więc nie mogę ich zrobić za Ciebie.

Kolejność: **część A przed udostępnieniem bety**, część B w pierwszym tygodniu (w tym review platform), część C po zatwierdzeniach platform, **część D dopiero wtedy, gdy zechcesz zacząć sprzedawać**.

Po każdym kroku zaznacz `[x]`. Jeśli przy którymś kroku zobaczysz coś innego niż w opisie, wklej mi zrzut ekranu.

---

## Jak ustawiać zmienne w Vercelu (dotyczy kilku kroków)

1. https://vercel.com → projekt **postfly** → **Settings** → **Environment Variables**.
2. **Add New** → wpisz nazwę i wartość → zaznacz tylko **Production** (chyba że krok mówi inaczej) → **Save**.
3. Zmienne działają dopiero po nowym wdrożeniu: **Deployments** → przy najnowszym wdrożeniu `⋯` → **Redeploy** (bez zaznaczania „Use existing Build Cache” nie trzeba nic zmieniać).
4. Wartości zmiennych to sekrety. Nie wklejaj ich do czatu ani do repozytorium, wystarczy, że napiszesz mi „ustawione”.

---

## A. Przed udostępnieniem bety (ok. 45 minut)

### A1. Vercel Pro — 5 minut

**Dlaczego:** plan Hobby pozwala wyłącznie na użytek niekomercyjny. Darmowa beta produktu, który ma zarabiać, jest na granicy tej definicji, a przy płatnych klientach to już na pewno naruszenie regulaminu. Najpóźniej przed włączeniem płatności (część D) przejdź na Pro.

- [ ] Vercel → avatar zespołu (lewy górny róg) → **Settings** → **Billing**.
- [ ] **Upgrade to Pro** (20 USD/mies. za osobę w zespole) i dodaj kartę.
- [ ] Upewnij się, że projekt **postfly** jest w zespole z planem Pro (jeśli jest na koncie osobistym Hobby: projekt → **Settings** → **General** → **Transfer Project** do zespołu Pro).
- [ ] Opcjonalnie: **Settings** → **Billing** → **Spend Management** — ustaw limit wydatków, np. 50 USD, i powiadomienie e-mail.

### A2. Sentry — monitoring błędów — 10 minut

**Dlaczego:** bez tego nie dowiesz się, że klientowi coś nie działa, dopóki nie napisze. Kod jest gotowy, brakuje tylko klucza.

- [ ] Załóż konto na https://sentry.io (plan **Developer**, darmowy, wystarcza na start). Region danych: **EU (Frankfurt)**, ze względu na RODO.
- [ ] **Projects** → **Create Project** → platforma **Next.js** → nazwa `postfly` → **Create Project**. Kreator instalacji pomiń (SDK jest już w kodzie).
- [ ] Skopiuj DSN: **Settings** → **Projects** → `postfly` → **Client Keys (DSN)**. Wygląda jak `https://abc123@o123456.ingest.de.sentry.io/789`.
- [ ] W Vercelu (Production) dodaj dwie zmienne z **tą samą** wartością:
  - `SENTRY_DSN`
  - `NEXT_PUBLIC_SENTRY_DSN`
- [ ] Redeploy.
- [ ] Ustaw alert: **Alerts** → **Create Alert** → **Issues** → „A new issue is created” → powiadomienie na Twój e-mail.
- [ ] Napisz mi „Sentry ustawione”. Sprawdzę, czy zdarzenia dochodzą.

Opcjonalnie (czytelniejsze ślady błędów): `SENTRY_ORG`, `SENTRY_PROJECT` i `SENTRY_AUTH_TOKEN` (Sentry → **Settings** → **Auth Tokens** → **Create New Token**). Bez nich wszystko działa, tylko stack trace pokaże skompresowany kod.

### A4. Domena e-mail w Resend — 5–15 minut + czas propagacji DNS

**Dlaczego:** nowi użytkownicy dostają plan PRO bety dopiero po kliknięciu linku z e-maila. Bez zweryfikowanej domeny e-maile trafiają do spamu albo nie dochodzą, a reset hasła też przestaje działać.

- [ ] https://resend.com → **Domains**. Domena `postfly.pl` powinna mieć status **Verified**. Jeśli tak — przejdź do testu niżej.
- [ ] Jeśli jej nie ma: **Add Domain** → `postfly.pl` → region **EU (Ireland)**.
- [ ] Resend pokaże 3–4 rekordy DNS (MX i TXT dla subdomeny `send`, TXT `resend._domainkey` dla DKIM). Dodaj je **dokładnie** w panelu, w którym zarządzasz DNS domeny (rejestrator albo Vercel → **Domains**, jeśli DNS jest w Vercelu).
- [ ] Dodaj też rekord DMARC (zalecany przez Gmail i Outlook): TXT, nazwa `_dmarc`, wartość `v=DMARC1; p=none; rua=mailto:hello@postfly.pl`.
- [ ] Resend → **Verify DNS Records**. Propagacja trwa zwykle kilka minut, czasem do kilku godzin.
- [ ] W Vercelu sprawdź, że `EMAIL_FROM` używa tej domeny (`PostFly <hello@postfly.pl>`) i że `RESEND_API_KEY` jest ustawione.
- [ ] **Test:** zarejestruj nowe konto na `https://postfly.pl/register` adresem Gmail i adresem Outlook/Onet/WP. E-mail powinien przyjść do **Odebranych** (nie do spamu) w ciągu minuty. Kliknij link → wraca na pulpit z komunikatem „Adres e-mail potwierdzony”, a baner znika.
- [ ] Usuń testowe konta w aplikacji (**Ustawienia** → usuń konto), żeby nie zaśmiecały statystyk.

### A4b. Skrzynka hello@postfly.pl — 10 minut

**Dlaczego:** od 3.10 to jedyny adres kontaktowy w regulaminie, polityce prywatności, stopce i na stronie usuwania danych dla Mety. Trafiają tam reklamacje i żądania RODO (odpowiedź w 14 dniach / 1 miesiąc), więc wiadomości nie mogą przepadać.

- [ ] Skrzynka albo przekierowanie hello@postfly.pl → Twój prywatny adres (u rejestratora domeny albo np. w ImprovMX / Cloudflare Email Routing, oba darmowe).
- [ ] Wyślij testową wiadomość na hello@postfly.pl z innego adresu i sprawdź, że dochodzi.
- [ ] W Google Cloud (Branding → User support email) i w Meta (Settings → Basic → Contact email) możesz zostawić dotychczasowy adres, ale spójny hello@postfly.pl wygląda dla recenzentów lepiej.

### A5. Konto Anthropic (AI) — 10 minut

**Dlaczego:** 2.10.2026 skończyły się środki na koncie Anthropic. Bez nich opisy postów, „Wygeneruj ponownie” i asystent Telegram nie działają (aplikacja wstawia wtedy samą notatkę użytkownika i pokazuje komunikat o niedostępnym AI).

- [ ] https://console.anthropic.com → **Plans & Billing** → **Buy credits** (np. 20–50 USD na start).
- [ ] Tamże włącz **Auto-reload** (np. doładowanie 20 USD, gdy saldo spadnie poniżej 5 USD).
- [ ] **Limits** → ustaw miesięczny limit wydatków (np. 30 USD na start, podnoś razem z liczbą klientów), żeby błąd albo nadużycie nie wygenerowały dowolnego rachunku.
- [ ] Sprawdź w aplikacji: nowy post ze zdjęciem → opis powinien dotyczyć tego, co jest na zdjęciu.
- [ ] Alerty: gdy AI przestanie działać z powodu środków albo klucza, aplikacja wyśle e-mail (najwyżej raz na godzinę) na adresy z `ADMIN_EMAILS`. Inny adres ustawisz zmienną `AI_ALERT_EMAILS` w Vercelu. Alert działa po skonfigurowaniu Resend (A4).
- [ ] Miesięczne limity AI: w becie każde konto ma limit PRO (600 tekstów). Po becie: FREE 20, STARTER 200, PRO 600, BUSINESS 1500, okres próbny 50 są w `lib/billing/plans.ts` → `ai_generations`. Zmień je, jeśli chcesz, a ja zaktualizuję też opis planów w cenniku.
- [ ] Przed zmianą modelu albo promptu uruchom ewaluację: `npm run eval:captions` (opis w `evals/README.md`, ok. 1 USD za przebieg).

---

## B. W pierwszym tygodniu

### B1. Upstash Redis — wspólne limity zapytań — 10 minut

**Dlaczego:** limity prób logowania i rejestracji działają teraz w pamięci pojedynczej instancji. Przy kilku równoległych instancjach na Vercelu atakujący ma więcej prób. Kod obsługuje Upstash bez zmian.

- [ ] https://console.upstash.com → **Redis** → **Create Database**.
  - Nazwa: `postfly-ratelimit`;
  - Region: **eu-central-1 (Frankfurt)** albo **eu-west-1 (Ireland)** — najbliżej funkcji Vercela w Paryżu;
  - Plan: **Free** (wystarcza).
- [ ] Zakładka **REST API** → skopiuj `UPSTASH_REDIS_REST_URL` i `UPSTASH_REDIS_REST_TOKEN`.
- [ ] Vercel (Production): dodaj obie zmienne → Redeploy.
- [ ] Napisz mi „Upstash ustawiony” — sprawdzę, czy limity zapisują się w Redisie.

### B2. Konto testowe dla recenzentów platform — 10 minut

**Dlaczego:** TikTok i YouTube są dla zwykłych kont oznaczone „Wkrótce” do czasu zatwierdzenia. Konto z listy `REVIEWER_EMAILS` widzi wszystko, co jest w review (TikTok, YouTube, odpowiedzi na komentarze), ma pełny plan BUSINESS przez cały czas review i **nie** ma dostępu do panelu administratora.

- [ ] Wybierz osobny adres, np. alias Gmail `twojemail+review@gmail.com`.
- [ ] Vercel (Production): dodaj zmienną `REVIEWER_EMAILS` z tym adresem → Redeploy. Kilka adresów oddzielasz przecinkami.
- [ ] Załóż konto na `https://postfly.pl/register` tym adresem, **kliknij link w e-mailu potwierdzającym**, zapisz hasło w menedżerze haseł.
- [ ] Zaloguj się na to konto → **Połączone konta**: TikTok i YouTube **nie** mają plakietki „Wkrótce”. Jeśli mają, napisz mi.
- [ ] Na tym koncie nagrywasz wszystkie filmy i jego dane podajesz we wnioskach. **Nie zakładaj nowego konta na nagraniu**, bo zobaczyłoby „Wkrótce”.
- [ ] Nigdy nie dodawaj konta recenzenta do `ADMIN_EMAILS`.
- [ ] Po zakończeniu wszystkich review usuń `REVIEWER_EMAILS` w Vercelu (albo zostaw na przyszłe review, np. odnowienie audytu YouTube co rok).

### B3. TikTok — portal i ponowny wniosek — ok. 2–3 godziny

Szczegółowy scenariusz nagrania i teksty do wklejenia: [review/tiktok.md](review/tiktok.md). Skrót tego, co tylko Ty możesz zrobić:

- [ ] https://developers.tiktok.com → **Manage apps** → Postfly.
- [ ] **URL properties**: dodaj i zweryfikuj `https://postfly.pl` (plik weryfikacyjny albo rekord DNS TXT — jeśli TikTok da plik, wyślij mi go, wrzucę do `public/`).
- [ ] **Login Kit** → Redirect URI: `https://postfly.pl/api/auth/callback/tiktok`.
- [ ] **Scopes**: tylko `user.info.basic`, `video.publish`, `user.info.stats`, `video.list`. **Usuń** `video.upload` i `user.info.profile`.
- [ ] Linki do regulaminu i polityki prywatności wskazują na `https://postfly.pl/terms` i `https://postfly.pl/privacy` (sprawdź, że się otwierają).
- [ ] Nagraj film według scenariusza (na produkcji, konto admina, angielskie napisy, bez dźwięku).
- [ ] Wyślij wniosek (**Submit for review**) z tekstami z punktu 4 w `tiktok.md`.
- [ ] Odpowiedź przychodzi zwykle w 3–14 dni. Odrzucenie → wklej mi pełny tekst uzasadnienia.

### B4. Google / YouTube — weryfikacja OAuth — ok. 2–3 godziny

Szczegóły: [review/youtube.md](review/youtube.md).

- [ ] https://search.google.com/search-console → **Dodaj usługę** → typ **Domena** → `postfly.pl` → dodaj rekord TXT w DNS → **Zweryfikuj**. Rób to tym samym kontem Google, które jest Owner/Editor projektu w Google Cloud.
- [ ] https://console.cloud.google.com → projekt Postfly → **Google Auth Platform**:
  - **Branding**: nazwa „Postfly”, logo 120×120 px, e-mail wsparcia, strona główna `https://postfly.pl`, polityka `https://postfly.pl/privacy`, regulamin `https://postfly.pl/terms`, domena autoryzowana `postfly.pl`, e-mail kontaktowy dewelopera;
  - **Clients** → klient Web → redirect URI `https://postfly.pl/api/auth/callback/youtube`;
  - **Data Access**: tylko `youtube.upload` i `youtube.readonly` (+ `openid`, `email`, `profile`), inne usuń;
  - **Audience** → **Publish app** → status **In production**.
- [ ] Nagraj film według `youtube.md` (z widocznym `client_id` w pasku adresu na ekranie zgody), wgraj na YouTube jako **Niepubliczny** (Unlisted).
- [ ] **Verification Center** → **Prepare for verification** → wklej uzasadnienia scope'ów i link do filmu → wyślij.
- [ ] Odpowiadaj na maile od zespołu weryfikacji Google (przychodzą na e-mail kontaktowy z Brandingu, często w ciągu 3–5 dni roboczych). Prośby o poprawki przekaż mi.
- [ ] **Po** zatwierdzeniu weryfikacji: wypełnij formularz audytu YouTube API (link i kroki w `youtube.md`) — bez niego limit to 10 000 jednostek dziennie, czyli ok. 6 wgrań filmów na dzień dla całej aplikacji.

### B5. Meta — kontrola panelu — 15 minut

Szczegóły: [review/meta.md](review/meta.md).

- [ ] https://developers.facebook.com/apps → Postfly → **App Mode: Live**.
- [ ] **App Review** → **Permissions and Features**: `pages_show_list`, `pages_manage_posts`, `pages_read_engagement`, `instagram_basic`, `instagram_content_publish`, `business_management` mają **Advanced access**. Jeśli któreś ma tylko Standard — nagranie A z `meta.md`.
- [ ] **Facebook Login** → **Settings** → **Valid OAuth Redirect URIs**: `https://postfly.pl/api/auth/callback/facebook` i `https://postfly.pl/api/auth/callback/instagram`.
- [ ] **Business Verification** (Ustawienia firmy → Centrum zabezpieczeń) zakończona — wymagana dla Advanced access.
- [ ] Opcjonalnie, jeśli chcesz odpowiadanie na komentarze: nagraj film B z `meta.md` na koncie recenzenta z B2 (uprawnienia do komentarzy są o nie proszone automatycznie), wyślij jedną odpowiedź na komentarz (Meta wymaga udanego testowego wywołania API), potem wniosek o `pages_manage_engagement` i `instagram_manage_comments`.

### B6. Ponowne połączenie kont FB/IG — 2 minuty

- [ ] Jeśli łączyłeś Facebooka lub Instagrama przed 30.09.2026: **Połączone konta** → rozłącz → połącz ponownie, żeby token miał aktualny zestaw uprawnień. Zrób jeden testowy post.

### B7. Forma prawna — rozmowa z księgową

**Dlaczego:** JDG Code94 jest zawieszona. W becie nie ma przychodu, więc to nie przeszkadza, ale przed pierwszą sprzedażą trzeba wiedzieć, na czym sprzedajesz. „Działalność nierejestrowana” najpewniej odpada (nie przysługuje osobie, która prowadziła JDG w ostatnich 60 miesiącach), dlatego usunąłem ją z regulaminu i polityki.

- [ ] Zapytaj księgową: koszt odwieszenia JDG przy etacie (zwykle tylko składka zdrowotna; na ryczałcie zależy od przychodu), ryczałt 12% dla SaaS, zwolnienie z VAT, faktury dla firm z UE.
- [ ] Zapytaj prawnika o zgodę na natychmiastowe świadczenie usługi (prawo odstąpienia 14 dni) — przed włączeniem płatności dodam checkbox w kasie.

---

## C. Po zatwierdzeniach platform

### C1. Odblokowanie TikToka i YouTube

- [ ] Gdy **TikTok** zatwierdzi wniosek, a YouTube jeszcze nie: w Vercelu ustaw `PLATFORMS_IN_REVIEW` = `YOUTUBE`.
- [ ] Gdy zatwierdzone są **oba**: `PLATFORMS_IN_REVIEW` = pusta wartość (dodaj zmienną z pustym polem — **nie usuwaj** jej, bo brak zmiennej oznacza domyślnie „TIKTOK,YOUTUBE”).
- [ ] Redeploy.
- [ ] Napisz mi — zaktualizuję stronę główną, FAQ i opisy planów („TikTok, YouTube wkrótce” → pełna lista).

### C2. Odblokowanie komentarzy

- [ ] Po zatwierdzeniu `pages_manage_engagement` i `instagram_manage_comments` przez Metę: w Vercelu `COMMENTS_FEATURE_ENABLED` = `1` → Redeploy. Uprawnienia trafiają wtedy automatycznie do logowania wszystkich użytkowników. Klienci, którzy połączyli Facebooka lub Instagrama wcześniej, muszą połączyć je ponownie, żeby odpowiadać na komentarze.

### C3. Osobna baza dla środowiska preview (opcjonalnie)

**Dlaczego:** wdrożenia preview (z gałęzi i PR-ów) nie migrują już bazy produkcyjnej, ale nadal z niej czytają. Osobna baza oddziela testy od danych klientów.

- [ ] https://neon.tech → nowy projekt (region **Frankfurt**), plan Free → skopiuj connection string (wersja **pooled** i **direct**).
- [ ] Vercel → zmienne tylko dla **Preview**: `DATABASE_URL` (pooled), `DIRECT_URL` (direct), `PREVIEW_RUN_MIGRATIONS` = `1`.
- [ ] Napisz mi — sprawdzę najbliższy preview.

---

## D. Gdy chcesz zacząć sprzedawać (po odwieszeniu JDG)

### D1. Odwieszenie JDG i dane firmy

- [ ] Odwieś JDG w CEIDG (online).
- [ ] Podaj mi: nazwę firmy, adres, NIP — wpiszę je do regulaminu, polityki prywatności i stopki, dodam checkbox zgody na natychmiastowe świadczenie usługi.

### D2. Wyłączenie bety

- [ ] Vercel (Production): `NEXT_PUBLIC_FREE_BETA` = `0` → Redeploy. Wracają: zakup planów, cennik do zapłaty, 7-dniowy okres próbny, teksty „7 dni PRO” na stronie i w e-mailach.
- [ ] Zgodnie z regulaminem uprzedź użytkowników bety e-mailem co najmniej 14 dni wcześniej (napisz mi, przygotuję treść i wysyłkę).

### D3. Stripe w trybie live — 15 minut

**Dlaczego:** klucze, webhook i ceny są ustawione, ale z kodu nie widzę, czy to tryb live i czy webhook wskazuje na właściwy adres. Błędny webhook oznacza, że klient zapłaci, a plan się nie zmieni.

- [ ] Stripe → przełącznik **Test mode** wyłączony (prawy górny róg).
- [ ] Konto aktywowane: **Settings** → **Business** → wszystkie dane firmy i konto bankowe do wypłat uzupełnione, brak żółtych ostrzeżeń.
- [ ] W Vercelu sprawdź (nie kopiuj wartości, tylko popatrz na początek):
  - `STRIPE_SECRET_KEY` zaczyna się od `sk_live_` (nie `sk_test_`);
  - `STRIPE_WEBHOOK_SECRET` zaczyna się od `whsec_`;
  - 6 zmiennych `STRIPE_PRICE_*` zaczyna się od `price_` i pochodzi z trybu live (w trybie live **Product catalog** → produkt → cena → ID musi się zgadzać).
  - `STRIPE_SUCCESS_URL` i `STRIPE_CANCEL_URL` to `https://postfly.pl/billing`, nie `localhost`.
- [ ] Stripe → **Developers** → **Webhooks** (tryb live):
  - endpoint: `https://postfly.pl/api/billing/webhook/stripe`;
  - zdarzenia: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`, `invoice.payment_failed`;
  - **Signing secret** tego endpointu = wartość `STRIPE_WEBHOOK_SECRET` w Vercelu (jeśli nie masz pewności: **Roll secret**, wklej nową wartość do Vercela, Redeploy).
- [ ] **Settings** → **Billing** → **Customer portal**: włączony (anulowanie i zmiana planu, faktury).
- [ ] Opcjonalnie: **Settings** → **Tax** — skonsultuj z księgową, czy i jak naliczać VAT.
- [ ] **Płatność testowa prawdziwą kartą:**
  1. Zaloguj się do Postfly na zwykłe konto (nie admina) → **Plan i płatności** → kup najtańszy plan (Starter, miesięczny).
  2. Po powrocie plan w aplikacji powinien zmienić się na Starter w ciągu kilku sekund.
  3. Stripe → **Developers** → **Webhooks** → endpoint → wszystkie zdarzenia mają status **200**.
  4. Stripe → **Payments** → ta płatność → **Refund**, a w **Subscriptions** → **Cancel subscription**.
  5. Jeśli plan się nie zmienił albo webhook ma błąd 4xx/5xx — wklej mi zrzut ekranu zdarzenia.

---

## Co sprawdzić raz w miesiącu (5 minut)

- [ ] GitHub → **Actions**: workflow `backup-database` i `uptime` mają zielone przebiegi.
- [ ] Sentry: brak nowych, nierozwiązanych błędów.
- [ ] Vercel → **Usage**: brak niespodziewanego wzrostu kosztów.
- [ ] Stripe → **Webhooks**: brak nieudanych dostaw.
- [ ] LinkedIn: tokeny wygasają po ok. 60 dniach. Sprawdź w **Połączonych kontach**, czy Twoje konto nie wymaga ponownego połączenia.

---

## Podsumowanie

| # | Zadanie | Czas | Blokuje start? |
|---|---|---|---|
| A1 | Vercel Pro | 5 min | **Tak** |
| A2 | Sentry | 10 min | **Tak** |
| A4 | Domena w Resend | 5–15 min | **Tak** |
| A4b | Skrzynka hello@postfly.pl | 10 min | **Tak** (adres w regulaminie) |
| A5 | Środki i limity w Anthropic | 10 min | **Tak** (bez tego nie działa AI) |
| B1 | Upstash Redis | 10 min | Nie |
| B2 | Konto recenzenta + `REVIEWER_EMAILS` | 10 min | Przed wnioskami TikTok/Google/Meta |
| B3 | TikTok: portal + nagranie + wniosek | 2–3 h | Nie |
| B4 | Google/YouTube: weryfikacja + nagranie | 2–3 h | Nie |
| B5 | Meta: kontrola panelu | 15 min | Nie |
| B6 | Ponowne połączenie FB/IG | 2 min | Nie |
| B7 | Księgowa i prawnik | rozmowa | Przed sprzedażą |
| C1–C3 | Odblokowania po review, baza preview | 5 min każde | Nie |
| D1–D3 | Odwieszenie JDG, wyłączenie bety, Stripe live | ok. 1 h | Przed pierwszą płatnością |

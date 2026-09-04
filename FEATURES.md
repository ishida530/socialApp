# Inwentaryzacja funkcjonalności — Postfly (FlowState)

Systematyczne przejście po `app/` i `components/`, pogrupowane per funkcjonalność użytkownika (nie per plik). Punkt wyjścia dla `UX_AUDIT.md`.

Tryb aplikacji w tym audycie: `APP_MODE=personal` (domyślny — rejestracja zamknięta po 1 koncie, brak limitów/UI billingowego w sidebarze).

## 1) Strona główna (landing page)
- Trasa: `/`
- Pliki: `app/page.tsx`, `components/landing/LandingExperience.tsx`
- Zakres: hero, kroki "jak to działa", cennik (Free/Starter/Pro/Business), FAQ, formularz kontaktowy, CTA końcowe.
- Uwaga kontekstowa: appka ma dziś być używana jednoosobowo (`APP_MODE=personal`), ale landing prezentuje pełny, wielo-najemczy produkt SaaS z cennikiem — rozjazd między trybem działania a materiałem marketingowym.

## 2) Rejestracja
- Trasa: `/register`
- Plik: `app/register/page.tsx`
- W trybie `personal`: backend odrzuca rejestrację po 1. koncie (`Rejestracja jest zamknięta w trybie personal`), ale sam formularz tego nie sygnalizuje z góry — user dowiaduje się dopiero po wypełnieniu i wysłaniu.

## 3) Logowanie
- Trasa: `/login`
- Plik: `app/login/page.tsx`
- Zakres: email/hasło, logowanie przez Google (OAuth redirect), link do rejestracji i resetu hasła.
- Zabezpieczenia: honeypot + minimalny czas wypełnienia formularza (anti-bot), rate limit logowania (10 prób / 15 min / IP).

## 4) Odzyskiwanie hasła
- Trasy: `/forgot-password`, `/reset-password`
- Pliki: `app/forgot-password/page.tsx`, `app/reset-password/page.tsx`, `app/reset-password/ResetPasswordForm.tsx`
- Zakres: podanie emaila → link resetu → ustawienie nowego hasła.

## 5) Callback logowania (OAuth)
- Trasy: `/callback`, `app/api/auth/callback/[provider]`, `app/api/auth/google/callback`
- Ekran pośredni po powrocie z Google OAuth.

## 6) Pulpit (dashboard)
- Trasa: `/dashboard`
- Pliki: `app/dashboard/page.tsx`, `components/Dashboard.tsx`, `components/OnboardingChecklist.tsx`, `components/DashboardAIAdvisor.tsx`, `components/RecentActivity.tsx`, `components/ConnectedPlatforms.tsx`
- Zakres: checklista onboardingowa "Start w 4 krokach", karty statystyk (opublikowane/w kolejce/przesłane wideo/skuteczność), alerty AI ("Alert trendu", "Optymalizacja"), sekcja "Najbliższe 24h", karty połączonych platform, tabela "Ostatnia aktywność".

## 7) Kreator posta (Post Composer)
- Wejście: globalny przycisk "Nowy post" w headerze (dostępny z każdego ekranu w panelu) — otwiera sheet, nie osobną trasę.
- Pliki: `components/GlobalPostComposerSheet.tsx`, `components/PostComposer.tsx`, `components/composer/{MediaStep,ContentPreviewStep,PlatformCaptionTab,TikTokSettingsPanel,ScheduleStep,PostStatusScreen,usePostComposerState,types}.tsx/.ts`
- Flow (zgodnie z `docs`/projektem "1 ekran = 1 decyzja"): gate (wymaga min. 1 połączonego konta) → media (upload + typ treści + tytuł) → adapting (AI dopasowuje treść per platforma, lokalnie/bez zewnętrznego API) → content review (zakładki per platforma, w tym ustawienia specyficzne dla TikToka + zgoda prawna) → schedule (kiedy i gdzie) → status (wynik).
- Upload materiału: `components/VideoUploader.tsx` — drag&drop lub wybór pliku, obsługa wideo i zdjęć, upload przez Vercel Blob (client) z fallbackiem na upload przez własny endpoint API.

## 8) Połączone konta (Social accounts)
- Trasa: `/social-accounts`
- Plik: `app/social-accounts/page.tsx`
- Zakres: karty per platforma (YouTube, TikTok, Instagram, Facebook) — status połączenia, podłączanie/rozłączanie/ponowne połączenie kont.

## 9) Biblioteka mediów (Media library)
- Trasa: `/media-library`
- Plik: `app/media-library/page.tsx`
- Zakres: upload materiału, wyszukiwanie po tytule/opisie, filtr statusu, lista przesłanych materiałów, puste stany z CTA ("Utwórz pierwszy post" / "Połącz konto społecznościowe").

## 10) Kampanie i harmonogram
- Trasy: `/campaigns`, `/schedule` (ten sam nagłówek "Kampanie i harmonogram" w Headerze; `/schedule` nie jest w głównej nawigacji bocznej)
- Pliki: `app/campaigns/page.tsx`, `app/schedule/page.tsx`, `components/schedule/SmartScheduleCard.tsx`
- Zakres: tygodniowy plan treści (kampanie), lista zadań publikacji z możliwością anulowania/ponowienia/wyzwolenia ręcznego, sugestie AI dot. harmonogramu.

## 11) Analityka
- Trasa: `/analytics`
- Plik: `app/analytics/page.tsx`
- Zakres: metryki skuteczności publikacji po platformach/czasie.

## 12) Subskrypcja (Billing)
- Trasa: `/billing`
- Plik: `app/billing/page.tsx`
- W trybie `personal`: ukryta z Sidebar (karta planu) i z menu użytkownika w Header, ale trasa `/billing` pozostaje fizycznie osiągalna pod bezpośrednim URL.

## 13) Panel administracyjny
- Trasa: `/admin/jobs`
- Plik: `app/admin/jobs/page.tsx`
- Zakres: podgląd/operacje na zadaniach publikacji na poziomie operacyjnym (nie linkowany w głównej nawigacji użytkownika).

## 14) Nawigacja globalna / powłoka aplikacji (AppShell)
- Pliki: `components/AppShell.tsx`, `components/Sidebar.tsx`, `components/Header.tsx`
- Zakres: sidebar desktop / dolna nawigacja mobile (5 pozycji: Pulpit, Kampanie, Połączone konta, Biblioteka mediów, Analityka), pasek statusu usługi ("Usługa działa"/"Problem z połączeniem"), przełącznik motywu jasny/ciemny, globalny przycisk "Nowy post", menu użytkownika (wylogowanie, w trybie commercial też Subskrypcja).

## 15) Strony prawne
- Trasy: `/privacy`, `/terms`
- Bez powłoki aplikacji (dostępne też niezalogowanym).

---

## Metodologia audytu (Faza 1)

Każdy feature powyżej został odwiedzony w prawdziwej przeglądarce (Playwright, Chromium) na koncie testowym utworzonym lokalnie (`audyt.ux@postfly.test`) z czterema podpiętymi (zamockowanymi — patrz zastrzeżenie w `UX_AUDIT.md`) kontami social. Zrzuty: desktop 1280×900 i mobile 375×812, w `tests/e2e/__screenshots__/audit/`.

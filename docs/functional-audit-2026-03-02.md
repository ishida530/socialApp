# FlowState – Audyt funkcjonalności (2026-03-02)

## Zakres
- Logowanie/rejestracja/sesja
- Dashboard i nawigacja
- Social accounts (OAuth, connect/reconnect/disconnect)
- Upload i biblioteka mediów
- Composer, drafty, harmonogram, aktywność
- Billing/subskrypcje
- Admin/analytics
- Runtime lokalny

## Wynik ogólny
Aplikacja jest funkcjonalnie **używalna jako MVP+**. Po tej iteracji domknięto cały pakiet P1 oraz kluczowe elementy P2 (lista/odtwarzanie draftów, trendy analytics i filtry czasu). Otwarte punkty mają charakter roadmapowy, a nie blokujący dla obecnego MVP.

---

## Macierz funkcjonalna

### ✅ Działa poprawnie
1. **Auth + sesja**
   - Login/register działają, sesja odczytywana przez `/api/auth/me`, logout czyści sesję.
2. **Połączenie kont social**
   - OAuth YouTube/TikTok działa przez redirect i callback.
   - Connect/reconnect/disconnect dostępne z UI.
3. **Upload + biblioteka**
   - Upload `.mp4/.mov` (walidacja typu i rozmiaru), listing, filtrowanie, usuwanie.
4. **Billing flow**
   - Checkout redirect + obsługa powrotu (`checkout=success/cancel`) + odświeżenie danych subskrypcji.
   - Webhook Stripe idempotentny i transakcyjny.
5. **Harmonogram i aktywność**
   - Server-side pagination działa dla `/api/jobs` i `/api/activity`.
   - Previous/Next działa po stronie klienta.
6. **Executor publikacji (v1)**
   - Processor wykonuje realne wywołania API platform (YouTube upload multipart, TikTok publish init z `PULL_FROM_URL`).
   - Job nie jest już oznaczany jako `SUCCESS` wyłącznie na podstawie obecności tokenu.
   - Dodano etapowe logowanie operacyjne (`job-processing-started`, `job-succeeded`, retry/fail reason).
7. **Drafty (P2)**
   - Composer obsługuje listę zapisanych szkiców i odtwarzanie szkicu do formularza.
   - Przy zapisie szkicu lista jest odświeżana, a użytkownik może kontynuować edycję z zapisanej wersji.
8. **Analytics (P2)**
   - Dodano filtr zakresu czasu (`7d/30d/90d`) i trend dzienny.
   - Widok pokazuje metryki `SUCCESS/FAILED`, `success rate` i wolumen publikacji w wybranym zakresie.

### ⚠️ Działa częściowo / z ograniczeniami
1. **Analytics**
   - Trendy i filtry czasu działają, ale metryki nadal są wewnętrzne (brak platformowych statystyk zasięg/engagement).
2. **Platform coverage**
   - Composer i publish executor produkcyjnie obsługują YouTube/TikTok; Instagram/Facebook pozostają w roadmapie.

### ❌ Luki funkcjonalne / niespójności
1. **Ograniczenia operacyjne publish (nie blokują MVP)**
   - TikTok publish opiera się na `PULL_FROM_URL`, więc źródłowy URL musi być publicznie dostępny.
   - Dla YouTube/TikTok należy utrzymać właściwe scope OAuth i proces reautoryzacji po zmianie scope.
2. **Brak end-to-end Instagram/Facebook (roadmapa)**
   - Model danych uwzględnia platformy, ale pełny OAuth + publish nie jest wdrożony produkcyjnie.

---

## Najważniejsze blokery funkcjonalne (priorytet)

### P1
1. ✅ Zrealizowane: odświeżanie tokenów i automatyczny fallback dla przypadków `invalid/expired token` w executorze publish.
2. ✅ Zrealizowane: asynchroniczne śledzenie finalnego statusu publish po stronie TikTok (po `publish init`) i aktualizacja statusu joba.
3. ✅ Zrealizowane: panel operacyjny publish (ostatnie błędy, retry reason, success rate per platform).

P1: **zamknięte**.

### P2
1. ✅ Zrealizowane: widok listy szkiców i odtwarzanie szkicu w composerze.
2. ✅ Zrealizowane: analytics rozbudowane o trendy i filtry czasu.
3. W toku decyzji produktowej: rozszerzenie obsługi o Instagram/Facebook end-to-end (OAuth + publish).

---

## Weryfikacja techniczna
- Build produkcyjny: przechodzi (`npm run build`).
- Runtime dev: serwer uruchamia się poprawnie (`next dev` gotowy).

---

## Ocena końcowa funkcjonalności
Flowy krytyczne dla MVP (auth, podłączenie kont, upload, queue, billing, admin jobs, realny publish executor v1) są obecne i działają. Obecny poziom dojrzałości to **MVP+** z domkniętym zakresem P1 i kluczowymi punktami P2. Przed pełnym skalowaniem produktu rekomendowane jest domknięcie roadmapy platformowej (Instagram/Facebook) oraz ewentualne podpięcie platformowych metryk engagement.

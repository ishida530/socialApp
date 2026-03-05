# Status Workflowu: Refaktor Backend + Frontend

Ostatnia aktualizacja: 2026-03-05 (iteracja 5)
Właściciel: Copilot (lead implementacyjny)

## Cel
Utrzymać pełną zgodność warstwy konwersyjnej frontendu z backendowym source of truth dla planów, limitów i triala.

## Legenda statusów
- TODO
- W TRAKCIE
- ZROBIONE
- ZABLOKOWANE

## Status strumieni prac

1. Kontrakt capabilities jako source of truth - ZROBIONE
- Dodano `lib/billing/capabilities.ts` na bazie `PLAN_CATALOG`, `PLAN_LIMITS`, `PLAN_FEATURES`.
- Dodano endpoint `GET /api/billing/capabilities`.
- Dodano walidację runtime kontraktu: `isValidBillingCapabilities`.

2. Synchronizacja cennika landingu z backendem - ZROBIONE
- `components/landing/LandingExperience.tsx` pobiera capabilities.
- Fallback zabezpiecza konwersję przy chwilowym błędzie requestu.
- Tabela cennika, CTA planów i claim triala są sterowane danymi z capabilities.

3. Synchronizacja widoku billing z capabilities - ZROBIONE
- `app/billing/page.tsx` używa dynamicznego triala (`capabilities.trial.days` i note eligibility).
- Usunięto hardcoded "7 dni" z kluczowego copy billingowego.

4. Synchronizacja komunikacji planów w Composerze - ZROBIONE
- `components/PostComposer.tsx` używa dynamicznego opisu planu z capabilities.
- Limity wyboru/publikacji platform są oparte o backendowe `catalog.limits.social_accounts`.

5. Wspólny klient frontendowy capabilities - ZROBIONE
- Dodano `lib/billing/capabilities-client.ts`.
- Wprowadzono wspólny fallback `FALLBACK_BILLING_CAPABILITIES`.
- Klient waliduje payload kontraktu i w razie dryfu wraca do fallbacku.

6. Quality pass copy PL - ZROBIONE
- Poprawiono diakrytykę i język w kluczowych sekcjach landingu, billingu i composera.

7. Plik zarządzania workflowem - ZROBIONE
- Ten plik jest rejestrem statusu i jest aktualizowany po każdej większej iteracji.

8. Multi-account per platform: backend + OAuth + UI - ZROBIONE
- OAuth callback nie nadpisuje już konta po samej platformie.
- Reconnect działa na konkretnym `accountId` (cookie marker + walidacja właściciela i platformy).
- Przy nowym połączeniu konto z nowym `externalId` jest dodawane jako osobny rekord (z limitem planu).
- UI `ConnectedPlatforms` obsługuje wiele kont per platformę (lista kont, reconnect/disconnect per konto, przycisk "Dodaj kolejne konto").
- `capabilities` odzwierciedla rollout: `multiAccountPerPlatformEnabled` + etykieta "w ramach limitu planu".

9. Stabilizacja zgodności pod start - ZROBIONE
- Enqueue publikacji wybiera konto social deterministycznie: ostatnio zautoryzowane (`updatedAt desc`).
- UI doprecyzowuje realne zachowanie publikacji (bez obietnic niewspieranych przez backend).

10. Redukcja duplikacji krytycznych dla zgodnosci - ZROBIONE
- Dodano wspolne typy billingowe: `lib/billing/types.ts`.
- Dodano wspolne etykiety planu/statusu: `lib/billing/labels.ts`.
- Dodano wspolny hook capabilities: `hooks/useBillingCapabilities.ts`.
- `Billing`, `PostComposer`, `Sidebar`, `Landing` korzystaja z jednego sposobu pobierania capabilities.
- Usunieto hardcoded trial `7 dni` w sidebarze; trial jest teraz oparty o capabilities.

## Ryzyka i uwagi
- Pozostaje ostrzeżenie techniczne Next.js: migracja `middleware` -> `proxy`.
- Obecny enqueue publikacji wybiera jedno konto na platformę. Kolejny etap: jawny wybór konta docelowego w composerze.

## Kolejne kroki (następna faza)
1. Utrzymać bieżący zakres funkcjonalny i skupić się na stabilizacji produkcyjnej.
2. Dodać test E2E ścieżki: connect wielu kont -> enqueue -> publikacja (bez rozszerzania funkcji).
3. Po starcie monitorować błędy OAuth/publikacji i aktualizować tylko poprawki zgodności.

## Ostatnia walidacja
- Diagnostyka: brak błędów w modyfikowanych plikach.
- Build: `npm run build` przeszedl po iteracji 5.
- Pozostało jedynie nieblokujące ostrzeżenie o deprecacji `middleware`.

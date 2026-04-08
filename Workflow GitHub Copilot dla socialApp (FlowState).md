# Workflow GitHub Copilot dla socialApp (FlowState)
**Autor:** Manus AI  
**Data:** 2026-04-08  

Ten dokument zawiera zestaw gotowych instrukcji i promptów dla GitHub Copilot, które pomogą Ci wdrożyć rekomendacje z audytu UX/UI i funkcjonalnego. Workflow został podzielony na trzy kluczowe zadania.

---

## Zadanie 1: Wybór konta w PostComposer
**Cel:** Umożliwienie użytkownikowi wyboru konkretnego konta społecznościowego, jeśli ma podłączonych więcej niż jedno na danej platformie.

### Prompt dla Copilot Chat:
> "W pliku `components/PostComposer.tsx` zmień logikę wyboru konta do publikacji. Obecnie aplikacja wybiera 'ostatnio podłączone' konto dla danej platformy. 
> 
> 1. Dodaj stan `selectedSocialAccountId` dla każdej platformy w `campaignContent`.
> 2. W kroku 'media' lub 'content', jeśli dla wybranej platformy (`selectedPlatform`) istnieje więcej niż jedno konto w `accountsResponse`, wyświetl selektor (np. `Select` z shadcn/ui), który pozwoli użytkownikowi wybrać konkretne konto (handle).
> 3. Zaktualizuj funkcję `submitCampaign`, aby wysyłała `socialAccountId` do API `/publish-jobs/enqueue` zamiast polegać na domyślnym wyborze serwera."

---

## Zadanie 2: Wizualizacja limitów w Sidebarze
**Cel:** Poprawa widoczności limitów planu, aby użytkownik wiedział, ile zasobów mu pozostało bez wchodzenia w ustawienia bilingowe.

### Prompt dla Copilot Chat:
> "Zmodyfikuj `components/Sidebar.tsx`, aby lepiej prezentował limity planu użytkownika.
> 
> 1. Rozszerz zapytanie do `/billing/subscription`, aby pobierało również limit `publish_jobs`.
> 2. Dodaj drugi pasek postępu (Progress bar) pod obecnym paskiem wideo, który będzie pokazywał zużycie 'Zaplanowanych postów' w bieżącym miesiącu.
> 3. Jeśli użytkownik zbliża się do limitu (np. > 90%), zmień kolor paska na `destructive` (czerwony) i dodaj małą ikonę ostrzeżenia obok etykiety.
> 4. Upewnij się, że etykiety są czytelne: 'Wideo: X/Y', 'Posty: A/B'."

---

## Zadanie 3: Automatyczne odświeżanie tokenów (Backend)
**Cel:** Zminimalizowanie błędów publikacji spowodowanych wygaśnięciem tokenów OAuth.

### Prompt dla Copilot Chat:
> "W pliku `lib/server/social-oauth.ts` oraz w nowym pliku crona (np. `app/api/cron/refresh-tokens/route.ts`) zaimplementuj mechanizm masowego odświeżania tokenów.
> 
> 1. Stwórz funkcję `refreshAllExpiringTokens`, która wyszuka w bazie `SocialAccount` wszystkie konta, których `expiresAt` jest mniejsze niż 'teraz + 24h'.
> 2. Dla każdego znalezionego konta wywołaj istniejącą funkcję `refreshSocialAccessToken`.
> 3. Dodaj logowanie (observability) sukcesów i porażek odświeżania.
> 4. Przygotuj endpoint API (GET), który będzie chroniony przez `CRON_SECRET` i będzie uruchamiał tę funkcję."

---

## Jak korzystać z tego workflow?

| Krok | Działanie |
| :--- | :--- |
| **1. Konfiguracja** | Upewnij się, że plik `.github/copilot-instructions.md` znajduje się w Twoim repozytorium. Copilot automatycznie odczyta te zasady. |
| **2. Kontekst** | Otwórz plik, który chcesz edytować (np. `PostComposer.tsx`), aby Copilot miał go w aktywnym kontekście. |
| **3. Prompt** | Skopiuj wybrany prompt z tego dokumentu i wklej go do okna Copilot Chat (`Cmd+I` lub `Ctrl+I` w VS Code). |
| **4. Review** | Przejrzyj zaproponowane zmiany. Copilot powinien trzymać się polskiego nazewnictwa i Twoich standardów kodowania. |

---
*Workflow przygotowany przez Manus AI dla projektu FlowState.*

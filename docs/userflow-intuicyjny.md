# Intuicyjny user flow (FlowState)

## Cel
Skrócić drogę użytkownika od pierwszego logowania do pierwszej zaplanowanej publikacji.

## Docelowy flow
1. Logowanie/Rejestracja
2. Dashboard z checklistą onboardingową
3. Połączenie pierwszego konta social
4. Dodanie pierwszego materiału wideo
5. Wygenerowanie pierwszego szkicu treści
6. Zaplanowanie kampanii
7. Monitoring statusu publikacji

## Zadania wdrożeniowe

### 1) Onboarding checklist na dashboardzie
- [x] Pokazać 4 kroki: konto, media, szkic, harmonogram
- [x] Oznaczać krok jako ukończony na podstawie danych API
- [x] Pokazać CTA do pierwszego nieukończonego kroku

### 2) Spójność językowa UI (PL)
- [x] Zamienić etykietę `Reconnect` na `Połącz ponownie`
- [x] Ujednolicić nazwy kroków composera na język polski
- [x] Ujednolicić wybrane etykiety analityki

### 3) Kontrola jakości
- [x] Sprawdzić błędy TypeScript/React po zmianach

## KPI po wdrożeniu
- Czas do pierwszego zaplanowania publikacji
- Odsetek użytkowników kończących checklistę
- Drop-off na każdym kroku checklisty
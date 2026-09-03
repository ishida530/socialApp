# Wdrozenie harmonogramu na Vercel Hobby (Free)

## Cel
Zapewnic regularne przetwarzanie kolejki publikacji mimo ograniczen Vercel Hobby.

## Dlaczego to potrzebne
- Na Vercel Hobby natywny Cron moze dzialac tylko raz dziennie.
- Wywolanie moze nastapic w dowolnej minucie danej godziny (brak dokladnosci minutowej).
- Brak automatycznego retry po nieudanym wywolaniu cron.

## Architektura docelowa
- Glowny scheduler: zewnetrzny cron (np. cron-job.org lub GitHub Actions) co 5 minut.
- Endpoint wykonawczy: /api/cron/publish?batch=20
- Endpoint odswiezania tokenow: /api/cron/refresh-tokens?hours=24
- Autoryzacja: Authorization: Bearer <CRON_SECRET>
- Fallback: Vercel Cron 1x dziennie (awaryjne odblokowanie kolejki).

## Krok 1. Ustaw zmienna CRON_SECRET
1. Vercel Dashboard -> Project -> Settings -> Environment Variables.
2. Dodaj zmienna: CRON_SECRET.
3. Ustaw losowa wartosc min. 16 znakow.
4. Zdeployuj aplikacje ponownie, jesli wymagane.

## Krok 2. Potwierdz zabezpieczenie endpointu
Endpoint musi porownywac naglowek Authorization z CRON_SECRET.
Aktualna implementacja jest w app/api/cron/publish/route.ts.

## Krok 3. Skonfiguruj zewnetrzny scheduler (cron-job.org)
- Method: GET
- URL: https://TWOJA_DOMENA/api/cron/publish?batch=20
- Header:
  - Name: Authorization
  - Value: Bearer TWOJ_CRON_SECRET
- Schedule: Every 5 minutes
- Timeout: 30-60s

Dodaj drugi scheduler dla tokenow OAuth:
- Method: GET
- URL: https://TWOJA_DOMENA/api/cron/refresh-tokens?hours=24
- Header:
  - Name: Authorization
  - Value: Bearer TWOJ_CRON_SECRET
- Schedule: Every 6 hours
- Timeout: 30-60s

## Krok 4. Zostaw Vercel Cron jako fallback
W vercel.json zostaw 1 wywolanie dziennie dla obu endpointow.
Przyklad:
- path: /api/cron/publish
- schedule: 0 3 * * *
- path: /api/cron/refresh-tokens
- schedule: 0 4 * * *

## Krok 5. Test end-to-end
1. Dodaj testowy film do publikacji (publishNow = true).
2. Sprawdz status po 1-2 przebiegach zewnetrznego cron.
3. Oczekiwane: status zmienia sie z PENDING/W KOLEJCE na SUCCESS albo FAILED.
4. Przetestuj endpoint odswiezania tokenow:
  - curl -H "Authorization: Bearer TWOJ_CRON_SECRET" https://TWOJA_DOMENA/api/cron/refresh-tokens?hours=24
  - Oczekiwane: JSON z ok: true oraz summary.scanned/refreshed/failed.

## Krok 6. Monitoring operacyjny
Codziennie sprawdzaj:
- Czy endpoint /api/cron/publish zwraca ok: true.
- Czy endpoint /api/cron/refresh-tokens zwraca ok: true.
- Czy liczba jobow PENDING starszych niz 30 minut nie rosnie.
- Czy pojawiaja sie job-failed-final i jaka jest przyczyna.
- Czy w logach sa eventy [oauth-refresh] token-refreshed / token-refresh-failed.

## Troubleshooting
- 401 Unauthorized: niepoprawny CRON_SECRET lub brak naglowka Authorization.
- Brak zmian statusu: scheduler nie wywoluje endpointu albo jest zly URL.
- Duplikaty: scheduler uruchamiany zbyt czesto lub wielokrotnie, dodaj lock/idempotencje.
- refresh-tokens: failed > 0: sprawdz czy konta maja poprawne refresh tokeny i czy provider OAuth nie zwrocil revoke/invalid_grant.

## Rekomendowane ustawienia startowe
- Czestotliwosc: co 5 min
- batch: 20
- refresh-tokens: co 6h, hours=24
- Retry po stronie scheduler: wlaczone (1-2 proby)
- Alert: brak udanego wywolania przez >15 min

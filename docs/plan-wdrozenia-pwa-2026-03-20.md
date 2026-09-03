# Plan wdrozenia PWA dla FlowState

Ostatnia aktualizacja: 2026-03-20  
Wlasciciel: Copilot (propozycja techniczno-produktowa)

## 1) Decyzja: czy warto?

Krotka odpowiedz: **tak, ale jako lekkie PWA (install + performance + odpornosc), bez pelnego offline-first dla dashboardu.**

## 2) Kontekst aplikacji (co widzimy w repo)

- Aplikacja to Next.js App Router z duza liczba tras autoryzowanych (`/dashboard`, `/analytics`, `/billing`, `/campaigns`, `/media-library`, `/schedule`, `/social-accounts`, `/admin`).
- Duzo danych jest dynamicznych i pochodzi z API routes (`/api/...`), z OAuth i platnosciami Stripe.
- Istnieje upload duzych plikow (do 500 MB) przez Vercel Blob.
- Obecnie brak konfiguracji PWA (brak service workera, brak manifestu PWA, brak warstwy instalacyjnej).

Wniosek: architektura sprzyja PWA typu "app shell + online data", ale **nie** pelnemu cache danych prywatnych offline.

## 3) Ocena biznesowa (wartosc vs koszt)

### Potencjalna wartosc

- Instalowalnosc na mobile/desktop moze zwiekszyc retencje i powroty do panelu.
- Lepsze odczucie szybkosci dzieki cache statycznych assetow.
- Lepsze UX przy chwilowych problemach sieciowych (fallback UI zamiast pustego widoku).
- Fundament pod push notyfikacje (status publikacji, bledy jobow, alerty billingowe).

### Ryzyka i koszt utrzymania

- Bledna strategia cache moze pokazac nieaktualne dane finansowe/analityczne.
- Service worker moze kolidowac z uploadami oraz callbackami OAuth, jesli ruch zostanie zbyt agresywnie przechwycony.
- Po deployach potrzebna jest kontrola wersji SW i procedura invalidacji cache.

### Rekomendacja

- **Warto wdrozyc etap 1 i 2** (niski koszt, dobry zwrot).
- **Etap 3 i 4** realizowac dopiero po pomiarach adopcji i retencji.

## 4) Proponowany zakres wdrozenia (etapowy)

## Etap 1: Fundament PWA (1-2 dni)

Cel: instalowalnosc i poprawna tozsamosc aplikacji.

- Dodac manifest PWA (`name`, `short_name`, `icons`, `start_url`, `display`, `theme_color`, `background_color`).
- Przygotowac zestaw ikon (min. 192x192 i 512x512).
- Dodac metadane instalacyjne w layoucie.
- Potwierdzic poprawny start URL i zachowanie po uruchomieniu z ikony.

Kryterium akceptacji:

- Chrome/Edge pokazuje opcje instalacji.
- Aplikacja uruchamia sie jako "installed app" na desktop i Android.

## Etap 2: Bezpieczny service worker (2-3 dni)

Cel: szybszy start i odpornosc bez ryzyka dla danych prywatnych.

Strategia:

- Cache tylko zasobow statycznych (`_next/static`, fonty, grafiki brandingowe).
- Dla nawigacji: fallback do shella tylko dla publicznych i niskiego ryzyka tras.
- API routes (`/api/**`): **network-only** lub bardzo krotki stale-while-revalidate tylko dla niekrytycznych endpointow publicznych.
- Upload i multimedia:
  - `POST` uploady i blob endpointy: zawsze **network-only**, bez buforowania.
  - Strumienie mediow i duze pliki: bez przechwytywania przez cache runtime.
- OAuth callbacki i Stripe callbacki: bez cache i bez fallbackow.

Kryterium akceptacji:

- Lighthouse PWA przechodzi dla glownej sciezki publicznej.
- Brak regresji uploadu i logowania OAuth.

## Etap 3: UX offline/light resilience (1-2 dni)

Cel: kontrolowana obsluga chwilowego braku sieci.

- Dodac dedykowany ekran offline dla czesci publicznej i prostych widokow.
- Dla dashboardu: komunikat "brak polaczenia" + retry, bez prezentowania niepewnych danych z cache.
- Dodac banner stalego statusu sieci online/offline.

Kryterium akceptacji:

- Uzytkownik dostaje czytelny komunikat, a nie blad techniczny.

## Etap 4: Push notifications (opcjonalnie, 3-5 dni)

Cel: zwiekszenie powrotow i szybkiej reakcji.

- Powiadomienia: status publikacji, bledy publikacji, zblizajace sie limity planu.
- Wymagane: zgody uzytkownika, segmentacja, limity czestotliwosci.

Kryterium akceptacji:

- Mierzalny uplift CTR i powrotow po notyfikacjach.

## 5) Co cache'owac, a czego nie

Cache TAK:

- Assety statyczne aplikacji i branding.
- Publiczne strony marketingowe o niskiej zmiennosci.

Cache NIE (lub bardzo ostroznie):

- Dane billingowe, analityczne i kampanijne w panelu.
- Endpointy autoryzacji i callbacki.
- Uploady plikow i endpointy zwiazane z przesylaniem mediow.

## 6) Metryki sukcesu (po wdrozeniu)

- Install rate (uzytkownicy, ktorzy zainstalowali appke).
- Return rate 7/30 dni dla grupy zainstalowanej vs web-only.
- Time to interactive / LCP dla glownej sciezki.
- Bledy zwiazane z SW (w tym stale assets po deployu).
- Regresje kluczowych flow: login, OAuth, upload, checkout.

## 7) Ryzyka specyficzne i zabezpieczenia

- Ryzyko nieaktualnych danych po cache:
  - Mitigacja: network-first dla dashboard/API, krotkie TTL tylko tam, gdzie bezpieczne.
- Ryzyko problemow po deployu nowej wersji:
  - Mitigacja: versioning cache i aktywna procedura update SW.
- Ryzyko konfliktu z uploadami duzych mediow:
  - Mitigacja: jawne wykluczenie upload endpointow z runtime cache.

## 8) Proponowana kolejnosc techniczna dla tego repo

1. Dodac manifest i ikony, podlaczyc metadane w App Router.
2. Dodac service worker ze strategia minimal-risk (asset-only + network-first API).
3. Dodac offline page/fallback tylko dla publicznych tras.
4. Przeprowadzic testy scenariuszy krytycznych:
   - logowanie i wylogowanie,
   - OAuth callback platform,
   - upload media,
   - checkout i powrot po platnosci,
   - cron/job monitorowanie (bez zmian funkcjonalnych).
5. Wlaczyc pomiary i podjac decyzje o push po 2-4 tygodniach danych.

## 9) Finalna rekomendacja

- **Tak, warto wdrozyc PWA**, bo potencjalny zysk UX i retencji jest realny.
- **Nie warto** od razu budowac pelnego offline dashboardu.
- Najlepszy kompromis: **lekki, bezpieczny rollout 2-etapowy** (instalowalnosc + kontrolowany cache statyczny), a potem decyzja na bazie metryk.

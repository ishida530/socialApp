# Review platform: plan i instrukcje

Każda platforma ma swój plik: co ustawić w panelu, co nagrać (scena po scenie, z angielskimi napisami) i jak wysłać wniosek.

| Platforma | Plik | Czy trzeba nagrywać? |
|---|---|---|
| TikTok (Content Posting API, Direct Post) | [tiktok.md](tiktok.md) | **Tak.** Poprzedni wniosek odrzucono (ref. `20260913074631`), interfejs jest już poprawiony |
| YouTube (Google) | [youtube.md](youtube.md) | **Tak.** Weryfikacja OAuth, potem audyt YouTube API |
| Facebook + Instagram (Meta) | [meta.md](meta.md) | Publikacja: **raczej nie** (uprawnienia już zatwierdzone, najpierw sprawdź). Odpowiedzi na komentarze: **tak**, jeśli chcesz tę funkcję |

Wymagania sprawdzone w oficjalnej dokumentacji **1.10.2026**, instrukcje zaktualizowane **3.10.2026** (konta recenzentów, opisy AI, pytania o dane).

---

## Etap 1. Zanim cokolwiek nagrasz (ok. 1 godzina)

Kolejność ma znaczenie. Każdy krok jest opisany szczegółowo w [../do-zrobienia-osobiscie.md](../do-zrobienia-osobiscie.md).

- [ ] **1. Konto Anthropic (krok A5): doładuj środki, włącz Auto-reload.** Bez tego opis posta to tylko Twoja notatka, a kreator pokazuje komunikat „Generator AI jest chwilowo niedostępny”. Recenzent zobaczyłby to na filmie.
- [ ] **2. Domena e-mail w Resend (krok A4).** Konto recenzenta musi potwierdzić adres linkiem z e-maila. Bez zweryfikowanej domeny e-mail może nie dojść.
- [ ] **3. Konto recenzenta (krok B2):**
  1. Wybierz adres, np. `twojemail+review@gmail.com`.
  2. Vercel → Settings → Environment Variables → `REVIEWER_EMAILS` = ten adres (Production) → Redeploy.
  3. Załóż konto na `https://postfly.pl/register`, **kliknij link w e-mailu**, zapisz hasło.
  4. To konto widzi TikToka, YouTube i odpowiedzi na komentarze mimo trwającego review, ma pełny plan na cały czas review i nie ma dostępu do panelu administratora. **Nie dodawaj go do `ADMIN_EMAILS`.**
- [ ] **4. Test generalny na koncie recenzenta** (10 minut, bez nagrywania):
  - **Połączone konta**: TikTok i YouTube **nie** mają plakietki „Wkrótce”;
  - nowy post ze zdjęciem: opis dotyczy tego, co widać na zdjęciu (AI działa), a **„Wygeneruj ponownie”** daje inną wersję;
  - na górze **nie ma** żółtego baneru „Potwierdź adres e-mail”.

  Jeśli coś się nie zgadza, napisz mi przed nagrywaniem.
- [ ] **5. Wstrzymaj duże zmiany w aplikacji do czasu decyzji platform**, w tym PR #142 od Dependabota (44 aktualizacje). Recenzenci testują produkcję i powinna działać dokładnie tak jak na filmie.

Vercel Pro, Sentry i Stripe live (kroki A1–A3) są potrzebne do płatnego startu, ale nie blokują nagrań.

## Etap 2. Materiały i konta do nagrań (raz, dla wszystkich platform)

- **Konto recenzenta Postfly** z etapu 1. Na nim nagrywasz wszystkie filmy i jego dane podajesz we wnioskach. Nie zakładaj nowego konta na nagraniu, bo zobaczyłoby TikToka i YouTube jako „Wkrótce”.
- Krótki, **pionowy film** (5–20 s) i jedno **zdjęcie**, oba własne, bez cudzej muzyki i znaków wodnych. Do każdego przygotuj jednozdaniową notatkę, np. „nowy kolor elewacji po remoncie, efekt po 2 dniach pracy”.
- Konta na platformach:
  - prywatne konto TikTok;
  - kanał YouTube z co najmniej jednym wcześniejszym filmem (żeby ekran „Rozwój” miał dane);
  - Strona na Facebooku z podłączonym kontem Instagram (firmowym lub twórcy);
  - do nagrania komentarzy Mety: drugie konto Facebook/Instagram, z którego dodasz komentarz.

## Etap 3. Kolejność nagrań i wniosków

1. **TikTok** ([tiktok.md](tiktok.md)): najdłuższe review (do 2–6 tygodni), więc wysyłasz go pierwszy.
2. **Google / YouTube** ([youtube.md](youtube.md)): weryfikacja OAuth, a po jej zatwierdzeniu audyt YouTube API.
3. **Meta** ([meta.md](meta.md)): najpierw sprawdzenie panelu. Nagrania tylko dla brakujących uprawnień albo dla komentarzy.

Wnioski mogą trwać równolegle. Po każdej decyzji wklej mi treść odpowiedzi: przy odrzuceniu poprawię to, co wskażą, a po zatwierdzeniu przełączymy zmienne z etapu 4.

## Etap 4. Po zatwierdzeniu

| Zatwierdzone | Co ustawić w Vercelu (Production), potem Redeploy |
|---|---|
| tylko TikTok | `PLATFORMS_IN_REVIEW` = `YOUTUBE` |
| tylko YouTube | `PLATFORMS_IN_REVIEW` = `TIKTOK` |
| TikTok i YouTube | `PLATFORMS_IN_REVIEW` = pusta wartość (**nie usuwaj zmiennej**, brak zmiennej oznacza „TIKTOK,YOUTUBE”) |
| komentarze w Mecie | `COMMENTS_FEATURE_ENABLED` = `1` |

Potem napisz mi: zaktualizuję teksty na stronie głównej, w FAQ i cenniku („TikTok, YouTube wkrótce”).

**Po zatwierdzeniu nie zmieniaj** uprawnień (scope'ów), nazwy, logo ani domeny aplikacji w panelach platform: to wymaga ponownego review. Zwykłe zmiany w kodzie są w porządku, o ile ekrany publikacji nadal spełniają wytyczne (pilnują tego testy).

---

## Zasady wspólne dla wszystkich nagrań

1. **Nagrywaj na produkcji: `https://postfly.pl`.** Domena na filmie musi być taka sama jak adres strony podany we wniosku.
2. **1080p**, przeglądarka na pełnym ekranie, **większy kursor myszy** (Windows: Ustawienia → Ułatwienia dostępu → Wskaźnik myszy).
3. **Bez dźwięku.** Meta i TikTok nie słuchają audio, a ścieżka z dźwiękiem z otoczenia tylko przeszkadza.
4. **Angielskie napisy na każdej scenie.** Interfejs jest po polsku, a Meta i Google wprost tego wymagają. Gotowe teksty są w kolumnie „Napis (EN)” w każdym pliku. Wklej je w edytorze wideo (CapCut, Clipchamp itp.).
5. **Każdy ważny element trzymaj na ekranie 2–3 sekundy.** Nie przyspieszaj filmu.
6. **Zero błędów na nagraniu.** Jeśli coś pójdzie źle, nagraj tę część od nowa.
7. **Opis od AI to propozycja: pokaż to.** Na każdym nagraniu popraw ręcznie choć jedno słowo albo hashtag. Platformy wymagają, żeby użytkownik kontrolował treść przed publikacją.
8. **Przed każdą sesją nagrań szybki test AI**: nowy post, a opis powinien dotyczyć Twojego materiału. Jeśli widzisz „Generator AI jest chwilowo niedostępny”, sprawdź saldo w console.anthropic.com.
9. Nagrywaj **własne** materiały: własny film lub zdjęcie, bez cudzej muzyki i bez znaków wodnych.
10. Narzędzia: OBS Studio (darmowe) albo Xbox Game Bar (`Win + Alt + R`). Montaż i napisy: Clipchamp (wbudowany w Windows) lub CapCut.

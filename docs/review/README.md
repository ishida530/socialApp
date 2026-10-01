# Review platform: instrukcje

Każda platforma ma swój plik: co nagrać (scena po scenie, z angielskimi napisami) i jak zgłosić review.

| Platforma | Plik | Czy trzeba nagrywać? |
|---|---|---|
| TikTok (Content Posting API, Direct Post) | [tiktok.md](tiktok.md) | **Tak.** Poprzedni wniosek odrzucono (ref. `20260913074631`), interfejs jest już poprawiony |
| Facebook + Instagram (Meta) | [meta.md](meta.md) | Publikacja: **raczej nie** (uprawnienia już zatwierdzone, najpierw sprawdź). Odpowiedzi na komentarze: **tak**, jeśli chcesz tę funkcję |
| YouTube (Google) | [youtube.md](youtube.md) | **Tak.** Weryfikacja OAuth, potem audyt YouTube API |

Wymagania sprawdzone w oficjalnej dokumentacji **1.10.2026**. Interfejs Postfly jest z nimi zgodny od PR #120–#124.

## Zasady wspólne dla wszystkich nagrań

1. **Nagrywaj na produkcji: `https://postfly.pl`.** Domena na filmie musi być taka sama jak adres strony podany we wniosku.
2. **1080p**, przeglądarka na pełnym ekranie, **większy kursor myszy** (Windows: Ustawienia → Ułatwienia dostępu → Wskaźnik myszy).
3. **Bez dźwięku.** Meta i TikTok nie słuchają audio, a ścieżka z dźwiękiem z otoczenia tylko przeszkadza.
4. **Angielskie napisy na każdej scenie.** Interfejs jest po polsku, a Meta i Google wprost tego wymagają. Gotowe teksty są w kolumnie „Napis (EN)” w każdym pliku. Wklej je w edytorze wideo (CapCut, Clipchamp itp.).
5. **Każdy ważny element trzymaj na ekranie 2–3 sekundy.** Nie przyspieszaj filmu.
6. **Zero błędów na nagraniu.** Jeśli coś pójdzie źle, nagraj tę część od nowa.
7. Nagrywaj **własne** materiały: własny film lub zdjęcie, bez cudzej muzyki i bez znaków wodnych.
8. Narzędzia: OBS Studio (darmowe) albo Xbox Game Bar (`Win + Alt + R`). Montaż i napisy: Clipchamp (wbudowany w Windows) lub CapCut.

## Przygotuj raz, przed wszystkimi nagraniami

- **Testowe konto Postfly** (e-mail i hasło) dla recenzentów, którzy chcą sami przetestować aplikację. Załóż je na `https://postfly.pl/register` i zapisz dane logowania.
- Krótki, **pionowy film** (5–20 s) i jedno **zdjęcie**, oba własne.
- Konta testowe na platformach:
  - prywatne konto TikTok;
  - Strona na Facebooku z podłączonym kontem Instagram (firmowym lub twórcy);
  - kanał YouTube.

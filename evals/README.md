# Ewaluacja opisów AI

Zestaw do sprawdzania jakości opisów postów generowanych przez AI (`lib/server/smart-autopilot/ai-content.ts`).
Uruchamiaj go **przed każdą zmianą promptu albo modelu** i porównuj wynik z poprzednim raportem.

## Uruchomienie

```bash
# wymaga ANTHROPIC_API_KEY w środowisku (np. z .env)
npm run eval:captions

# porównanie modeli
EVAL_MODELS=claude-sonnet-5,claude-sonnet-5-5 npm run eval:captions

# jeden przypadek
EVAL_CASE=salon-nowa-usluga npm run eval:captions
```

Koszt: kilka centów USD za przypadek i model (generowanie + ocena), czyli ok. 1 USD za pełny przebieg 20 przypadków na jednym modelu.

## Co jest sprawdzane

**Twarde reguły (w kodzie)** — przypadek nie przechodzi, jeśli którakolwiek nie jest spełniona:
- opis niepusty i w limicie znaków platformy,
- brak wycieku tokenów maskowania (`[[TEL_1]]`, `[redacted-…]`),
- 1–8 hashtagów, tytuł dla YouTube,
- brak zakazanych fraz z dawnych szablonów („Krótka aktualizacja”, „Hook w 1 sekundzie” …),
- brak słów zakazanych dla przypadku (np. obietnice zdrowotne w teście prompt injection).

**Ocena przez model-sędziego (1–5)**: konkretność, brak zmyśleń, dopasowanie do platformy, ton, język.
Dodatkowo raport pokazuje pokrycie faktów z notatki (ceny, daty, nazwy).

Próg: średnia ocena ≥ `EVAL_MIN_SCORE` (domyślnie 3.5). Raport w Markdown trafia do `evals/results/` (poza repozytorium).

## Zmienne

| Zmienna | Domyślnie | Opis |
|---|---|---|
| `EVAL_MODELS` | model z `ANTHROPIC_CONTENT_MODEL` / `claude-sonnet-5` | lista modeli do porównania, po przecinku |
| `EVAL_JUDGE_MODEL` | `claude-sonnet-5` | model oceniający |
| `EVAL_MIN_SCORE` | `3.5` | minimalna średnia ocena |
| `EVAL_CASE` | — | uruchom tylko jeden przypadek |

## Dodawanie przypadków

Dopisz obiekt do `captions.dataset.json`: `note` (notatka użytkownika), `accountContext` (opis konta), opcjonalnie
`communicationStyle`, `platforms`, `facts` (fakty, które powinny się pojawić) i `forbidden` (słowa, które nie mogą się pojawić).
Opcjonalne `imageUrl` (publiczny adres https zdjęcia) testuje opisy na podstawie obrazu.
Najlepsze przypadki to prawdziwe notatki klientów, po usunięciu danych osobowych.

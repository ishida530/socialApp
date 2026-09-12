# Postfly — log błędów

> Każdy znaleziony błąd (podczas realizacji zadania, zgłoszony przez QA albo zauważony ręcznie) trafia tu jako osobny wpis **zanim** ktokolwiek go naprawi — zgodnie z `docs/postfly-plan-wykonania.md`, sekcja 3.7.
>
> Twarda zasada: żaden hotfix nie leci commitem, dopóki nie istnieje test, który najpierw czerwono potwierdza błąd. Kolejność zawsze: (1) wpis tutaj, (2) test odtwarzający błąd — uruchomiony i potwierdzony jako failujący, (3) poprawka kodu, (4) ten sam test ponownie — zielony, (5) jeden commit/PR z testem i poprawką razem, z ID błędu w opisie (`fix(scope): opis (BUG-NNN)`).

## Szablon wpisu

```
## BUG-NNN
Zgłoszony: data
Kontekst: przy jakim zadaniu/akcji wykryty
Opis: co się dzieje, czego się oczekiwało
Kroki reprodukcji: 1, 2, 3...
Status: [ ] test napisany (czerwony) → [ ] poprawka wdrożona (test zielony) → [ ] zamknięty (PR #...)
```

---

Brak zgłoszonych błędów.

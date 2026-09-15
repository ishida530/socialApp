Zadanie: brak aktywnego zadania
Rola: -
Aktualny krok: **EPIC 10 Faza 2 zamknięta, zmergowana i wdrożona (PR #103), po ankiecie decyzyjnej z właścicielem (PR #102).** `/schedule` (najgorszy wynik audytu UX) - planer kampanii AI + optymalizator zadań rozdzielone na dwie niezależne, domyślnie zwinięte sekcje, ZA feature flagą `new-schedule-ui` (domyślnie wyłączona) - jedyna zmiana EPIC 10 użyta za flagą, bo to najbardziej krytyczny ekran appki. Właściciel włącza ją sam, kiedy chce przejrzeć, zanim stanie się domyślna.
Wyniki ankiety decyzyjnej (4 pytania): priorytet = EPIC 10 Faza 2; procesor płatności EPIC 5 = Stripe Connect (kierunek, nie implementacja); marka = Postfly jako SaaS firmy code94.pl właściciela; ciągłość działania = lista techniczna spisana (`docs/ciaglosc-dzialania.md`).
Chronologicznie wcześniej (2026-09-15): EPIC 10 Faza 1 (`/account` akordeon, `/community` schowane formularze, błąd WCAG AA naprawiony, PR #98), 2FA - kod QR + pobieranie kodów zapasowych (PR #100, #101), EPIC 9 (2FA + audit log, PR #96).
Świadomie NIE zrobione: `/terms`/`/privacy` NIE zaktualizowane o code94.pl jako Usługodawcę - działalność gospodarcza właściciela (NIP 7394015517) jest dziś ZAWIESZONA, nazwanie jej aktywnym sprzedawcą byłoby prawnie nieprawdziwe. Wraca po wznowieniu działalności (decyzja/działanie właściciela + księgowego). Stripe Connect (implementacja) - kierunek zdecydowany, kod nie napisany, priorytetem tej tury było `/schedule`.
Zidentyfikowane, ale NIE zrobione: Dashboard/GrowthPanel/media-library nadal poza zakresem EPIC 10 (średni priorytet audytu). Prawdziwy bento-grid nadal nie istnieje.
Następne w kolejce: właściciel przegląda `/schedule` za flagą i decyduje o włączeniu domyślnie; potem Dashboard/GrowthPanel/media-library albo Stripe Connect (zależnie od tego, co się wydarzy pierwsze - wznowienie działalności czy czas na kolejną turę UX).
Plik(i) w edycji: -
Rozpoczęto krok: -
Ostatnia aktualizacja: 18:30 (2026-09-15) — PR #103 zmergowany, wdrożenie produkcyjne potwierdzone (postfly.pl/schedule zwraca 200).

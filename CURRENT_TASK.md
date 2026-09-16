Zadanie: brak aktywnego zadania
Rola: -
Aktualny krok: **Dwie poprawki na prośbę właściciela zamknięte, zmergowane i wdrożone (PR #105).** 2FA "zapamiętaj to urządzenie" (30 dni, osobne ciasteczko, nigdy nie zastępuje hasła, checkbox domyślnie zaznaczony na `/login`, "Zapomnij zapamiętane urządzenia" na `/account`) + brakujący wpis "Harmonogram" (`/schedule`) w `components/Sidebar.tsx`.
Chronologicznie wcześniej (2026-09-15): ankieta decyzyjna (priorytet/Stripe Connect/marka code94.pl/ciągłość działania, PR #102) + EPIC 10 Faza 2 (`/schedule` za feature flagą, PR #103), kod QR + pobieranie kodów zapasowych 2FA (PR #100, #101), EPIC 10 Faza 1 (PR #98), EPIC 9 (2FA + audit log, PR #96).
Świadomie NIE zrobione: `/terms`/`/privacy` nadal NIE nazywają code94.pl Usługodawcą - działalność wciąż zawieszona. Stripe Connect (implementacja) - kierunek zdecydowany, kod nie napisany.
Zidentyfikowane, ale NIE zrobione: Dashboard/GrowthPanel/media-library nadal poza zakresem EPIC 10. Lista dostępów w trybie zaufanych urządzeń nie ma jeszcze widoku "które konkretnie urządzenie" (tylko zbiorcze "zapomnij wszystkie") - świadomie uproszczone, wystarczające na tę skalę appki.
Następne w kolejce: brak zgłoszonego - czeka na kolejną prośbę właściciela. Otwarte z wcześniej: EPIC 10 pozostałe strony, Stripe Connect, przegląd prawny.
Plik(i) w edycji: -
Rozpoczęto krok: -
Ostatnia aktualizacja: 05:40 (2026-09-16) — PR #105 zmergowany, wdrożenie produkcyjne potwierdzone (postfly.pl/dashboard zawiera link "Harmonogram", /login zawiera checkbox "Zapamiętaj to urządzenie" w formularzu 2FA - zweryfikowane przez realny e2e w CI).

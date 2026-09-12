Ostatnio ukończone zadanie: TASK-3.1.1
Stan builda: przechodzi (npm run build OK, npm test 45/45 OK w obu trybach APP_MODE)
Następne zadanie w kolejce: TASK-3.1.2 (Etap 1, postfly-plan-wykonania.md sekcja 2) — webhook Telegram woła bezpośrednio istniejące /api/cron/publish/enqueue (bez BullMQ — to Etap 2), akceptujemy cron raz dziennie na razie
Blokery/niedokończone wątki: TASK-3.1.1 zamknięte z jawnie odnotowanym ograniczeniem — użytkownik nie ma jeszcze prawdziwego bota Telegram (@BotFather), więc nie było realnej weryfikacji end-to-end (tylko testy integracyjne z zamockowanym Telegram Bot API). Instrukcja założenia bota: docs/postfly-instrukcja-startu.md, Krok 6.5. TASK-3.1.2/3.2.1/3.3.1 będą miały ten sam ograniczenie, dopóki bot nie powstanie.
Data/godzina ostatniej aktualizacji: 2026-09-12 11:56

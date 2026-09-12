-- TASK-1.1.1: baza testowa fizycznie osobna od bazy deweloperskiej (flowstate).
-- Uruchamiane automatycznie przez obraz postgres przy PIERWSZYM starcie na czystym
-- wolumenie (docker-entrypoint-initdb.d). Dla wolumenu, który już istniał przed tą
-- zmianą, patrz docs/postfly-instrukcja-startu.md - jednorazowa komenda ręczna.
CREATE DATABASE flowstate_test;

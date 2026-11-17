-- BWAU Update 5: Notizen pro Übung
-- Einmal im Supabase SQL-Editor ausführen. Bestehende Daten bleiben erhalten.

-- Dauerhafte Notiz pro Person und Übung, z. B. „Sitz 3, Griff eng“
alter table public.exercise_settings add column if not exists note text
  check (note is null or char_length(note) <= 200);

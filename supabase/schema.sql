-- BWAU – Datenbank-Schema für Supabase
-- Einmal komplett im Supabase SQL-Editor ausführen (Projekt → SQL Editor → New query → Run).

-- Profile: wird beim Registrieren automatisch angelegt
create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  name text not null,
  bodyweight numeric,
  rep_min int not null default 6,
  rep_max int not null default 8,
  rest_seconds int not null default 120,
  created_at timestamptz not null default now()
);
create unique index profiles_name_lower on public.profiles (lower(name));

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, name)
  values (new.id, coalesce(new.raw_user_meta_data->>'name', 'Neu'));
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Eigene Übungen (die Standardliste steckt in der App)
create table public.exercises (
  name text primary key,
  created_by uuid references public.profiles on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

create table public.workouts (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles on delete cascade default auth.uid(),
  title text not null,
  started_at timestamptz not null,
  ended_at timestamptz,
  source text not null default 'app',
  unique (user_id, started_at)
);
create index workouts_started on public.workouts (started_at desc);

create table public.sets (
  id bigint generated always as identity primary key,
  workout_id bigint not null references public.workouts on delete cascade,
  user_id uuid not null references public.profiles on delete cascade default auth.uid(),
  exercise text not null,
  set_index int not null,
  weight numeric not null,
  reps int not null check (reps > 0),
  performed_at timestamptz not null default now()
);
create index sets_user_exercise on public.sets (user_id, exercise, performed_at);
create index sets_workout on public.sets (workout_id);

-- Eigene Einstellungen pro Übung (Wdh.-Bereich, Steigerungsstufe)
create table public.exercise_settings (
  user_id uuid not null references public.profiles on delete cascade default auth.uid(),
  exercise text not null,
  rep_min int, rep_max int, step numeric,
  primary key (user_id, exercise)
);

-- Trainingspläne: items = [{"exercise": "...", "sets": 3}]
create table public.plans (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles on delete cascade default auth.uid(),
  name text not null,
  items jsonb not null default '[]',
  shared boolean not null default false,
  created_at timestamptz not null default now()
);

-- Bestleistung (geschätztes 1RM, Epley) pro Person und Übung
create view public.best_lifts with (security_invoker = on) as
select distinct on (user_id, exercise)
  user_id, exercise, weight, reps, workout_id, performed_at,
  round(weight * (1 + reps / 30.0), 1) as e1rm
from public.sets
where reps <= 15
order by user_id, exercise, weight * (1 + reps / 30.0) desc, performed_at;

-- Zugriffsregeln: alle Eingeloggten sehen alles (Feed, Rangliste), schreiben nur Eigenes
alter table public.profiles enable row level security;
alter table public.exercises enable row level security;
alter table public.workouts enable row level security;
alter table public.sets enable row level security;
alter table public.exercise_settings enable row level security;
alter table public.plans enable row level security;

create policy "lesen" on public.profiles for select to authenticated using (true);
create policy "eigenes ändern" on public.profiles for update to authenticated using (id = auth.uid());

create policy "lesen" on public.exercises for select to authenticated using (true);
create policy "anlegen" on public.exercises for insert to authenticated with check (created_by = auth.uid());

create policy "lesen" on public.workouts for select to authenticated using (true);
create policy "eigene" on public.workouts for insert to authenticated with check (user_id = auth.uid());
create policy "eigene ändern" on public.workouts for update to authenticated using (user_id = auth.uid());
create policy "eigene löschen" on public.workouts for delete to authenticated using (user_id = auth.uid());

create policy "lesen" on public.sets for select to authenticated using (true);
create policy "eigene" on public.sets for insert to authenticated
  with check (user_id = auth.uid() and exists (select 1 from public.workouts w where w.id = workout_id and w.user_id = auth.uid()));
create policy "eigene ändern" on public.sets for update to authenticated using (user_id = auth.uid());
create policy "eigene löschen" on public.sets for delete to authenticated using (user_id = auth.uid());

create policy "eigene" on public.exercise_settings for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "lesen" on public.plans for select to authenticated using (shared or user_id = auth.uid());
create policy "eigene" on public.plans for insert to authenticated with check (user_id = auth.uid());
create policy "eigene ändern" on public.plans for update to authenticated using (user_id = auth.uid());
create policy "eigene löschen" on public.plans for delete to authenticated using (user_id = auth.uid());

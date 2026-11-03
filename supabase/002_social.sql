-- BWAU Update 2: Wochenziel, Reaktionen, Kommentare, Challenges
-- Einmal im Supabase SQL-Editor ausführen. Bestehende Daten bleiben erhalten.

alter table public.profiles add column if not exists weekly_goal int not null default 3
  check (weekly_goal between 1 and 7);

-- Reaktionen auf Trainings: eine pro Person und Art
create table public.reactions (
  workout_id bigint not null references public.workouts on delete cascade,
  user_id uuid not null references public.profiles on delete cascade default auth.uid(),
  kind text not null check (kind in ('fire', 'strong', 'clap')),
  created_at timestamptz not null default now(),
  primary key (workout_id, user_id, kind)
);

create table public.comments (
  id bigint generated always as identity primary key,
  workout_id bigint not null references public.workouts on delete cascade,
  user_id uuid not null references public.profiles on delete cascade default auth.uid(),
  body text not null check (char_length(body) between 1 and 300),
  created_at timestamptz not null default now()
);
create index comments_workout on public.comments (workout_id);

-- Challenges: Wer steigert sich im Zeitraum am meisten bei einer Übung?
create table public.challenges (
  id bigint generated always as identity primary key,
  created_by uuid not null references public.profiles on delete cascade default auth.uid(),
  title text not null check (char_length(title) between 1 and 60),
  exercise text not null,
  metric text not null default 'gain_pct' check (metric in ('gain_pct', 'gain_kg')),
  starts_on date not null,
  ends_on date not null check (ends_on >= starts_on),
  created_at timestamptz not null default now()
);

create table public.challenge_members (
  challenge_id bigint not null references public.challenges on delete cascade,
  user_id uuid not null references public.profiles on delete cascade default auth.uid(),
  joined_at timestamptz not null default now(),
  primary key (challenge_id, user_id)
);

alter table public.reactions enable row level security;
alter table public.comments enable row level security;
alter table public.challenges enable row level security;
alter table public.challenge_members enable row level security;

create policy "lesen" on public.reactions for select to authenticated using (true);
create policy "eigene" on public.reactions for insert to authenticated with check (user_id = auth.uid());
create policy "eigene löschen" on public.reactions for delete to authenticated using (user_id = auth.uid());

create policy "lesen" on public.comments for select to authenticated using (true);
create policy "eigene" on public.comments for insert to authenticated with check (user_id = auth.uid());
create policy "eigene löschen" on public.comments for delete to authenticated using (user_id = auth.uid());

create policy "lesen" on public.challenges for select to authenticated using (true);
create policy "eigene" on public.challenges for insert to authenticated with check (created_by = auth.uid());
create policy "eigene ändern" on public.challenges for update to authenticated using (created_by = auth.uid());
create policy "eigene löschen" on public.challenges for delete to authenticated using (created_by = auth.uid());

create policy "lesen" on public.challenge_members for select to authenticated using (true);
create policy "beitreten" on public.challenge_members for insert to authenticated with check (user_id = auth.uid());
create policy "austreten" on public.challenge_members for delete to authenticated using (user_id = auth.uid());

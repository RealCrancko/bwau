-- BWAU Update 4: Admin-Rechte und automatisches Beenden von Trainings
-- Einmal im Supabase SQL-Editor ausführen. Bestehende Daten bleiben erhalten.

-- ---------- Admin ----------
alter table public.profiles add column if not exists is_admin boolean not null default false;

-- Niemand darf sich selbst zum Admin machen: Profile dürfen nur noch in diesen Spalten geändert werden
revoke update on public.profiles from authenticated, anon;
grant update (bodyweight, rep_min, rep_max, rest_seconds, weekly_goal) on public.profiles to authenticated;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin from profiles where id = auth.uid()), false)
$$;

-- Admins dürfen fremde Trainings, Sätze, Kommentare, Reaktionen und Challenges löschen
create policy "admin löschen" on public.workouts for delete to authenticated using (public.is_admin());
create policy "admin löschen" on public.sets for delete to authenticated using (public.is_admin());
create policy "admin löschen" on public.comments for delete to authenticated using (public.is_admin());
create policy "admin löschen" on public.reactions for delete to authenticated using (public.is_admin());
create policy "admin löschen" on public.challenges for delete to authenticated using (public.is_admin());
create policy "admin löschen" on public.challenge_members for delete to authenticated using (public.is_admin());

-- Connor wird Admin
update public.profiles set is_admin = true
where id = 'bbe3f9ec-a2b7-4d26-afb0-2067c486cc19' and lower(name) = 'connor';

-- ---------- Training nach 30 Minuten ohne neuen Satz beenden ----------
create or replace function public.bwau_autoend_workouts() returns void
language plpgsql security definer set search_path = public as $$
begin
  -- Ende = Zeitpunkt des letzten Satzes, damit die Dauer stimmt
  update workouts w
     set ended_at = last.at
    from (select workout_id, max(performed_at) as at from sets group by workout_id) last
   where last.workout_id = w.id
     and w.ended_at is null
     and last.at < now() - interval '30 minutes';
  -- Trainings ganz ohne Satz werden nach 30 Minuten gelöscht
  delete from workouts w
   where w.ended_at is null
     and w.started_at < now() - interval '30 minutes'
     and not exists (select 1 from sets s where s.workout_id = w.id);
end $$;
revoke execute on function public.bwau_autoend_workouts() from public, anon, authenticated;

select cron.schedule('bwau-autoend', '* * * * *', 'select public.bwau_autoend_workouts()');

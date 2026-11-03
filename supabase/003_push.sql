-- BWAU Update 3: Push-Benachrichtigung, wenn die Pause vorbei ist
-- Einmal im Supabase SQL-Editor ausführen. __CRON_SECRET__ vorher durch das Geheimnis
-- aus .secrets/push.json ersetzen (die fertige Datei liegt in .secrets/003_push_ausgefuellt.sql).

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Ein Eintrag pro Gerät, auf dem jemand Benachrichtigungen erlaubt hat
create table public.push_subscriptions (
  endpoint text primary key,
  user_id uuid not null references public.profiles on delete cascade default auth.uid(),
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

-- Geplante Benachrichtigungen (Pausen-Ende)
create table public.push_jobs (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles on delete cascade default auth.uid(),
  send_at timestamptz not null,
  title text not null,
  body text not null default ''
);
create index push_jobs_due on public.push_jobs (send_at);

alter table public.push_subscriptions enable row level security;
alter table public.push_jobs enable row level security;
create policy "eigene" on public.push_subscriptions for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "eigene" on public.push_jobs for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Geheimnis, mit dem die Datenbank sich bei der Versand-Funktion ausweist
select vault.create_secret('__CRON_SECRET__', 'bwau_cron_secret');

-- Fällige Benachrichtigungen einsammeln und an die Funktion send-push schicken
create function public.bwau_dispatch_push() returns void
language plpgsql security definer set search_path = public as $$
declare payload jsonb;
begin
  with due as (delete from push_jobs where send_at <= now() returning user_id, title, body)
  select jsonb_agg(jsonb_build_object('endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth, 'title', d.title, 'body', d.body))
    into payload
    from due d join push_subscriptions s on s.user_id = d.user_id;
  if payload is null then return; end if;
  perform net.http_post(
    url := 'https://xftyxkxbbjldfmupvjdf.supabase.co/functions/v1/send-push',
    headers := jsonb_build_object('content-type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'bwau_cron_secret')),
    body := jsonb_build_object('messages', payload));
end $$;
revoke execute on function public.bwau_dispatch_push() from public, anon, authenticated;

-- Abgelaufene Geräte entfernen (ruft die Funktion auf, wenn ein Gerät nicht mehr erreichbar ist)
create function public.bwau_drop_subscriptions(secret text, endpoints text[]) returns void
language plpgsql security definer set search_path = public as $$
begin
  if secret is distinct from (select decrypted_secret from vault.decrypted_secrets where name = 'bwau_cron_secret') then
    raise exception 'nicht erlaubt';
  end if;
  delete from push_subscriptions where endpoint = any(endpoints);
end $$;

-- Alle 5 Sekunden nachsehen
select cron.schedule('bwau-push', '5 seconds', 'select public.bwau_dispatch_push()');

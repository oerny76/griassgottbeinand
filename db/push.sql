-- Push-Benachrichtigungen (Web Push für die PWA).
-- Auslöser: Vorsitz oder Location eines kommenden Stammtischs ändert sich (Trigger), wöchentliche Erinnerung an offene Posten (pg_cron).
-- Versand: Edge Function "push" (supabase/functions/push). Sie liest die VAPID-Schlüssel aus push_config.
-- push_config wird einmalig von Hand befüllt (Schlüssel gehören nicht ins Repo):
--   insert into public.push_config(id, vapid_public, vapid_private, hook_secret) values (1, '<public>', '<private>', '<zufälliges Geheimnis>');
create extension if not exists pg_net;
create extension if not exists pg_cron;

create table if not exists public.push_config (
  id int primary key check (id = 1),
  vapid_public text not null,
  vapid_private text not null,
  hook_secret text not null
);
alter table public.push_config enable row level security;

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;

create or replace function public.app_push_key(p_token text)
returns text language plpgsql stable security definer set search_path to 'public' as $function$
declare me public.members := public._auth_member(p_token); k text;
begin
  select vapid_public into k from public.push_config where id = 1;
  if k is null then raise exception 'Benachrichtigungen sind noch nicht eingerichtet' using errcode = '55000'; end if;
  return k;
end $function$;

create or replace function public.app_push_subscribe(p_token text, p_endpoint text, p_p256dh text, p_auth text)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare me public.members := public._auth_member(p_token);
begin
  if coalesce(p_endpoint, '') !~ '^https://' or length(p_endpoint) > 1000 or length(coalesce(p_p256dh, '')) > 200 or length(coalesce(p_auth, '')) > 100 then
    raise exception 'Ungueltiges Abo' using errcode = '22023'; end if;
  insert into public.push_subscriptions(member_id, endpoint, p256dh, auth) values (me.id, p_endpoint, p_p256dh, p_auth)
  on conflict (endpoint) do update set member_id = excluded.member_id, p256dh = excluded.p256dh, auth = excluded.auth;
  return jsonb_build_object('ok', true);
end $function$;

create or replace function public.app_push_unsubscribe(p_token text, p_endpoint text)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare me public.members := public._auth_member(p_token);
begin
  delete from public.push_subscriptions where endpoint = p_endpoint and member_id = me.id;
  return jsonb_build_object('ok', true);
end $function$;

revoke all on function public.app_push_key(text), public.app_push_subscribe(text, text, text, text), public.app_push_unsubscribe(text, text) from public;
grant execute on function public.app_push_key(text), public.app_push_subscribe(text, text, text, text), public.app_push_unsubscribe(text, text) to anon, authenticated;

-- Nachrichten an die Edge Function schicken. messages: [{member_id (leer = alle), title, body}]
create or replace function public._push_send(p_messages jsonb)
returns void language plpgsql security definer set search_path to 'public' as $function$
declare cfg public.push_config;
begin
  select * into cfg from public.push_config where id = 1;
  if cfg.id is null or p_messages is null or jsonb_array_length(p_messages) = 0 then return; end if;
  perform net.http_post(
    url := 'https://iyaxsxxkyxjxkffqtnmn.supabase.co/functions/v1/push',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := jsonb_build_object('secret', cfg.hook_secret, 'messages', p_messages));
end $function$;
revoke all on function public._push_send(jsonb) from public, anon, authenticated;

-- Vorsitz oder Location eines kommenden Stammtischs geändert.
create or replace function public._push_meeting_changed()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
declare msgs jsonb := '[]'::jsonb; d text; nm text;
begin
  if new.meeting_date < public._today() then return new; end if;
  d := to_char(new.meeting_date, 'DD.MM.YYYY');
  if new.chair_id is not null and (tg_op = 'INSERT' or new.chair_id is distinct from old.chair_id) then
    select name into nm from public.members where id = new.chair_id;
    msgs := msgs || jsonb_build_array(jsonb_build_object('title', 'Neuer Vorsitz', 'body', nm || ' hat den Vorsitz für den Stammtisch am ' || d));
  end if;
  if new.location_id is not null and (tg_op = 'INSERT' or new.location_id is distinct from old.location_id) then
    select name into nm from public.locations where id = new.location_id;
    msgs := msgs || jsonb_build_array(jsonb_build_object('title', 'Neue Location', 'body', 'Stammtisch am ' || d || ': ' || nm));
  end if;
  perform public._push_send(msgs);
  return new;
end $function$;
drop trigger if exists push_meeting_changed on public.meetings;
create trigger push_meeting_changed after insert or update of chair_id, location_id on public.meetings
  for each row execute function public._push_meeting_changed();

-- Wöchentliche Erinnerung an offene Posten (eigene, und bei hinterlegtem Zahler auch die des Mitglieds).
create or replace function public._push_weekly_open()
returns void language plpgsql security definer set search_path to 'public' as $function$
declare msgs jsonb;
begin
  with open as (
    select e.member_id, sum(e.amount - e.paid) tot from public.entries e
    where e.cancelled_at is null and e.amount - e.paid > 0 group by e.member_id),
  own as (
    select o.member_id, 'Du hast noch ' || replace(to_char(o.tot, 'FM999990.00'), '.', ',') || ' € offen.' as body from open o),
  cov as (
    select m.payer_id as member_id, 'Offen bei ' || m.name || ': ' || replace(to_char(o.tot, 'FM999990.00'), '.', ',') || ' €.' as body
    from open o join public.members m on m.id = o.member_id where m.payer_id is not null)
  select coalesce(jsonb_agg(jsonb_build_object('member_id', x.member_id, 'title', 'Offene Posten', 'body', x.body)), '[]'::jsonb) into msgs
  from (select * from own union all select * from cov) x;
  perform public._push_send(msgs);
end $function$;
revoke all on function public._push_weekly_open() from public, anon, authenticated;

-- Montags 17:00 UTC (18/19 Uhr deutscher Zeit).
select cron.unschedule('push_weekly_open') where exists (select 1 from cron.job where jobname = 'push_weekly_open');
select cron.schedule('push_weekly_open', '0 17 * * 1', 'select public._push_weekly_open()');

-- Die Edge Function arbeitet als service_role.
grant select on public.push_config to service_role;
grant select, delete on public.push_subscriptions to service_role;

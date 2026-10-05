-- Bierdeckel: Der Deckel und das Deckelbuch bleiben lokal im Browser (kein Datenbank-Eintrag).
-- Nur die Anzahl Bier (Helles, Weißbier, Dunkles, Kellerbier, Draftbier) eines Stammtischabends geht auf Wunsch je Mitglied
-- in die Datenbank, damit man auswerten kann, wie viel Bier wir getrunken haben. Keine Preise, kein Essen, keine anderen Getränke.
-- Lesen und Schreiben nur über die Funktionen mit Token (kein direkter Tabellenzugriff).
drop function if exists public.app_deckel_save(text, date, text, jsonb, text);
drop function if exists public.app_deckel_history(text);
drop function if exists public.app_deckel_delete(text, uuid);
drop table if exists public.deckel_items;
drop table if exists public.deckel_tabs;

create table if not exists public.beer_counts (
  member_id uuid not null references public.members(id) on delete cascade,
  meeting_date date not null,
  beers int not null check (beers between 1 and 60),
  updated_at timestamptz not null default now(),
  primary key (member_id, meeting_date)
);
alter table public.beer_counts enable row level security;
revoke all on public.beer_counts from anon, authenticated;

-- Anzahl Bier für einen Stammtischabend setzen (ersetzt den bisherigen Wert, also wiederholbar).
create or replace function public.app_beer_save(p_token text, p_date date, p_beers int)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare me public.members := public._auth_member(p_token);
begin
  if p_date is null or p_date > public._today() or not exists (select 1 from public.meetings where meeting_date = p_date) then
    raise exception 'Kein Stammtisch an diesem Datum' using errcode = '22023'; end if;
  if p_beers is null or p_beers < 1 or p_beers > 60 then raise exception 'Ungueltige Anzahl' using errcode = '22023'; end if;
  insert into public.beer_counts(member_id, meeting_date, beers) values (me.id, p_date, p_beers)
  on conflict (member_id, meeting_date) do update set beers = excluded.beers, updated_at = now();
  return jsonb_build_object('beers', p_beers);
end $function$;

create or replace function public.app_beer_delete(p_token text, p_date date)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare me public.members := public._auth_member(p_token);
begin
  delete from public.beer_counts where member_id = me.id and meeting_date = p_date;
  return jsonb_build_object('ok', true);
end $function$;

revoke all on function public.app_beer_save(text, date, int) from public;
revoke all on function public.app_beer_delete(text, date) from public;
grant execute on function public.app_beer_save(text, date, int) to anon, authenticated;
grant execute on function public.app_beer_delete(text, date) to anon, authenticated;

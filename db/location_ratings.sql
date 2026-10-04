-- Locations bewerten: eine Bewertung je Mitglied und Location (Essen, Getränke, Service, Ambiente, Preis-Leistung, je 1 bis 5).
-- Bewerten darf man nur Locations, an denen schon ein Stammtisch stattfand (Termin heute oder früher).
-- Die alten, importierten Bewertungen haben kein Mitglied (member_id leer) und bleiben unverändert.
create unique index if not exists ratings_location_member_uq on public.ratings (location_id, member_id) where member_id is not null;

-- Eigene Bewertungen, damit das Formular vorbelegt ist.
create or replace function public.app_my_ratings(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare me public.members := public._auth_member(p_token);
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object('location', l.name, 'food', r.food, 'drinks', r.drinks, 'service', r.service, 'ambience', r.ambience, 'value', r.value_for_money))
    from public.ratings r join public.locations l on l.id = r.location_id where r.member_id = me.id), '[]'::jsonb);
end $function$;

-- Bewertung speichern oder ändern. Leere Werte (null) sind erlaubt, mindestens ein Wert muss gesetzt sein.
create or replace function public.app_rate_location(p_token text, p_location text, p_food int default null, p_drinks int default null,
  p_service int default null, p_ambience int default null, p_value int default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare me public.members := public._auth_member(p_token); v_loc uuid; v int;
begin
  select id into v_loc from public.locations where name = p_location;
  if v_loc is null then raise exception 'Unbekannte Location' using errcode = '22023'; end if;
  if not exists (select 1 from public.meetings where location_id = v_loc and meeting_date <= public._today()) then
    raise exception 'Diese Location kann erst nach dem Stammtisch bewertet werden' using errcode = '55000'; end if;
  foreach v in array array[p_food, p_drinks, p_service, p_ambience, p_value] loop
    if v is not null and (v < 1 or v > 5) then raise exception 'Bewertung muss zwischen 1 und 5 liegen' using errcode = '22023'; end if;
  end loop;
  if p_food is null and p_drinks is null and p_service is null and p_ambience is null and p_value is null then
    raise exception 'Bitte mindestens einen Wert vergeben' using errcode = '22023'; end if;
  insert into public.ratings(location_id, member_id, food, drinks, service, ambience, value_for_money)
  values (v_loc, me.id, p_food, p_drinks, p_service, p_ambience, p_value)
  on conflict (location_id, member_id) where member_id is not null
  do update set food = excluded.food, drinks = excluded.drinks, service = excluded.service, ambience = excluded.ambience, value_for_money = excluded.value_for_money;
  return jsonb_build_object('location', p_location);
end $function$;

revoke all on function public.app_my_ratings(text) from public;
revoke all on function public.app_rate_location(text, text, int, int, int, int, int) from public;
grant execute on function public.app_my_ratings(text) to anon, authenticated;
grant execute on function public.app_rate_location(text, text, int, int, int, int, int) to anon, authenticated;

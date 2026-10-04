-- Ziel für "Vorsitz übertragen" und "Location eintragen": der erste Termin, dessen Frist (19 Uhr am Stammtischtag) noch nicht vorbei ist.
--   * Vor dem Stammtischtag: der anstehende Termin.
--   * Am Stammtischtag bis 19 Uhr: der heutige Termin (aktueller Stammtisch).
--   * Am Stammtischtag ab 19 Uhr: der nächste Termin, oder ein neuer, wenn noch keiner angelegt ist.
-- Vorher galt immer der erste Termin nach heute, am Stammtischtag wurde so der falsche Termin geändert.

create or replace function public._target_meeting()
returns public.meetings
language sql
stable
security definer
set search_path to 'public'
as $function$
  select m.* from public.meetings m
  where m.meeting_date >= public._today() and not public._deadline_passed(m.meeting_date)
  order by m.meeting_date limit 1
$function$;
revoke all on function public._target_meeting() from public, anon, authenticated;

-- Rolle und Ziel für die App. chair_scope: 'upcoming' (anstehender Termin), 'current' (heutiger Stammtisch bis 19 Uhr),
-- 'next' (heute ab 19 Uhr: der Klick gilt für den nächsten Stammtisch).
create or replace function public._me_json(me members)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare last_m public.meetings; tgt public.meetings; todays public.meetings; today date := public._today();
  v_old_ok boolean; v_until date; v_scope text;
begin
  select * into last_m from public.meetings where meeting_date <= today and chair_id is not null order by meeting_date desc limit 1;
  select * into tgt from public._target_meeting();
  select * into todays from public.meetings where meeting_date = today;
  v_scope := case when todays.id is not null and public._deadline_passed(today) then 'next'
                  when tgt.id is not null and tgt.meeting_date = today then 'current'
                  else 'upcoming' end;
  -- Der alte Vorsitz darf einen schon vergebenen Vorsitz nur bis zum Ende des Tags nach dem Stammtisch ändern.
  v_old_ok := coalesce(last_m.chair_id = me.id, false) and (tgt.id is null or today <= last_m.meeting_date + 1);
  v_until := case when v_old_ok and tgt.id is not null and tgt.chair_id is distinct from me.id and not me.is_admin
                  then last_m.meeting_date + 1 end;
  return jsonb_build_object(
    'name', me.name, 'is_admin', me.is_admin,
    'is_last_chair', coalesce(last_m.chair_id = me.id, false),
    'is_next_chair', coalesce(tgt.chair_id = me.id, false),
    'has_upcoming', (tgt.id is not null),
    'chair_scope', v_scope,
    'chair_target_date', tgt.meeting_date,
    'chair_target_chair', (select name from public.members where id = tgt.chair_id),
    'chair_change_until', v_until,
    'can_set_next_chair', (me.is_admin or coalesce(tgt.chair_id = me.id, false) or v_old_ok),
    -- Die Location tragen nur der designierte Vorsitz und der Admin ein.
    'can_set_location', (tgt.id is not null and (me.is_admin or coalesce(tgt.chair_id = me.id, false))));
end $function$;

create or replace function public.app_set_next_chair(p_token text, p_chair text, p_date date default null::date)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare me public.members; last_m public.meetings; tgt public.meetings; v_chair uuid; v_date date; today date := public._today();
begin
  me := public._auth_member(p_token);
  select id into v_chair from public.members where name = p_chair and kind = 'member';
  if v_chair is null then raise exception 'Unbekanntes Mitglied' using errcode = '22023'; end if;
  select * into last_m from public.meetings where meeting_date <= today and chair_id is not null order by meeting_date desc limit 1;
  select * into tgt from public._target_meeting();
  if tgt.id is not null then
    -- Vorsitz ist schon vergeben: Admin und designierter Vorsitz jederzeit, der alte Vorsitz nur bis zum Ende des Tags nach dem Stammtisch.
    if not (me.is_admin or tgt.chair_id = me.id) then
      if last_m.chair_id = me.id then
        if today > last_m.meeting_date + 1 then
          raise exception 'Der Vorsitz kann nur noch vom neuen Vorsitzenden geaendert werden' using errcode = '42501'; end if;
      else
        raise exception 'Nicht berechtigt' using errcode = '42501';
      end if;
    end if;
    update public.meetings set chair_id = v_chair where id = tgt.id; v_date := tgt.meeting_date;
  else
    -- Noch kein Termin: festlegen darf der Admin und der Vorsitz des letzten Abends.
    if not (me.is_admin or last_m.chair_id = me.id) then raise exception 'Nicht berechtigt' using errcode = '42501'; end if;
    v_date := coalesce(p_date, public._first_friday_next_month(greatest(last_m.meeting_date, today)));
    if v_date <= today then raise exception 'Datum muss in der Zukunft liegen' using errcode = '22023'; end if;
    insert into public.meetings(meeting_date, chair_id) values (v_date, v_chair);
  end if;
  return jsonb_build_object('date', v_date, 'chair', p_chair);
end $function$;

create or replace function public.app_set_next_location(p_token text, p_location text, p_street text default null::text, p_zip text default null::text, p_city text default null::text, p_url text default null::text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare me public.members; tgt public.meetings; v_loc uuid;
  v_name text := public._clean_name(p_location); v_url text := nullif(trim(coalesce(p_url, '')), '');
begin
  me := public._auth_member(p_token);
  select * into tgt from public._target_meeting();
  if tgt.id is null then raise exception 'Erst den naechsten Vorsitz bestimmen' using errcode = '55000'; end if;
  if not (me.is_admin or tgt.chair_id = me.id) then raise exception 'Nicht berechtigt' using errcode = '42501'; end if;
  if length(v_name) < 1 or length(v_name) > 80 then raise exception 'Location fehlt oder ist zu lang' using errcode = '22023'; end if;
  if v_url is not null and (v_url !~* '^https?://[^\s<>"'']+$' or length(v_url) > 200) then
    raise exception 'Website muss mit http:// oder https:// beginnen' using errcode = '22023'; end if;
  if length(coalesce(p_street, '')) > 80 or length(coalesce(p_zip, '')) > 10 or length(coalesce(p_city, '')) > 60 then
    raise exception 'Adresse ist zu lang' using errcode = '22023'; end if;
  select id into v_loc from public.locations where name = v_name;
  if v_loc is null then
    insert into public.locations(name, street, zip, city, url)
    values (v_name, nullif(public._clean_name(p_street), ''), nullif(public._clean_name(p_zip), ''), nullif(public._clean_name(p_city), ''), v_url)
    returning id into v_loc;
  end if;
  update public.meetings set location_id = v_loc where id = tgt.id;
  return jsonb_build_object('date', tgt.meeting_date, 'location', v_name);
end $function$;

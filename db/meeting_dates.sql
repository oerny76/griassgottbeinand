-- Termine: Regel ist der erste Freitag im Monat, Abweichungen hinterlegt der Admin (Tabelle meeting_overrides).
-- Die nächsten Termine liegen immer schon als Zeilen in public.meetings (ohne Vorsitz und Location), damit man sich
-- vorab abmelden kann. Das erledigt _ensure_meetings(), täglich per Cron und nach jeder Änderung durch den Admin.
-- Neu:
--   * _planned_date, _ensure_meetings, meeting_overrides
--   * app_dashboard liefert zusätzlich "upcoming" (die nächsten drei Termine mit Teilnehmern)
--   * app_add_absence / app_cancel_absence haben den optionalen Parameter p_date (einer der nächsten drei Termine)
--   * app_admin_meetings / app_admin_set_meeting_date (Admin-Reiter "Termine")
--   * _me_json, app_set_next_chair: kommen damit zurecht, dass der nächste Termin schon ohne Vorsitz existiert

create table if not exists public.meeting_overrides (
  month date primary key check (month = date_trunc('month', month)::date),
  meeting_date date not null,
  created_at timestamptz not null default now(),
  check (date_trunc('month', meeting_date)::date = month)
);
alter table public.meeting_overrides enable row level security;

-- Regulärer Termin: erster Freitag des Monats von p_month.
create or replace function public._first_friday_of(p_month date)
returns date language sql immutable as $function$
  select d + ((5 - extract(dow from d)::int + 7) % 7) from (select date_trunc('month', p_month)::date as d) x
$function$;

-- Geltender Termin eines Monats ohne Terminzeile: Abweichung oder erster Freitag.
create or replace function public._planned_date(p_month date)
returns date language sql stable security definer set search_path to 'public' as $function$
  select coalesce(
    (select o.meeting_date from public.meeting_overrides o where o.month = date_trunc('month', p_month)::date),
    public._first_friday_of(p_month))
$function$;
revoke all on function public._planned_date(date) from public, anon, authenticated;

-- Legt Terminzeilen an, bis die nächsten drei Monate mit Termin eine Zeile haben (höchstens 12 Monate voraus).
create or replace function public._ensure_meetings()
returns void language plpgsql security definer set search_path to 'public' as $function$
declare today date := public._today(); m date := date_trunc('month', public._today())::date; n int := 0; d date; i int := 0;
begin
  while n < 3 and i < 12 loop
    select min(meeting_date) into d from public.meetings
      where meeting_date >= m and meeting_date < (m + interval '1 month')::date and meeting_date >= today;
    if d is null then
      d := public._planned_date(m);
      if d >= today and not exists (select 1 from public.meetings where meeting_date >= m and meeting_date < (m + interval '1 month')::date) then
        insert into public.meetings(meeting_date) values (d) on conflict (meeting_date) do nothing;
      else d := null; end if;
    end if;
    if d is not null then n := n + 1; end if;
    m := (m + interval '1 month')::date; i := i + 1;
  end loop;
end $function$;
revoke all on function public._ensure_meetings() from public, anon, authenticated;

select cron.unschedule('ensure_meetings') where exists (select 1 from cron.job where jobname = 'ensure_meetings');
select cron.schedule('ensure_meetings', '5 0 * * *', 'select public._ensure_meetings()');

-- Die nächsten drei Termine (Zeilen ab heute) für Abmeldungen im Voraus.
create or replace function public._upcoming_meetings()
returns setof public.meetings language sql stable security definer set search_path to 'public' as $function$
  select * from (select * from public.meetings where meeting_date >= public._today() order by meeting_date limit 3) x
$function$;
revoke all on function public._upcoming_meetings() from public, anon, authenticated;

-- Dashboard: bisheriger Inhalt plus "upcoming".
do $$ begin
  if not exists (select 1 from pg_proc where proname = '_dashboard_json_base') then
    alter function public._dashboard_json(members) rename to _dashboard_json_base;
  end if;
end $$;
revoke all on function public._dashboard_json_base(members) from public, anon, authenticated;

create or replace function public._dashboard_json(me members)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $function$
declare n_members int;
begin
  select count(*) into n_members from public.members where kind = 'member';
  return public._dashboard_json_base(me) || jsonb_build_object('upcoming', coalesce((
    select jsonb_agg(jsonb_build_object(
      'date', u.meeting_date,
      'regular', public._first_friday_of(u.meeting_date),
      'chair', (select name from public.members where id = u.chair_id),
      'deadline_passed', public._deadline_passed(u.meeting_date),
      'absent', a.names, 'guests', g.list,
      'my_absent', me.name = any (select jsonb_array_elements_text(a.names)),
      'count', greatest(n_members - jsonb_array_length(a.names), 0) + jsonb_array_length(g.list)) order by u.meeting_date)
    from public._upcoming_meetings() u
    cross join lateral (select coalesce(jsonb_agg(m.name order by m.name), '[]'::jsonb) names
      from public.entries e join public.members m on m.id = e.member_id
      where e.meeting_id = u.id and e.cancelled_at is null and e.category in ('Abwesenheit (1x)','Abwesenheit unentschuldigt')) a
    cross join lateral (select coalesce(jsonb_agg(jsonb_build_object('guest', e.subcategory, 'host', m.name) order by m.name), '[]'::jsonb) list
      from public.entries e join public.members m on m.id = e.member_id
      where e.meeting_id = u.id and e.cancelled_at is null and e.category in ('Gastbeitrag','Gast unangemeldet')) g), '[]'::jsonb));
end $function$;

-- Abmelden und Zurücknehmen: optional für einen der nächsten drei Termine. Ohne p_date wie bisher der nächste Termin.
drop function if exists public.app_add_absence(text, text);
create or replace function public.app_add_absence(p_token text, p_member text default null::text, p_date date default null::date)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare me public.members; tgt public.members; reg public.meetings; fee numeric; n int;
begin
  me := public._auth_member(p_token);
  tgt := me;
  if p_member is not null and p_member <> me.name then
    if not me.is_admin then raise exception 'Nicht berechtigt' using errcode = '42501'; end if;
    select * into tgt from public.members where name = p_member and kind = 'member';
    if tgt.id is null then raise exception 'Unbekanntes Mitglied' using errcode = '22023'; end if;
  end if;
  perform public._ensure_meetings();
  if p_date is null then
    select * into reg from public.meetings where meeting_date >= public._today() order by meeting_date limit 1;
  else
    select * into reg from public._upcoming_meetings() where meeting_date = p_date;
    if reg.id is null then raise exception 'Fuer diesen Termin ist keine Abmeldung moeglich' using errcode = '55000'; end if;
  end if;
  if reg.id is null then raise exception 'Noch kein Termin angelegt' using errcode = '55000'; end if;
  if public._deadline_passed(reg.meeting_date) and not me.is_admin then
    raise exception 'Frist abgelaufen (19 Uhr am Stammtischtag)' using errcode = '55000'; end if;
  if exists (select 1 from public.entries where meeting_id = reg.id and member_id = tgt.id and cancelled_at is null
             and category in ('Abwesenheit (1x)','Abwesenheit unentschuldigt')) then
    raise exception 'Abwesenheit ist schon eingetragen' using errcode = '23505'; end if;
  if reg.chair_id = tgt.id and not public._deadline_passed(reg.meeting_date) then
    raise exception 'Der Vorsitz muss zuerst uebertragen werden' using errcode = '55000'; end if;
  select default_amount into fee from public.fee_types where name = 'Abwesenheit (1x)';
  insert into public.entries(entry_date, meeting_id, member_id, category, amount, paid, source)
  values (reg.meeting_date, reg.id, tgt.id, 'Abwesenheit (1x)', fee, 0, case when tgt.id = me.id then 'app' else 'admin' end);
  select count(*) into n from public.entries where member_id = tgt.id and cancelled_at is null
     and category in ('Abwesenheit (1x)','Abwesenheit unentschuldigt') and extract(year from entry_date) = extract(year from reg.meeting_date);
  return jsonb_build_object('date', reg.meeting_date, 'member', tgt.name, 'amount', fee, 'count_this_year', n);
end $function$;

drop function if exists public.app_cancel_absence(text, text);
create or replace function public.app_cancel_absence(p_token text, p_member text default null::text, p_date date default null::date)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare me public.members; tgt public.members; reg public.meetings; k int;
begin
  me := public._auth_member(p_token);
  tgt := me;
  if p_member is not null and p_member <> me.name then
    if not me.is_admin then raise exception 'Nicht berechtigt' using errcode = '42501'; end if;
    select * into tgt from public.members where name = p_member and kind = 'member';
    if tgt.id is null then raise exception 'Unbekanntes Mitglied' using errcode = '22023'; end if;
  end if;
  if p_date is null then
    select * into reg from public.meetings where meeting_date >= public._today() order by meeting_date limit 1;
  else
    select * into reg from public._upcoming_meetings() where meeting_date = p_date;
  end if;
  if reg.id is null then raise exception 'Kein Termin' using errcode = '55000'; end if;
  if public._deadline_passed(reg.meeting_date) and not me.is_admin then
    raise exception 'Frist abgelaufen (19 Uhr am Stammtischtag)' using errcode = '55000'; end if;
  update public.entries set cancelled_at = now()
   where meeting_id = reg.id and member_id = tgt.id and category = 'Abwesenheit (1x)' and paid = 0 and cancelled_at is null;
  get diagnostics k = row_count;
  if k = 0 then raise exception 'Keine offene Abwesenheit gefunden (bezahlte bitte beim Admin melden)' using errcode = '02000'; end if;
  return jsonb_build_object('date', reg.meeting_date, 'member', tgt.name, 'cancelled', k);
end $function$;

-- Vorsitz: Der nächste Termin existiert jetzt schon ohne Vorsitz. Dann darf der Vorsitz des letzten Abends oder der Admin ihn setzen,
-- ohne die Frist "bis zum Tag nach dem Stammtisch".
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
  v_old_ok := coalesce(last_m.chair_id = me.id, false) and (tgt.id is null or tgt.chair_id is null or today <= last_m.meeting_date + 1);
  v_until := case when v_old_ok and tgt.id is not null and tgt.chair_id is not null and tgt.chair_id is distinct from me.id and not me.is_admin
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
  perform public._ensure_meetings();
  select * into last_m from public.meetings where meeting_date <= today and chair_id is not null order by meeting_date desc limit 1;
  select * into tgt from public._target_meeting();
  if tgt.id is not null then
    if not (me.is_admin or tgt.chair_id = me.id) then
      if last_m.chair_id = me.id then
        if tgt.chair_id is not null and today > last_m.meeting_date + 1 then
          raise exception 'Der Vorsitz kann nur noch vom neuen Vorsitzenden geaendert werden' using errcode = '42501'; end if;
      else
        raise exception 'Nicht berechtigt' using errcode = '42501';
      end if;
    end if;
    update public.meetings set chair_id = v_chair where id = tgt.id; v_date := tgt.meeting_date;
  else
    if not (me.is_admin or last_m.chair_id = me.id) then raise exception 'Nicht berechtigt' using errcode = '42501'; end if;
    v_date := coalesce(p_date, public._planned_date((date_trunc('month', greatest(last_m.meeting_date, today)) + interval '1 month')::date));
    if v_date <= today then raise exception 'Datum muss in der Zukunft liegen' using errcode = '22023'; end if;
    insert into public.meetings(meeting_date, chair_id) values (v_date, v_chair);
  end if;
  return jsonb_build_object('date', v_date, 'chair', p_chair);
end $function$;

-- Admin: Termine der nächsten sechs Monate.
create or replace function public.app_admin_meetings(p_token text)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $function$
declare n_members int;
begin
  perform public._auth_admin(p_token);
  select count(*) into n_members from public.members where kind = 'member';
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'month', to_char(s.m, 'YYYY-MM'), 'date', s.d, 'regular', r.reg, 'moved', s.d <> r.reg, 'has_row', s.mid is not null,
      'locked', public._deadline_passed(s.d), 'absent', coalesce(a.n, 0),
      'count', greatest(n_members - coalesce(a.n, 0), 0) + coalesce(g.n, 0)) order by s.m)
    from (
      select m::date m,
             coalesce((select min(x.meeting_date) from public.meetings x where x.meeting_date >= m::date and x.meeting_date < (m + interval '1 month')::date and x.meeting_date >= public._today()),
                      public._planned_date(m::date)) d,
             (select x.id from public.meetings x where x.meeting_date >= m::date and x.meeting_date < (m + interval '1 month')::date and x.meeting_date >= public._today() order by x.meeting_date limit 1) mid
      from generate_series(date_trunc('month', public._today()), date_trunc('month', public._today()) + interval '6 months', interval '1 month') m) s
    cross join lateral (select public._first_friday_of(s.m) reg) r
    left join lateral (select count(distinct e.member_id) n from public.entries e where e.meeting_id = s.mid and e.cancelled_at is null and e.category in ('Abwesenheit (1x)','Abwesenheit unentschuldigt')) a on true
    left join lateral (select count(*) n from public.entries e where e.meeting_id = s.mid and e.cancelled_at is null and e.category in ('Gastbeitrag','Gast unangemeldet')) g on true
    where s.d >= public._today()), '[]'::jsonb);
end $function$;

-- Admin: Termin eines Monats verschieben (p_date) oder auf den ersten Freitag zurücksetzen (p_date = null).
-- Schon eingetragene Abmeldungen und Gäste wandern mit. Optional geht ein Push an alle.
create or replace function public.app_admin_set_meeting_date(p_token text, p_month text, p_date date default null::date, p_notify boolean default false)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare m date; reg date; cur public.meetings; v_new date; today date := public._today(); old date;
begin
  perform public._auth_admin(p_token);
  begin m := to_date(p_month || '-01', 'YYYY-MM-DD'); exception when others then raise exception 'Monat ungueltig' using errcode = '22023'; end;
  if m < date_trunc('month', today)::date or m > (date_trunc('month', today) + interval '12 months')::date then
    raise exception 'Monat ungueltig' using errcode = '22023'; end if;
  reg := public._first_friday_of(m);
  v_new := coalesce(p_date, reg);
  if date_trunc('month', v_new)::date <> m then raise exception 'Der Termin muss im selben Monat bleiben' using errcode = '22023'; end if;
  if v_new < today or (v_new = today and public._deadline_passed(v_new)) then raise exception 'Das Datum liegt in der Vergangenheit' using errcode = '22023'; end if;
  select * into cur from public.meetings where meeting_date >= m and meeting_date < (m + interval '1 month')::date and meeting_date >= today order by meeting_date limit 1;
  old := coalesce(cur.meeting_date, public._planned_date(m));
  if cur.id is not null and public._deadline_passed(cur.meeting_date) then raise exception 'Dieser Termin laeuft schon oder ist vorbei' using errcode = '55000'; end if;
  if v_new = old and (v_new = reg) = not exists (select 1 from public.meeting_overrides where month = m) then
    return jsonb_build_object('date', v_new, 'unchanged', true); end if;
  if exists (select 1 from public.meetings where meeting_date = v_new and id is distinct from cur.id) then
    raise exception 'An diesem Tag gibt es schon einen Stammtisch' using errcode = '23505'; end if;
  if v_new = reg then delete from public.meeting_overrides where month = m;
  else insert into public.meeting_overrides(month, meeting_date) values (m, v_new)
       on conflict (month) do update set meeting_date = excluded.meeting_date; end if;
  if cur.id is not null and cur.meeting_date <> v_new then
    update public.meetings set meeting_date = v_new where id = cur.id;
    update public.entries set entry_date = v_new where meeting_id = cur.id and entry_date = cur.meeting_date;
  end if;
  perform public._ensure_meetings();
  if p_notify and v_new <> old then
    perform public._push_send(jsonb_build_array(jsonb_build_object('title', 'Stammtisch verschoben',
      'body', 'Der Stammtisch ist jetzt am ' || to_char(v_new, 'DD.MM.YYYY') || case when old <> reg or v_new <> reg then ' (statt ' || to_char(old, 'DD.MM.YYYY') || ')' else '' end)));
  end if;
  return jsonb_build_object('date', v_new, 'regular', reg, 'moved', v_new <> reg);
end $function$;

-- Zugriff wie bei allen app_*-Funktionen: nur über den Token.
grant execute on function public.app_add_absence(text, text, date), public.app_cancel_absence(text, text, date),
  public.app_admin_meetings(text), public.app_admin_set_meeting_date(text, text, date, boolean) to anon, authenticated;

-- Einmal anlegen, damit die nächsten drei Termine sofort da sind.
select public._ensure_meetings();

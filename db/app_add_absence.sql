-- Abwesenheit eintragen (Mitglied für sich, Admin für andere).
-- Neu: Wer den Vorsitz des nächsten Termins hat, meldet sich erst ab, wenn der Vorsitz übertragen ist.
-- Die Regel gilt nur für künftige Termine. Am Stammtischtag selbst lässt sich der Vorsitz nicht mehr übertragen
-- (app_set_next_chair ändert den ersten Termin nach heute), dort würde die Regel den Vorsitz festsetzen.
-- Sie gilt auch, wenn der Admin für den Vorsitz einträgt. Der Admin ändert dann zuerst den Vorsitz.
-- Nicht betroffen: manuelle Buchungen im Admin-Bereich (app_admin_add_entry).
create or replace function public.app_add_absence(p_token text, p_member text default null::text)
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
  select * into reg from public.meetings where meeting_date >= public._today() order by meeting_date limit 1;
  if reg.id is null then raise exception 'Noch kein Termin angelegt' using errcode = '55000'; end if;
  if public._deadline_passed(reg.meeting_date) and not me.is_admin then
    raise exception 'Frist abgelaufen (19 Uhr am Stammtischtag)' using errcode = '55000'; end if;
  if exists (select 1 from public.entries where meeting_id = reg.id and member_id = tgt.id and cancelled_at is null
             and category in ('Abwesenheit (1x)','Abwesenheit unentschuldigt')) then
    raise exception 'Abwesenheit ist schon eingetragen' using errcode = '23505'; end if;
  if reg.meeting_date > public._today() and reg.chair_id = tgt.id then
    raise exception 'Der Vorsitz muss zuerst uebertragen werden' using errcode = '55000'; end if;
  select default_amount into fee from public.fee_types where name = 'Abwesenheit (1x)';
  insert into public.entries(entry_date, meeting_id, member_id, category, amount, paid, source)
  values (reg.meeting_date, reg.id, tgt.id, 'Abwesenheit (1x)', fee, 0, case when tgt.id = me.id then 'app' else 'admin' end);
  select count(*) into n from public.entries where member_id = tgt.id and cancelled_at is null
     and category in ('Abwesenheit (1x)','Abwesenheit unentschuldigt') and extract(year from entry_date) = extract(year from reg.meeting_date);
  return jsonb_build_object('date', reg.meeting_date, 'member', tgt.name, 'amount', fee, 'count_this_year', n);
end $function$;

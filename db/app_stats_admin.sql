-- Nur für den Admin: Wer fehlte bei den letzten zwölf Abenden (Heatmap im Admin-Bereich).
-- Enthält Namen, deshalb getrennt von app_stats (Datenschutz-Stufe 1: Einzelwerte nur für den Admin).
-- "absent" ist je Mitglied eine Zeichenkette aus 0 und 1, in der Reihenfolge von "dates" (1 = fehlte).
create or replace function public.app_stats_admin(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  me public.members := public._auth_admin(p_token);
  dates date[];
begin
  select coalesce(array_agg(t.d order by t.d), '{}') into dates
  from (
    select meeting_date d from public.meetings
    where meeting_date < public._today() and coalesce(note, '') not ilike 'AUSFALL%'
    order by meeting_date desc limit 12
  ) t;

  return jsonb_build_object(
    'dates', to_jsonb(dates),
    'rows', coalesce((
      select jsonb_agg(jsonb_build_object('name', m.name, 'absent', (
        select string_agg(case when exists (
            select 1 from public.entries e join public.meetings mt on mt.id = e.meeting_id
            where e.member_id = m.id and mt.meeting_date = dd and e.cancelled_at is null
              and e.category in ('Abwesenheit (1x)', 'Abwesenheit unentschuldigt')
          ) then '1' else '0' end, '' order by dd)
        from unnest(dates) dd)) order by m.name)
      from public.members m where m.kind = 'member'), '[]'::jsonb)
  );
end
$function$;

revoke all on function public.app_stats_admin(text) from public;
grant execute on function public.app_stats_admin(text) to anon, authenticated;

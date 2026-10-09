-- Statistik für die Mitglieder-App (Datenschutz-Stufe 1: nur Gruppenwerte, keine Einzelpersonen).
-- Liefert aggregierte Zahlen für Anwesenheit, Kassenstand und Einnahmen. Jedes Mitglied mit gültigem Code darf lesen.
-- Gelöschte Einträge gibt es nicht, stornierte (cancelled_at) werden ignoriert.
create or replace function public.app_stats(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  me public.members := public._auth_member(p_token);
  today date := public._today();
  n_members int;
  first_month date := (date_trunc('month', public._today()) - interval '47 months')::date;
  first_year int := extract(year from public._today())::int - 5;
begin
  select count(*) into n_members from public.members where kind = 'member';

  return jsonb_build_object(
    'asof', today,
    -- Anwesende = aktuelle Mitgliederzahl minus Entschuldigte (wie im alten Sheet). Nur die letzten 24 Abende.
    'members', n_members,
    'attendance', coalesce((
      select jsonb_agg(jsonb_build_object('date', t.d, 'present', greatest(n_members - t.absent, 0), 'guests', t.guests) order by t.d)
      from (
        select m.meeting_date d,
               count(distinct e.member_id) filter (where e.category in ('Abwesenheit (1x)', 'Abwesenheit unentschuldigt') and mem.kind = 'member') absent,
               count(*) filter (where e.category in ('Gastbeitrag', 'Gast unangemeldet')) guests
        from public.meetings m
        left join public.entries e on e.meeting_id = m.id and e.cancelled_at is null
        left join public.members mem on mem.id = e.member_id
        where m.meeting_date < today and coalesce(m.note, '') not ilike 'AUSFALL%'
        group by m.meeting_date
        order by m.meeting_date desc
        limit 24
      ) t), '[]'::jsonb),
    -- PayPal-Saldo am Monatsende der letzten 48 Monate (Monate ohne Zahlung übernehmen den Vormonat).
    'cash', coalesce((
      select jsonb_agg(jsonb_build_object('month', to_char(c.m, 'YYYY-MM'), 'balance', c.bal, 'change', c.delta) order by c.m)
      from (
        select ms.m,
               (select coalesce(sum(amount), 0) from public.paypal_payments where money_pool is null and tx_date < first_month)
                 + sum(coalesce(mo.s, 0)) over (order by ms.m) bal,
               coalesce(mo.s, 0) delta
        from (select g::date m from generate_series(first_month::timestamp, date_trunc('month', today)::timestamp, interval '1 month') g) ms
        left join (select date_trunc('month', tx_date)::date m, sum(amount) s from public.paypal_payments where money_pool is null group by 1) mo on mo.m = ms.m
      ) c), '[]'::jsonb),
    -- Einnahmen pro Jahr nach Art (nur positive Buchungen nach Buchungsdatum bis heute, Ausgaben zählen nicht).
    'income', coalesce((
      select jsonb_agg(to_jsonb(r) order by r.year)
      from (
        select y.y as year,
               coalesce(sum(e.amount) filter (where e.category in ('Geburtstagsbeitrag', 'Geburtstag vergessen', 'Geburtstagsmeldung vergessen')), 0) as birthday,
               coalesce(sum(e.amount) filter (where e.category in ('Abwesenheit (1x)', 'Abwesenheit (6x)', 'Abwesenheit unentschuldigt')), 0) as absence,
               coalesce(sum(e.amount) filter (where e.category = 'Sonderumlage'), 0) as special,
               coalesce(sum(e.amount) filter (where e.category in ('Gastbeitrag', 'Gast unangemeldet')), 0) as guests
        from generate_series(first_year, extract(year from today)::int) y(y)
        left join public.entries e on extract(year from e.entry_date) = y.y and e.cancelled_at is null and e.amount > 0 and e.entry_date <= today
        group by y.y
      ) r), '[]'::jsonb),
    -- Abwesenheiten pro Jahr seit 2015 und Zahl der Abende, damit sich Jahre vergleichen lassen (laufendes Jahr ist unvollständig).
    -- Gezählt nach Buchungsdatum bis gestern, weil ältere Abwesenheiten teils keinem Abend zugeordnet sind.
    -- Schon angemeldete Abwesenheiten für künftige Abende zählen nicht, sonst passt der Zähler nicht zur Zahl der Abende.
    'absences_by_year', coalesce((
      select jsonb_agg(to_jsonb(r) order by r.year)
      from (
        select y.y as year,
               (select count(*) from public.entries e
                 where e.cancelled_at is null and e.category in ('Abwesenheit (1x)', 'Abwesenheit unentschuldigt') and e.entry_date < today and extract(year from e.entry_date) = y.y) as absences,
               (select count(*) from public.meetings mt
                 where extract(year from mt.meeting_date) = y.y and mt.meeting_date < today and coalesce(mt.note, '') not ilike 'AUSFALL%') as meetings
        from generate_series(2015, extract(year from today)::int) y(y)
      ) r), '[]'::jsonb),
    -- Vorjahresvergleich: Abwesenheiten der letzten drei Jahre jeweils nach genauso vielen Abenden, wie das laufende Jahr bisher hat.
    -- Bis zum Datum des n-ten Abends des jeweiligen Jahres (hat ein Jahr weniger Abende, zählen alle).
    'absences_same_point', coalesce((
      select jsonb_agg(to_jsonb(r) order by r.year)
      from (
        select y.y as year, c.n as meetings,
               (select count(*) from public.entries e
                 where e.cancelled_at is null and e.category in ('Abwesenheit (1x)', 'Abwesenheit unentschuldigt')
                   and extract(year from e.entry_date) = y.y and e.entry_date <= c.cutoff) as absences
        from generate_series(extract(year from today)::int - 2, extract(year from today)::int) y(y)
        cross join lateral (
          select count(*) n, max(q.meeting_date) cutoff
          from (select mt.meeting_date, row_number() over (order by mt.meeting_date) rn
                from public.meetings mt
                where extract(year from mt.meeting_date) = y.y and mt.meeting_date < today and coalesce(mt.note, '') not ilike 'AUSFALL%') q
          where q.rn <= (select count(*) from public.meetings m2
                         where extract(year from m2.meeting_date) = extract(year from today) and m2.meeting_date < today and coalesce(m2.note, '') not ilike 'AUSFALL%')
        ) c
      ) r), '[]'::jsonb)
  );
end
$function$;

revoke all on function public.app_stats(text) from public;
grant execute on function public.app_stats(text) to anon, authenticated;

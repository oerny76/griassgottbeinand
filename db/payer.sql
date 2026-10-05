-- Stellvertretendes Zahlen: Ein Mitglied ohne PayPal kann ein anderes Mitglied als Zahler hinterlegen.
-- Der Zahler sieht dann die offenen Posten des Mitglieds und bekommt einen eigenen PayPal-Knopf (nur solange etwas offen ist).
-- Einrichten (Ausnahmefall, direkt per SQL):
--   update public.members set payer_id = (select id from public.members where name = 'ZAHLER') where name = 'MITGLIED OHNE PAYPAL';
-- Wieder entfernen:
--   update public.members set payer_id = null where name = 'MITGLIED OHNE PAYPAL';
alter table public.members add column if not exists payer_id uuid references public.members(id) on delete set null;
alter table public.members drop constraint if exists members_payer_not_self;
alter table public.members add constraint members_payer_not_self check (payer_id is null or payer_id <> id);

-- Neuer Schlüssel "covered_open" im Dashboard: Liste der Mitglieder, für die ich zahle und die etwas offen haben.
create or replace function public._dashboard_json(me members)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare reg public.meetings; today date := public._today(); tot numeric; yr int := extract(year from public._today());
begin
  select * into reg from public.meetings where meeting_date >= today order by meeting_date limit 1;
  select coalesce(sum(amount - paid), 0) into tot from public.entries where member_id = me.id and cancelled_at is null and amount - paid > 0;
  return jsonb_build_object(
    'me', public._me_json(me),
    'meeting', case when reg.id is null then null else jsonb_build_object(
      'date', reg.meeting_date,
      'chair', (select name from public.members where id = reg.chair_id),
      'location', (select jsonb_build_object('name', l.name, 'street', l.street, 'zip', l.zip, 'city', l.city, 'url', l.url) from public.locations l where l.id = reg.location_id),
      'deadline_passed', public._deadline_passed(reg.meeting_date)) end,
    'absent', coalesce((select jsonb_agg(m.name order by m.name) from public.entries e join public.members m on m.id = e.member_id
        where e.meeting_id = reg.id and e.cancelled_at is null and e.category in ('Abwesenheit (1x)','Abwesenheit unentschuldigt')), '[]'::jsonb),
    'guests', coalesce((select jsonb_agg(jsonb_build_object('guest', e.subcategory, 'host', m.name) order by m.name) from public.entries e join public.members m on m.id = e.member_id
        where e.meeting_id = reg.id and e.cancelled_at is null and e.category in ('Gastbeitrag','Gast unangemeldet')), '[]'::jsonb),
    'my_absent', exists(select 1 from public.entries e where e.meeting_id = reg.id and e.member_id = me.id and e.cancelled_at is null and e.category in ('Abwesenheit (1x)','Abwesenheit unentschuldigt')),
    'my_guests', coalesce((select jsonb_agg(e.subcategory) from public.entries e where e.meeting_id = reg.id and e.member_id = me.id and e.cancelled_at is null and e.category in ('Gastbeitrag','Gast unangemeldet')), '[]'::jsonb),
    'absences_year', jsonb_build_object('year', yr, 'list', coalesce((
        select jsonb_agg(jsonb_build_object('name', m.name, 'count', coalesce(c.n, 0)) order by coalesce(c.n, 0) desc, m.name)
        from public.members m
        left join (select member_id, count(*) n from public.entries
                   where cancelled_at is null and category in ('Abwesenheit (1x)','Abwesenheit unentschuldigt') and extract(year from entry_date) = yr group by member_id) c on c.member_id = m.id
        where m.kind = 'member'), '[]'::jsonb)),
    'birthday', (select jsonb_build_object('name', b.name, 'date', b.nd, 'turns', extract(year from age(b.nd, b.birth_date))::int)
        from (select m.name, m.birth_date,
                case when make_date(extract(year from today)::int, extract(month from m.birth_date)::int, extract(day from m.birth_date)::int) >= today
                     then make_date(extract(year from today)::int, extract(month from m.birth_date)::int, extract(day from m.birth_date)::int)
                     else make_date(extract(year from today)::int + 1, extract(month from m.birth_date)::int, extract(day from m.birth_date)::int) end as nd
              from public.members m where m.kind = 'member' and m.birth_date is not null) b order by b.nd limit 1),
    'budget', jsonb_build_object(
        'paypal', (select coalesce(sum(amount), 0) from public.paypal_payments where money_pool is null),
        'outstanding', (select coalesce(sum(amount - paid), 0) from public.entries where cancelled_at is null)),
    'my_open', jsonb_build_object(
        'total', tot,
        'paypal_url', case when tot > 0 then 'https://paypal.me/griassgott/' || round(tot, 2)::text || 'EUR' end,
        'items', coalesce((select jsonb_agg(jsonb_build_object('date', entry_date, 'category', category, 'sub', subcategory, 'open', amount - paid) order by entry_date desc)
                 from public.entries where member_id = me.id and cancelled_at is null and amount - paid > 0), '[]'::jsonb)),
    'covered_open', coalesce((
        select jsonb_agg(jsonb_build_object(
            'name', c.name,
            'total', c.tot,
            'paypal_url', 'https://paypal.me/griassgott/' || round(c.tot, 2)::text || 'EUR',
            'items', c.items) order by c.name)
        from (select m.name,
                     sum(e.amount - e.paid) tot,
                     jsonb_agg(jsonb_build_object('date', e.entry_date, 'category', e.category, 'sub', e.subcategory, 'open', e.amount - e.paid) order by e.entry_date desc) items
              from public.members m
              join public.entries e on e.member_id = m.id and e.cancelled_at is null and e.amount - e.paid > 0
              where m.payer_id = me.id
              group by m.id, m.name) c), '[]'::jsonb)
  );
end $function$;

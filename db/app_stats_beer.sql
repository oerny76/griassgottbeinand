-- Gruppenauswertung der Biere (Statistik-Tab). Quelle: beer_counts, die Mitglieder am Stammtisch freiwillig zählen lassen (db/deckel.sql).
-- Es gehen nur Summen heraus, nie Einzelwerte oder Namen. Abende mit weniger als 5 zählenden Mitgliedern werden ausgelassen,
-- damit sich niemand herausrechnen lässt. Jedes Mitglied mit gültigem Code darf lesen.
create or replace function public.app_stats_beer(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  me public.members := public._auth_member(p_token);
  k constant int := 5;
begin
  return jsonb_build_object(
    'min_group', k,
    'evenings', coalesce((
      select jsonb_agg(jsonb_build_object('date', e.d, 'beers', e.b, 'people', e.p) order by e.d)
      from (select meeting_date d, sum(beers)::int b, count(*)::int p from public.beer_counts group by meeting_date having count(*) >= k order by meeting_date desc limit 24) e), '[]'::jsonb),
    'years', coalesce((
      select jsonb_agg(jsonb_build_object('year', y.yr, 'beers', y.b, 'evenings', y.n, 'people', y.p) order by y.yr)
      from (select extract(year from d)::int yr, sum(b)::int b, count(*)::int n, sum(p)::int p
            from (select meeting_date d, sum(beers) b, count(*) p from public.beer_counts group by meeting_date having count(*) >= k) q
            group by 1) y), '[]'::jsonb)
  );
end
$function$;

revoke all on function public.app_stats_beer(text) from public;
grant execute on function public.app_stats_beer(text) to anon, authenticated;

-- Anträge mit Auswahl: neben Ja/Nein gibt es Anträge mit 2 bis 6 Optionen (Einzel- oder Mehrfachauswahl).
-- Stimme bei Auswahl: choice = 'pick' (mit gewählten Optionen in motion_vote_options) oder 'abstain'. Bei Ja/Nein bleibt alles wie in motions.sql.
-- Abschluss wie bisher (alle abgestimmt oder 7 Tage). Auswahl-Ergebnis: result = 'winner' (eine Option hat die meisten Stimmen) oder 'tie' (Gleichstand oder keine Stimme).
-- Die Hinweise "rechnerisch angenommen/abgelehnt" bei Ja/Nein während der Laufzeit berechnet die App aus den Zahlen (motions.js).
alter table public.motions add column if not exists kind text not null default 'yesno';
alter table public.motions add column if not exists multi boolean not null default false;
alter table public.motions drop constraint if exists motions_kind_check;
alter table public.motions add constraint motions_kind_check check (kind in ('yesno', 'choice'));
alter table public.motions drop constraint if exists motions_result_check;
alter table public.motions add constraint motions_result_check check (result in ('accepted', 'rejected', 'tie', 'winner'));
alter table public.motion_votes drop constraint if exists motion_votes_choice_check;
alter table public.motion_votes add constraint motion_votes_choice_check check (choice in ('yes', 'no', 'abstain', 'pick'));

create table if not exists public.motion_options (
  id uuid primary key default gen_random_uuid(),
  motion_id uuid not null references public.motions(id) on delete cascade,
  position int not null check (position between 1 and 6),
  label text not null check (char_length(label) between 1 and 60),
  unique (motion_id, position)
);
alter table public.motion_options enable row level security;
revoke all on public.motion_options from anon, authenticated;

create table if not exists public.motion_vote_options (
  motion_id uuid not null,
  member_id uuid not null,
  option_id uuid not null references public.motion_options(id) on delete cascade,
  primary key (motion_id, member_id, option_id),
  foreign key (motion_id, member_id) references public.motion_votes(motion_id, member_id) on delete cascade
);
alter table public.motion_vote_options enable row level security;
revoke all on public.motion_vote_options from anon, authenticated;

create or replace function public._motion_close(p_id uuid)
returns void language plpgsql security definer set search_path to 'public' as $function$
declare m public.motions; y int; n int; a int; res text; label text; top int; winners text[];
begin
  select * into m from public.motions where id = p_id for update;
  if m.id is null or m.closed_at is not null then return; end if;
  if m.kind = 'choice' then
    select coalesce(max(c), 0) into top from (
      select count(vo.option_id) c from public.motion_options o left join public.motion_vote_options vo on vo.option_id = o.id
      where o.motion_id = p_id group by o.id) x;
    select coalesce(array_agg(o.label order by o.position), '{}') into winners from public.motion_options o
      where o.motion_id = p_id and top > 0 and (select count(*) from public.motion_vote_options vo where vo.option_id = o.id) = top;
    res := case when cardinality(winners) = 1 then 'winner' else 'tie' end;
    update public.motions set closed_at = now(), result = res where id = p_id;
    label := case when res = 'winner' then winners[1] || ' (' || top || ' Stimme' || case when top = 1 then '' else 'n' end || ')'
                  when top = 0 then 'Keine Option gewählt' else 'Gleichstand: ' || array_to_string(winners, ', ') end;
    perform public._push_send(jsonb_build_array(jsonb_build_object('title', 'Antrag abgeschlossen', 'body', m.title || ': ' || label)));
    return;
  end if;
  select count(*) filter (where choice = 'yes'), count(*) filter (where choice = 'no'), count(*) filter (where choice = 'abstain')
    into y, n, a from public.motion_votes where motion_id = p_id;
  res := case when y > n then 'accepted' when n > y then 'rejected' else 'tie' end;
  update public.motions set closed_at = now(), result = res where id = p_id;
  label := case res when 'accepted' then 'Angenommen' when 'rejected' then 'Abgelehnt' else 'Unentschieden, nicht angenommen' end;
  perform public._push_send(jsonb_build_array(jsonb_build_object(
    'title', 'Antrag abgeschlossen',
    'body', label || ': ' || m.title || ' (' || y || ' Ja, ' || n || ' Nein, ' || a || ' Enthaltung' || case when a = 1 then '' else 'en' end || ')')));
end $function$;

create or replace function public._motion_json(m public.motions, me public.members)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $function$
declare base jsonb;
begin
  select jsonb_build_object(
    'id', m.id, 'title', m.title, 'body', m.body, 'author', a.name, 'mine', m.author_id = me.id, 'kind', m.kind, 'multi', m.multi,
    'created_at', m.created_at, 'ends_at', m.ends_at, 'closed_at', m.closed_at, 'result', m.result,
    'yes', count(*) filter (where v.choice = 'yes'), 'no', count(*) filter (where v.choice = 'no'),
    'abstain', count(*) filter (where v.choice = 'abstain'), 'voted', count(*) filter (where v.choice is not null),
    'total', count(*) filter (where mb.kind = 'member' or v.choice is not null),
    'my_choice', max(v.choice) filter (where v.member_id = me.id),
    'can_vote', m.closed_at is null and bool_or(v.member_id = me.id and v.choice is null)) into base
  from public.members a, public.motion_votes v join public.members mb on mb.id = v.member_id
  where a.id = m.author_id and v.motion_id = m.id
  group by a.name;
  return base || jsonb_build_object(
    'options', coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'label', o.label,
        'count', (select count(*) from public.motion_vote_options vo where vo.option_id = o.id)) order by o.position)
        from public.motion_options o where o.motion_id = m.id), '[]'::jsonb),
    'my_picks', coalesce((select jsonb_agg(vo.option_id) from public.motion_vote_options vo where vo.motion_id = m.id and vo.member_id = me.id), '[]'::jsonb));
end $function$;
revoke all on function public._motion_json(public.motions, public.members) from public, anon, authenticated;

create or replace function public.app_motion_list(p_token text, p_query text default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare me public.members := public._auth_member(p_token); q text := nullif(btrim(coalesce(p_query, '')), '');
begin
  perform public._motion_close_expired();
  return coalesce((select jsonb_agg(public._motion_json(m, me) order by (m.closed_at is not null), case when m.closed_at is null then m.ends_at end, m.closed_at desc)
    from (select * from public.motions mo
          where q is null or mo.search @@ websearch_to_tsquery('german', q) or position(lower(q) in lower(mo.title)) > 0 or position(lower(q) in lower(mo.body)) > 0
             or exists (select 1 from public.motion_options o where o.motion_id = mo.id and position(lower(q) in lower(o.label)) > 0)
          limit 300) m), '[]'::jsonb);
end $function$;

create or replace function public.app_motion_get(p_token text, p_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare me public.members := public._auth_member(p_token); m public.motions;
begin
  perform public._motion_close_expired();
  select * into m from public.motions where id = p_id;
  if m.id is null then raise exception 'Antrag nicht gefunden' using errcode = 'P0002'; end if;
  return public._motion_json(m, me) || jsonb_build_object(
    'options', coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'label', o.label,
        'count', (select count(*) from public.motion_vote_options vo where vo.option_id = o.id),
        'voters', coalesce((select jsonb_agg(mb.name order by mb.name) from public.motion_vote_options vo join public.members mb on mb.id = vo.member_id where vo.option_id = o.id), '[]'::jsonb)) order by o.position)
        from public.motion_options o where o.motion_id = m.id), '[]'::jsonb),
    'votes', coalesce((
      select jsonb_agg(jsonb_build_object('name', mb.name, 'choice', v.choice, 'voted_at', v.voted_at) order by (v.choice is null), v.voted_at, mb.name)
      from public.motion_votes v join public.members mb on mb.id = v.member_id where v.motion_id = m.id), '[]'::jsonb));
end $function$;

drop function if exists public.app_motion_create(text, text, text);
create or replace function public.app_motion_create(p_token text, p_title text, p_body text, p_kind text default 'yesno',
  p_multi boolean default false, p_options text[] default null, p_picks int[] default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare me public.members := public._auth_member(p_token); t text := btrim(coalesce(p_title, '')); b text := btrim(coalesce(p_body, '')); m public.motions;
  opts text[]; n int := 0; multi boolean := coalesce(p_multi, false);
begin
  if me.kind <> 'member' then raise exception 'Nicht berechtigt' using errcode = '42501'; end if;
  if p_kind not in ('yesno', 'choice') then raise exception 'Ungueltige Art' using errcode = '22023'; end if;
  if char_length(t) not between 1 and 100 or char_length(b) not between 1 and 2000 then raise exception 'Titel (bis 100 Zeichen) und Text (bis 2000 Zeichen) sind Pflicht' using errcode = '22023'; end if;
  if p_kind = 'choice' then
    select coalesce(array_agg(btrim(x) order by ord), '{}') into opts from unnest(coalesce(p_options, '{}')) with ordinality as u(x, ord) where btrim(x) <> '';
    n := cardinality(opts);
    if n < 2 or n > 6 then raise exception 'Bitte 2 bis 6 Optionen angeben' using errcode = '22023'; end if;
    if exists (select 1 from unnest(opts) o where char_length(o) > 60) then raise exception 'Eine Option darf höchstens 60 Zeichen haben' using errcode = '22023'; end if;
    if (select count(distinct lower(o)) from unnest(opts) o) <> n then raise exception 'Die Optionen müssen sich unterscheiden' using errcode = '22023'; end if;
    if p_picks is null or cardinality(p_picks) = 0 or (not multi and cardinality(p_picks) <> 1)
       or exists (select 1 from unnest(p_picks) x where x < 1 or x > n) or (select count(distinct x) from unnest(p_picks) x) <> cardinality(p_picks) then
      raise exception 'Bitte deine eigene Wahl treffen' using errcode = '22023'; end if;
  else
    multi := false;
  end if;
  perform public._motion_close_expired();
  if (select count(*) from public.motions where author_id = me.id and closed_at is null) >= 3 then
    raise exception 'Du hast schon 3 offene Antraege' using errcode = '22023'; end if;
  insert into public.motions(author_id, title, body, kind, multi) values (me.id, t, b, p_kind, multi) returning * into m;
  if p_kind = 'choice' then
    insert into public.motion_options(motion_id, position, label) select m.id, ord, x from unnest(opts) with ordinality as u(x, ord);
  end if;
  insert into public.motion_votes(motion_id, member_id, choice, voted_at)
    select m.id, mb.id, case when mb.id = me.id then (case when p_kind = 'choice' then 'pick' else 'yes' end) end, case when mb.id = me.id then now() end
    from public.members mb where mb.kind = 'member';
  if p_kind = 'choice' then
    insert into public.motion_vote_options(motion_id, member_id, option_id)
      select m.id, me.id, o.id from public.motion_options o where o.motion_id = m.id and o.position = any (p_picks);
  end if;
  perform public._push_send((select coalesce(jsonb_agg(jsonb_build_object('member_id', mb.id, 'title', 'Neuer Antrag',
      'body', me.name || ': ' || t)), '[]'::jsonb) from public.members mb where mb.kind = 'member' and mb.id <> me.id));
  return public._motion_json(m, me);
end $function$;

drop function if exists public.app_motion_vote(text, uuid, text);
create or replace function public.app_motion_vote(p_token text, p_id uuid, p_choice text, p_options uuid[] default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare me public.members := public._auth_member(p_token); m public.motions;
begin
  select * into m from public.motions where id = p_id for update;
  if m.id is null then raise exception 'Antrag nicht gefunden' using errcode = 'P0002'; end if;
  if m.kind = 'yesno' and p_choice not in ('yes', 'no', 'abstain') then raise exception 'Ungueltige Stimme' using errcode = '22023'; end if;
  if m.kind = 'choice' then
    if p_choice not in ('pick', 'abstain') then raise exception 'Ungueltige Stimme' using errcode = '22023'; end if;
    if p_choice = 'pick' and (p_options is null or cardinality(p_options) = 0 or (not m.multi and cardinality(p_options) <> 1)
       or (select count(distinct x) from unnest(p_options) x) <> cardinality(p_options)
       or (select count(*) from public.motion_options where motion_id = m.id and id = any (p_options)) <> cardinality(p_options)) then
      raise exception 'Bitte %', case when m.multi then 'mindestens eine Option waehlen' else 'genau eine Option waehlen' end using errcode = '22023'; end if;
  end if;
  if m.closed_at is not null or m.ends_at <= now() then
    perform public._motion_close(m.id);
    raise exception 'Die Abstimmung ist beendet' using errcode = '22023'; end if;
  update public.motion_votes set choice = p_choice, voted_at = now() where motion_id = m.id and member_id = me.id and choice is null;
  if not found then raise exception 'Du hast schon abgestimmt oder bist nicht stimmberechtigt' using errcode = '22023'; end if;
  if m.kind = 'choice' and p_choice = 'pick' then
    insert into public.motion_vote_options(motion_id, member_id, option_id) select m.id, me.id, x from unnest(p_options) x;
  end if;
  if not exists (select 1 from public.motion_votes v join public.members mb on mb.id = v.member_id
                 where v.motion_id = m.id and v.choice is null and mb.kind = 'member') then
    perform public._motion_close(m.id);
  end if;
  select * into m from public.motions where id = p_id;
  return public._motion_json(m, me);
end $function$;

revoke all on function public.app_motion_list(text, text), public.app_motion_get(text, uuid),
  public.app_motion_create(text, text, text, text, boolean, text[], int[]), public.app_motion_vote(text, uuid, text, uuid[]) from public;
grant execute on function public.app_motion_list(text, text), public.app_motion_get(text, uuid),
  public.app_motion_create(text, text, text, text, boolean, text[], int[]), public.app_motion_vote(text, uuid, text, uuid[]) to anon, authenticated;

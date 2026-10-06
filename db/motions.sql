-- Abstimmungen: Mitglieder stellen Anträge, alle stimmen innerhalb von 7 Tagen ab (Zustimmung, Ablehnung, Enthaltung).
-- Regeln: Antragsteller stimmt automatisch zu. Stimmen sind final und namentlich sichtbar. Abschluss, sobald alle abgestimmt haben
-- oder die 7 Tage um sind. Wertung: einfache Mehrheit der Ja/Nein-Stimmen (Enthaltungen und Nichtabstimmende zählen nicht), Gleichstand = nicht angenommen.
-- Stimmberechtigt sind die Mitglieder (kind = 'member') zum Zeitpunkt des Antrags. Anträge werden nie bearbeitet, nur der Admin kann löschen.
-- Lesen und Schreiben nur über die Funktionen mit Token. Push über public._push_send (siehe push.sql).
create table if not exists public.motions (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.members(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 100),
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now(),
  ends_at timestamptz not null default now() + interval '7 days',
  closed_at timestamptz,
  result text check (result in ('accepted', 'rejected', 'tie')),
  reminded boolean not null default false,
  search tsvector generated always as (to_tsvector('german', title || ' ' || body)) stored
);
create index if not exists motions_search_idx on public.motions using gin (search);
alter table public.motions enable row level security;
revoke all on public.motions from anon, authenticated;

create table if not exists public.motion_votes (
  motion_id uuid not null references public.motions(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  choice text check (choice in ('yes', 'no', 'abstain')),
  voted_at timestamptz,
  primary key (motion_id, member_id)
);
alter table public.motion_votes enable row level security;
revoke all on public.motion_votes from anon, authenticated;

-- Antrag abschließen: Ergebnis berechnen und alle benachrichtigen. Mehrfachaufruf ist harmlos.
create or replace function public._motion_close(p_id uuid)
returns void language plpgsql security definer set search_path to 'public' as $function$
declare m public.motions; y int; n int; a int; res text; label text;
begin
  select * into m from public.motions where id = p_id for update;
  if m.id is null or m.closed_at is not null then return; end if;
  select count(*) filter (where choice = 'yes'), count(*) filter (where choice = 'no'), count(*) filter (where choice = 'abstain')
    into y, n, a from public.motion_votes where motion_id = p_id;
  res := case when y > n then 'accepted' when n > y then 'rejected' else 'tie' end;
  update public.motions set closed_at = now(), result = res where id = p_id;
  label := case res when 'accepted' then 'Angenommen' when 'rejected' then 'Abgelehnt' else 'Unentschieden, nicht angenommen' end;
  perform public._push_send(jsonb_build_array(jsonb_build_object(
    'title', 'Abstimmung beendet',
    'body', label || ': ' || m.title || ' (' || y || ' Ja, ' || n || ' Nein, ' || a || ' Enthaltung' || case when a = 1 then '' else 'en' end || ')')));
end $function$;
revoke all on function public._motion_close(uuid) from public, anon, authenticated;

-- Abgelaufene Anträge schließen und 24 Stunden vor Ablauf an alle erinnern, die noch nicht abgestimmt haben.
create or replace function public._motion_close_expired()
returns void language plpgsql security definer set search_path to 'public' as $function$
declare r record; msgs jsonb;
begin
  for r in select id from public.motions where closed_at is null and ends_at <= now() loop
    perform public._motion_close(r.id);
  end loop;
  for r in select id, title, ends_at from public.motions where closed_at is null and not reminded and ends_at - now() <= interval '24 hours' loop
    update public.motions set reminded = true where id = r.id;
    select coalesce(jsonb_agg(jsonb_build_object('member_id', v.member_id, 'title', 'Abstimmung endet bald',
        'body', 'Noch nicht abgestimmt: ' || r.title)), '[]'::jsonb) into msgs
    from public.motion_votes v join public.members mb on mb.id = v.member_id
    where v.motion_id = r.id and v.choice is null and mb.kind = 'member';
    perform public._push_send(msgs);
  end loop;
end $function$;
revoke all on function public._motion_close_expired() from public, anon, authenticated;

select cron.unschedule('motions_close_expired') where exists (select 1 from cron.job where jobname = 'motions_close_expired');
select cron.schedule('motions_close_expired', '0 * * * *', 'select public._motion_close_expired()');

create or replace function public._motion_json(m public.motions, me public.members)
returns jsonb language sql stable security definer set search_path to 'public' as $function$
  select jsonb_build_object(
    'id', m.id, 'title', m.title, 'body', m.body, 'author', a.name, 'mine', m.author_id = me.id,
    'created_at', m.created_at, 'ends_at', m.ends_at, 'closed_at', m.closed_at, 'result', m.result,
    'yes', count(*) filter (where v.choice = 'yes'), 'no', count(*) filter (where v.choice = 'no'),
    'abstain', count(*) filter (where v.choice = 'abstain'), 'voted', count(*) filter (where v.choice is not null),
    'total', count(*) filter (where mb.kind = 'member' or v.choice is not null),
    'my_choice', max(v.choice) filter (where v.member_id = me.id),
    'can_vote', m.closed_at is null and bool_or(v.member_id = me.id and v.choice is null))
  from public.members a, public.motion_votes v join public.members mb on mb.id = v.member_id
  where a.id = m.author_id and v.motion_id = m.id
  group by a.name
$function$;
revoke all on function public._motion_json(public.motions, public.members) from public, anon, authenticated;

create or replace function public.app_motion_list(p_token text, p_query text default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare me public.members := public._auth_member(p_token); q text := nullif(btrim(coalesce(p_query, '')), '');
begin
  perform public._motion_close_expired();
  return coalesce((select jsonb_agg(public._motion_json(m, me) order by (m.closed_at is not null), case when m.closed_at is null then m.ends_at end, m.closed_at desc)
    from (select * from public.motions mo
          where q is null or mo.search @@ websearch_to_tsquery('german', q) or position(lower(q) in lower(mo.title)) > 0 or position(lower(q) in lower(mo.body)) > 0
          limit 300) m), '[]'::jsonb);
end $function$;

-- Zahlen fürs Dashboard und den Reiter: open = alle offenen Anträge, mine = offene, bei denen ich noch abstimmen muss.
create or replace function public.app_motion_counts(p_token text)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare me public.members := public._auth_member(p_token);
begin
  perform public._motion_close_expired();
  return jsonb_build_object(
    'open', (select count(*) from public.motions where closed_at is null),
    'mine', (select count(*) from public.motion_votes v join public.motions m on m.id = v.motion_id
             where v.member_id = me.id and v.choice is null and m.closed_at is null));
end $function$;

create or replace function public.app_motion_get(p_token text, p_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare me public.members := public._auth_member(p_token); m public.motions;
begin
  perform public._motion_close_expired();
  select * into m from public.motions where id = p_id;
  if m.id is null then raise exception 'Antrag nicht gefunden' using errcode = 'P0002'; end if;
  return public._motion_json(m, me) || jsonb_build_object('votes', coalesce((
    select jsonb_agg(jsonb_build_object('name', mb.name, 'choice', v.choice, 'voted_at', v.voted_at)
                     order by (v.choice is null), v.voted_at, mb.name)
    from public.motion_votes v join public.members mb on mb.id = v.member_id where v.motion_id = m.id), '[]'::jsonb));
end $function$;

create or replace function public.app_motion_create(p_token text, p_title text, p_body text)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare me public.members := public._auth_member(p_token); t text := btrim(coalesce(p_title, '')); b text := btrim(coalesce(p_body, '')); m public.motions;
begin
  if me.kind <> 'member' then raise exception 'Nicht berechtigt' using errcode = '42501'; end if;
  if char_length(t) not between 1 and 100 or char_length(b) not between 1 and 2000 then raise exception 'Titel (bis 100 Zeichen) und Text (bis 2000 Zeichen) sind Pflicht' using errcode = '22023'; end if;
  perform public._motion_close_expired();
  if (select count(*) from public.motions where author_id = me.id and closed_at is null) >= 3 then
    raise exception 'Du hast schon 3 offene Antraege' using errcode = '22023'; end if;
  insert into public.motions(author_id, title, body) values (me.id, t, b) returning * into m;
  insert into public.motion_votes(motion_id, member_id, choice, voted_at)
    select m.id, mb.id, case when mb.id = me.id then 'yes' end, case when mb.id = me.id then now() end from public.members mb where mb.kind = 'member';
  perform public._push_send((select coalesce(jsonb_agg(jsonb_build_object('member_id', mb.id, 'title', 'Neuer Antrag',
      'body', me.name || ': ' || t)), '[]'::jsonb) from public.members mb where mb.kind = 'member' and mb.id <> me.id));
  return public._motion_json(m, me);
end $function$;

create or replace function public.app_motion_vote(p_token text, p_id uuid, p_choice text)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare me public.members := public._auth_member(p_token); m public.motions;
begin
  if p_choice not in ('yes', 'no', 'abstain') then raise exception 'Ungueltige Stimme' using errcode = '22023'; end if;
  select * into m from public.motions where id = p_id for update;
  if m.id is null then raise exception 'Antrag nicht gefunden' using errcode = 'P0002'; end if;
  if m.closed_at is not null or m.ends_at <= now() then
    perform public._motion_close(m.id);
    raise exception 'Die Abstimmung ist beendet' using errcode = '22023'; end if;
  update public.motion_votes set choice = p_choice, voted_at = now() where motion_id = m.id and member_id = me.id and choice is null;
  if not found then raise exception 'Du hast schon abgestimmt oder bist nicht stimmberechtigt' using errcode = '22023'; end if;
  if not exists (select 1 from public.motion_votes v join public.members mb on mb.id = v.member_id
                 where v.motion_id = m.id and v.choice is null and mb.kind = 'member') then
    perform public._motion_close(m.id);
  end if;
  select * into m from public.motions where id = p_id;
  return public._motion_json(m, me);
end $function$;

create or replace function public.app_motion_delete(p_token text, p_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare me public.members := public._auth_member(p_token);
begin
  if not me.is_admin then raise exception 'Nicht berechtigt' using errcode = '42501'; end if;
  delete from public.motions where id = p_id;
  return jsonb_build_object('ok', true);
end $function$;

revoke all on function public.app_motion_list(text, text), public.app_motion_counts(text), public.app_motion_get(text, uuid),
  public.app_motion_create(text, text, text), public.app_motion_vote(text, uuid, text), public.app_motion_delete(text, uuid) from public;
grant execute on function public.app_motion_list(text, text), public.app_motion_counts(text), public.app_motion_get(text, uuid),
  public.app_motion_create(text, text, text), public.app_motion_vote(text, uuid, text), public.app_motion_delete(text, uuid) to anon, authenticated;

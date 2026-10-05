-- Virtueller Bierdeckel, Phase 2: das Deckelbuch (abgerechnete Deckel) liegt in der Datenbank.
-- Nur das Mitglied selbst kann seine Deckel lesen, speichern und löschen (Funktionen mit Token, kein direkter Tabellenzugriff).
-- Der laufende Deckel bleibt weiter lokal im Browser (Empfang im Wirtshaus).
create table if not exists public.deckel_tabs (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete cascade,
  client_id text,
  tab_date date not null,
  location text,
  total numeric(8,2) not null default 0,
  units_no_price int not null default 0,
  beers int not null default 0,
  nonalc int not null default 0,
  created_at timestamptz not null default now(),
  unique (member_id, client_id)
);
create table if not exists public.deckel_items (
  id uuid primary key default gen_random_uuid(),
  tab_id uuid not null references public.deckel_tabs(id) on delete cascade,
  label text not null check (char_length(label) between 1 and 60),
  category text not null check (category in ('beer','nonalc','soft','food','other')),
  qty int not null check (qty between 1 and 99),
  unit_price numeric(7,2) check (unit_price is null or unit_price >= 0),
  pos int not null default 0
);
create index if not exists deckel_tabs_member_idx on public.deckel_tabs (member_id, tab_date desc);
create index if not exists deckel_items_tab_idx on public.deckel_items (tab_id);
alter table public.deckel_tabs enable row level security;
alter table public.deckel_items enable row level security;
revoke all on public.deckel_tabs, public.deckel_items from anon, authenticated;

-- Deckel speichern. p_client_id macht das Speichern wiederholbar (kein Doppeleintrag bei erneutem Senden).
create or replace function public.app_deckel_save(p_token text, p_date date, p_location text, p_items jsonb, p_client_id text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare me public.members := public._auth_member(p_token); v_id uuid; it jsonb; n int := 0; v_total numeric := 0; v_nop int := 0; v_beer int := 0; v_na int := 0;
  v_label text; v_cat text; v_qty int; v_price numeric;
begin
  if p_date is null or p_date > public._today() then raise exception 'Ungueltiges Datum' using errcode = '22023'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 or jsonb_array_length(p_items) > 100 then
    raise exception 'Bitte 1 bis 100 Posten' using errcode = '22023'; end if;
  if p_client_id is not null then
    select id into v_id from public.deckel_tabs where member_id = me.id and client_id = p_client_id;
    if v_id is not null then return jsonb_build_object('id', v_id, 'duplicate', true); end if;
  end if;
  insert into public.deckel_tabs(member_id, client_id, tab_date, location) values (me.id, p_client_id, p_date, nullif(left(trim(coalesce(p_location, '')), 120), '')) returning id into v_id;
  for it in select * from jsonb_array_elements(p_items) loop
    v_label := left(trim(coalesce(it->>'label', '')), 60);
    v_cat := coalesce(it->>'cat', 'other');
    v_qty := (it->>'qty')::int;
    v_price := nullif(it->>'price', '')::numeric;
    if v_label = '' or v_cat not in ('beer','nonalc','soft','food','other') or v_qty is null or v_qty < 1 or v_qty > 99 or (v_price is not null and (v_price < 0 or v_price >= 1000)) then
      raise exception 'Ungueltiger Posten' using errcode = '22023'; end if;
    insert into public.deckel_items(tab_id, label, category, qty, unit_price, pos) values (v_id, v_label, v_cat, v_qty, v_price, n);
    n := n + 1;
    if v_price is null then v_nop := v_nop + v_qty; else v_total := v_total + v_qty * v_price; end if;
    if v_cat = 'beer' then v_beer := v_beer + v_qty; elsif v_cat = 'nonalc' then v_na := v_na + v_qty; end if;
  end loop;
  update public.deckel_tabs set total = v_total, units_no_price = v_nop, beers = v_beer, nonalc = v_na where id = v_id;
  return jsonb_build_object('id', v_id);
end $function$;

-- Eigenes Deckelbuch, neueste zuerst (höchstens 200).
create or replace function public.app_deckel_history(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare me public.members := public._auth_member(p_token);
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', t.id, 'date', t.tab_date, 'location', t.location, 'total', t.total, 'no_price', t.units_no_price, 'beers', t.beers, 'nonalc', t.nonalc,
      'items', (select coalesce(jsonb_agg(jsonb_build_object('label', i.label, 'cat', i.category, 'qty', i.qty, 'price', i.unit_price) order by i.pos), '[]'::jsonb) from public.deckel_items i where i.tab_id = t.id))
      order by t.tab_date desc, t.created_at desc)
    from (select * from public.deckel_tabs where member_id = me.id order by tab_date desc, created_at desc limit 200) t), '[]'::jsonb);
end $function$;

create or replace function public.app_deckel_delete(p_token text, p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare me public.members := public._auth_member(p_token);
begin
  delete from public.deckel_tabs where id = p_id and member_id = me.id;
  return jsonb_build_object('ok', true);
end $function$;

revoke all on function public.app_deckel_save(text, date, text, jsonb, text) from public;
revoke all on function public.app_deckel_history(text) from public;
revoke all on function public.app_deckel_delete(text, uuid) from public;
grant execute on function public.app_deckel_save(text, date, text, jsonb, text) to anon, authenticated;
grant execute on function public.app_deckel_history(text) to anon, authenticated;
grant execute on function public.app_deckel_delete(text, uuid) to anon, authenticated;

-- PayPal-Zahlungsausgang (Geld gesendet) buchen.
-- Offene Posten für Ausgänge = Einträge mit amount - paid < 0; "open" wird als positiver Betrag geliefert.
drop function if exists public.app_admin_open_items(text, text);

create or replace function public.app_admin_open_items(p_token text, p_member text, p_out boolean default false)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
begin
  perform public._auth_admin(p_token);
  return (select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'date', e.entry_date, 'category', e.category, 'sub', e.subcategory,
            'amount', e.amount, 'paid', e.paid, 'open', case when p_out then e.paid - e.amount else e.amount - e.paid end)
            order by e.entry_date, e.created_at), '[]'::jsonb)
          from public.entries e join public.members m on m.id = e.member_id
          where m.name = p_member and e.cancelled_at is null
            and case when p_out then e.amount - e.paid < 0 else e.amount - e.paid > 0 end);
end $$;

-- p_amount und alle Teilbeträge in p_allocs sind positive Beträge (Betrag, der ausgezahlt wurde).
create or replace function public.app_admin_book_payout(p_token text, p_tx_code text, p_tx_date date, p_message text,
  p_amount numeric, p_member text, p_allocs jsonb)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  mem public.members; v_code text := trim(coalesce(p_tx_code, ''));
  v_pay uuid; a jsonb; v_sum numeric := 0; v_amt numeric; ent public.entries; v_new uuid; v_cat text; v_n int := 0;
begin
  perform public._auth_admin(p_token);
  if p_amount is null or p_amount <= 0 then raise exception 'Betrag muss positiv sein' using errcode = '22023'; end if;
  if length(v_code) < 8 or length(v_code) > 40 then raise exception 'Transaktionscode fehlt' using errcode = '22023'; end if;
  if p_tx_date is null or p_tx_date > public._today() + 1 then raise exception 'Datum ungueltig' using errcode = '22023'; end if;
  select * into mem from public.members where name = p_member and kind in ('member', 'placeholder');
  if mem.id is null then raise exception 'Unbekanntes Mitglied' using errcode = '22023'; end if;
  if p_allocs is null or jsonb_typeof(p_allocs) <> 'array' or jsonb_array_length(p_allocs) = 0 then
    raise exception 'Keine Zuordnung angegeben' using errcode = '22023'; end if;
  if exists (select 1 from public.paypal_payments where tx_code = v_code) then
    raise exception 'Diese Zahlung ist schon gebucht' using errcode = '23505'; end if;

  for a in select * from jsonb_array_elements(p_allocs) loop
    v_sum := v_sum + round((a->>'amount')::numeric, 2);
  end loop;
  if round(v_sum, 2) <> round(p_amount, 2) then
    raise exception 'Zuordnung (%) passt nicht zum Betrag (%)', v_sum, p_amount using errcode = '22023'; end if;

  insert into public.paypal_payments(tx_date, tx_type, from_name, to_name, message, amount, tx_code)
  values (p_tx_date, 'Auszahlung', 'PayPal', mem.name, nullif(left(trim(coalesce(p_message, '')), 300), ''), -round(p_amount, 2), v_code)
  returning id into v_pay;

  for a in select * from jsonb_array_elements(p_allocs) loop
    v_amt := round((a->>'amount')::numeric, 2);
    if v_amt <= 0 then raise exception 'Teilbetrag muss positiv sein' using errcode = '22023'; end if;
    if a ? 'entry_id' then
      select * into ent from public.entries where id = (a->>'entry_id')::uuid for update;
      if ent.id is null or ent.cancelled_at is not null or ent.member_id <> mem.id then
        raise exception 'Posten gehoert nicht zu %', mem.name using errcode = '22023'; end if;
      if v_amt > ent.paid - ent.amount then
        raise exception 'Teilbetrag %,- ist groesser als offener Rest %', v_amt, ent.paid - ent.amount using errcode = '22023'; end if;
      update public.entries set paid = paid - v_amt where id = ent.id;
      insert into public.payment_allocations(payment_id, entry_id, amount) values (v_pay, ent.id, -v_amt);
    else
      v_cat := a->>'category';
      if not exists (select 1 from public.fee_types where name = v_cat and can_be_expense) then
        raise exception 'Diese Kategorie kann keine Ausgabe sein' using errcode = '22023'; end if;
      insert into public.entries(entry_date, meeting_id, member_id, category, subcategory, amount, paid, source)
      values (coalesce(nullif(a->>'date', '')::date, p_tx_date),
              (select id from public.meetings where meeting_date = coalesce(nullif(a->>'date', '')::date, p_tx_date)),
              mem.id, v_cat, nullif(left(public._clean_name(a->>'sub'), 80), ''), -v_amt, -v_amt, 'admin')
      returning id into v_new;
      insert into public.payment_allocations(payment_id, entry_id, amount) values (v_pay, v_new, -v_amt);
    end if;
    v_n := v_n + 1;
  end loop;
  return jsonb_build_object('payment_id', v_pay, 'allocated', v_n, 'member', mem.name, 'amount', -round(p_amount, 2));
end $$;

create or replace function public.sync_invoice_vipps(p_reference text,p_state text,p_captured bigint,p_refunded bigint) returns jsonb language plpgsql set search_path=pg_catalog,public as $$
declare i public.invoice_drafts%rowtype; p public.invoice_vipps_payments%rowtype; net bigint; previous_net bigint; paid bigint; total bigint; last_date date; ledger_id uuid; today date;
begin
 select * into p from public.invoice_vipps_payments where reference=p_reference;
 if not found then raise exception 'Betalingen ble ikke funnet.'; end if;
 select * into i from public.invoice_drafts where id=p.invoice_id for update;
 select * into p from public.invoice_vipps_payments where reference=p_reference for update;
 if p_captured<0 or p_captured>p.amount_ore or p_refunded<0 or p_refunded>p_captured then raise exception 'Ugyldig Vipps-beløp.'; end if;
 p_captured=greatest(p_captured,p.captured_ore); p_refunded=greatest(p_refunded,p.refunded_ore);
 net=p_captured-p_refunded; previous_net=p.captured_ore-p.refunded_ore;
 today=(now() at time zone 'Europe/Oslo')::date;
 ledger_id=p.ledger_payment_id;
 if net<>previous_net then
  if ledger_id is not null then update public.invoice_payments set reversed_at=now() where id=ledger_id and reversed_at is null; end if;
  ledger_id=null;
  if net>0 then
   insert into public.invoice_payments(id,invoice_id,amount_ore,paid_on,note,vipps_reference)
   values(gen_random_uuid(),i.id,net,coalesce((p.captured_at at time zone 'Europe/Oslo')::date,today),'Bekreftet Vipps-betaling: '||p.reference,p.reference) returning id into ledger_id;
  end if;
  select coalesce(sum(amount_ore),0),max(paid_on) into paid,last_date from public.invoice_payments where invoice_id=i.id and reversed_at is null;
  select sum(round((l->>'quantity')::numeric*(l->>'unitPriceOre')::numeric)+round(round((l->>'quantity')::numeric*(l->>'unitPriceOre')::numeric)*(l->>'vatRate')::numeric/100))::bigint into total from jsonb_array_elements(i.line_items) l;
  update public.invoice_drafts set paid_ore=paid,paid_date=case when paid>=total then last_date else null end,payment_updated_at=now() where id=i.id;
 end if;
 update public.invoice_vipps_payments set captured_ore=p_captured,refunded_ore=p_refunded,ledger_payment_id=ledger_id,
 captured_at=case when p_captured>0 then coalesce(captured_at,now()) else captured_at end,
 state=case when p_captured>0 and net=0 then 'refunded' when net=amount_ore then 'paid' when net>0 then 'partial' when upper(p_state) in ('ABORTED','EXPIRED','TERMINATED') then 'cancelled' when upper(p_state)='AUTHORIZED' then 'authorized' when state='cancelled' then 'cancelled' else 'pending' end,
 updated_at=now() where id=p.id returning * into p;
 return to_jsonb(p);
end $$;

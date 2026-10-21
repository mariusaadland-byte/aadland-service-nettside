
alter table public.invoice_drafts
 add column paid_ore bigint not null default 0 check(paid_ore>=0),
 add column paid_date date,
 add column payment_updated_at timestamptz;
create table public.invoice_payments(
 id uuid primary key,
 invoice_id uuid not null references public.invoice_drafts(id) on delete restrict,
 amount_ore bigint not null check(amount_ore>0),
 paid_on date not null,
 note text not null default '',
 recorded_at timestamptz not null default now(),
 recorded_by uuid references public.admin_users(id) on delete restrict,
 reversed_at timestamptz,
 reversed_by uuid references public.admin_users(id) on delete restrict
);
create index invoice_payments_invoice_id_idx on public.invoice_payments(invoice_id);
alter table public.invoice_payments enable row level security;
revoke all on public.invoice_payments from public,anon,authenticated,service_role;
grant select,insert on public.invoice_payments to service_role;
grant update(reversed_at,reversed_by) on public.invoice_payments to service_role;

create function public.record_invoice_payment(p_invoice_id uuid,p_amount_ore bigint,p_paid_on date,p_request_id uuid,p_admin_id uuid,p_note text default '')
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare i public.invoice_drafts%rowtype; existing public.invoice_payments%rowtype; amount bigint; total bigint; paid bigint; last_date date;
begin
 select * into i from public.invoice_drafts where id=p_invoice_id for update;
 if not found or i.status='draft' then raise exception 'Velg en utstedt faktura.'; end if;
 select * into existing from public.invoice_payments where id=p_request_id;
 if found then
  if existing.invoice_id<>p_invoice_id or existing.paid_on<>p_paid_on or (p_amount_ore is not null and existing.amount_ore<>p_amount_ore) then raise exception 'Betalingsforespørselen er allerede brukt.'; end if;
  return jsonb_build_object('id',existing.id,'alreadyRecorded',true);
 end if;
 if p_paid_on is null or p_paid_on>(now() at time zone 'Europe/Oslo')::date or p_paid_on<i.issued_date then raise exception 'Velg en betalingsdato mellom fakturadato og i dag.'; end if;
 select sum(round((l->>'quantity')::numeric*(l->>'unitPriceOre')::numeric)+round(round((l->>'quantity')::numeric*(l->>'unitPriceOre')::numeric)*(l->>'vatRate')::numeric/100))::bigint into total from jsonb_array_elements(i.line_items) l;
 amount=coalesce(p_amount_ore,total-i.paid_ore);
 if amount<=0 then raise exception 'Fakturaen er allerede betalt, eller beløpet er ugyldig.'; end if;
 if amount>total-i.paid_ore then raise exception 'Beløpet er større enn gjenstående beløp.'; end if;
 insert into public.invoice_payments(id,invoice_id,amount_ore,paid_on,note,recorded_by) values(p_request_id,p_invoice_id,amount,p_paid_on,left(coalesce(p_note,''),500),p_admin_id);
 select coalesce(sum(amount_ore),0),max(paid_on) into paid,last_date from public.invoice_payments where invoice_id=p_invoice_id and reversed_at is null;
 update public.invoice_drafts set paid_ore=paid,paid_date=case when paid>=total then last_date else null end,payment_updated_at=now() where id=p_invoice_id;
 return jsonb_build_object('id',p_request_id,'paidOre',paid,'outstandingOre',total-paid);
end; $$;
revoke all on function public.record_invoice_payment(uuid,bigint,date,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.record_invoice_payment(uuid,bigint,date,uuid,uuid,text) to service_role;

create function public.reverse_invoice_payment(p_payment_id uuid,p_admin_id uuid)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare p public.invoice_payments%rowtype; i public.invoice_drafts%rowtype; total bigint; paid bigint; last_date date;
begin
 select * into p from public.invoice_payments where id=p_payment_id;
 if not found then raise exception 'Betalingen ble ikke funnet.'; end if;
 select * into i from public.invoice_drafts where id=p.invoice_id for update;
 update public.invoice_payments set reversed_at=now(),reversed_by=p_admin_id where id=p_payment_id and reversed_at is null;
 select coalesce(sum(amount_ore),0),max(paid_on) into paid,last_date from public.invoice_payments where invoice_id=p.invoice_id and reversed_at is null;
 select sum(round((l->>'quantity')::numeric*(l->>'unitPriceOre')::numeric)+round(round((l->>'quantity')::numeric*(l->>'unitPriceOre')::numeric)*(l->>'vatRate')::numeric/100))::bigint into total from jsonb_array_elements(i.line_items) l;
 update public.invoice_drafts set paid_ore=paid,paid_date=case when paid>=total then last_date else null end,payment_updated_at=now() where id=p.invoice_id;
 return jsonb_build_object('paidOre',paid,'outstandingOre',total-paid);
end; $$;
revoke all on function public.reverse_invoice_payment(uuid,uuid) from public,anon,authenticated;
grant execute on function public.reverse_invoice_payment(uuid,uuid) to service_role;

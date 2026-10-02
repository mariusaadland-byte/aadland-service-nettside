alter table public.rental_bookings
  add column if not exists payment_provider text,
  add column if not exists payment_psp_reference text,
  add column if not exists payment_reserved_ore integer not null default 0,
  add column if not exists payment_authorized_at timestamptz,
  add column if not exists payment_captured_at timestamptz,
  add column if not exists payment_cancelled_at timestamptz,
  add column if not exists payment_capture_guaranteed_until timestamptz,
  add column if not exists vipps_checkout_started_at timestamptz;

create table if not exists public.vipps_webhook_events (
  id uuid primary key default gen_random_uuid(),
  unit text not null check (unit in ('service','rental')),
  idempotency_key text not null,
  event_name text not null,
  payment_reference text not null,
  psp_reference text,
  amount_ore integer,
  event_timestamp timestamptz,
  payload jsonb not null default '{}'::jsonb,
  processed_at timestamptz,
  process_error text,
  received_at timestamptz not null default now(),
  unique(unit,idempotency_key)
);

alter table public.vipps_webhook_events enable row level security;
revoke all on table public.vipps_webhook_events from public,anon,authenticated;
grant select,insert,update,delete on table public.vipps_webhook_events to service_role;

create index if not exists vipps_webhook_events_reference_idx
  on public.vipps_webhook_events(unit,payment_reference,received_at desc);

create or replace function public.apply_vipps_payment_event(
  target_unit text,
  target_reference text,
  event_name_value text,
  amount_ore_value integer default 0,
  psp_reference_value text default null,
  event_timestamp_value timestamptz default null,
  capture_guaranteed_until_value timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $vipps_event$
declare
  now_value timestamptz := coalesce(event_timestamp_value,now());
  amount_value integer := greatest(coalesce(amount_ore_value,0),0);
  order_row public.orders%rowtype;
  rental_row public.rental_bookings%rowtype;
  next_captured integer;
  next_refunded integer;
  next_status text;
begin
  if target_unit='service' then
    select * into order_row from public.orders
    where order_number=target_reference or payment_reference=target_reference
    order by case when order_number=target_reference then 0 else 1 end
    limit 1 for update;
    if not found then raise exception 'VIPPS_PAYMENT_TARGET_NOT_FOUND'; end if;

    next_captured:=greatest(coalesce(order_row.payment_captured_ore,0),0);
    next_refunded:=greatest(coalesce(order_row.payment_refunded_ore,0),0);
    next_status:=coalesce(order_row.payment_status,'pending');

    if event_name_value='AUTHORIZED' then
      next_status:='authorized';
      update public.orders set payment_provider='vipps',payment_reference=target_reference,
        payment_psp_reference=coalesce(nullif(psp_reference_value,''),payment_psp_reference),
        payment_reserved_ore=greatest(coalesce(payment_reserved_ore,0),amount_value),
        payment_authorized_at=coalesce(payment_authorized_at,now_value),
        payment_capture_guaranteed_until=coalesce(capture_guaranteed_until_value,payment_capture_guaranteed_until),
        payment_status=next_status,updated_at=now()
      where id=order_row.id;
    elsif event_name_value='CAPTURED' then
      next_captured:=next_captured+amount_value;
      next_status:=case when next_captured>=greatest(coalesce(order_row.total_ore,0),1) then 'paid' else 'partial' end;
      update public.orders set payment_provider='vipps',payment_reference=target_reference,
        payment_psp_reference=coalesce(nullif(psp_reference_value,''),payment_psp_reference),
        payment_captured_ore=next_captured,payment_captured_at=now_value,payment_status=next_status,updated_at=now()
      where id=order_row.id;
    elsif event_name_value='REFUNDED' then
      next_refunded:=least(next_captured,next_refunded+amount_value);
      next_status:=case when next_captured>0 and next_refunded>=next_captured then 'refunded' else order_row.payment_status end;
      update public.orders set payment_provider='vipps',payment_reference=target_reference,
        payment_psp_reference=coalesce(nullif(psp_reference_value,''),payment_psp_reference),
        payment_refunded_ore=next_refunded,payment_refunded_at=now_value,payment_status=next_status,updated_at=now()
      where id=order_row.id;
    elsif event_name_value in ('CANCELLED','ABORTED','EXPIRED','TERMINATED') then
      next_status:=case when next_captured>next_refunded then order_row.payment_status else 'cancelled' end;
      update public.orders set payment_provider='vipps',payment_reference=target_reference,
        payment_psp_reference=coalesce(nullif(psp_reference_value,''),payment_psp_reference),
        payment_cancelled_at=coalesce(payment_cancelled_at,now_value),payment_status=next_status,updated_at=now()
      where id=order_row.id;
    else
      update public.orders set payment_provider='vipps',payment_reference=coalesce(payment_reference,target_reference),
        payment_psp_reference=coalesce(nullif(psp_reference_value,''),payment_psp_reference),updated_at=now()
      where id=order_row.id;
    end if;

    return jsonb_build_object('ok',true,'target','order','id',order_row.id,'status',next_status);
  elsif target_unit='rental' then
    select * into rental_row from public.rental_bookings
    where booking_number=target_reference or payment_reference=target_reference
    order by case when booking_number=target_reference then 0 else 1 end
    limit 1 for update;
    if not found then raise exception 'VIPPS_PAYMENT_TARGET_NOT_FOUND'; end if;

    next_captured:=greatest(coalesce(rental_row.payment_captured_ore,0),0);
    next_refunded:=greatest(coalesce(rental_row.payment_refunded_ore,0),0);
    next_status:=coalesce(rental_row.payment_status,'unpaid');

    if event_name_value='AUTHORIZED' then
      next_status:='authorized';
      update public.rental_bookings set payment_provider='vipps',payment_reference=target_reference,
        payment_psp_reference=coalesce(nullif(psp_reference_value,''),payment_psp_reference),
        payment_reserved_ore=greatest(coalesce(payment_reserved_ore,0),amount_value),
        payment_authorized_at=coalesce(payment_authorized_at,now_value),
        payment_capture_guaranteed_until=coalesce(capture_guaranteed_until_value,payment_capture_guaranteed_until),
        payment_status=next_status,updated_at=now()
      where id=rental_row.id;
    elsif event_name_value='CAPTURED' then
      next_captured:=next_captured+amount_value;
      next_status:=case when next_captured>=greatest(coalesce(rental_row.total_ore,0),1) then 'paid' else 'partial' end;
      update public.rental_bookings set payment_provider='vipps',payment_reference=target_reference,
        payment_psp_reference=coalesce(nullif(psp_reference_value,''),payment_psp_reference),
        payment_captured_ore=next_captured,payment_captured_at=now_value,payment_status=next_status,updated_at=now()
      where id=rental_row.id;
    elsif event_name_value='REFUNDED' then
      next_refunded:=least(next_captured,next_refunded+amount_value);
      next_status:=case when next_captured>0 and next_refunded>=next_captured then 'refunded' else rental_row.payment_status end;
      update public.rental_bookings set payment_provider='vipps',payment_reference=target_reference,
        payment_psp_reference=coalesce(nullif(psp_reference_value,''),payment_psp_reference),
        payment_refunded_ore=next_refunded,payment_refunded_at=now_value,payment_status=next_status,updated_at=now()
      where id=rental_row.id;
    elsif event_name_value in ('CANCELLED','ABORTED','EXPIRED','TERMINATED') then
      next_status:=case when next_captured>next_refunded then rental_row.payment_status else 'cancelled' end;
      update public.rental_bookings set payment_provider='vipps',payment_reference=target_reference,
        payment_psp_reference=coalesce(nullif(psp_reference_value,''),payment_psp_reference),
        payment_cancelled_at=coalesce(payment_cancelled_at,now_value),payment_status=next_status,updated_at=now()
      where id=rental_row.id;
    else
      update public.rental_bookings set payment_provider='vipps',payment_reference=coalesce(payment_reference,target_reference),
        payment_psp_reference=coalesce(nullif(psp_reference_value,''),payment_psp_reference),updated_at=now()
      where id=rental_row.id;
    end if;

    return jsonb_build_object('ok',true,'target','rental','id',rental_row.id,'status',next_status);
  end if;
  raise exception 'VIPPS_PAYMENT_UNIT_INVALID';
end;
$vipps_event$;

revoke all on function public.apply_vipps_payment_event(text,text,text,integer,text,timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function public.apply_vipps_payment_event(text,text,text,integer,text,timestamptz,timestamptz) to service_role;

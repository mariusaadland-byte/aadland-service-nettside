create or replace function public.sync_vipps_payment_snapshot(
  target_unit text,
  target_reference text,
  payment_state_value text,
  psp_reference_value text,
  authorized_ore_value integer,
  cancelled_ore_value integer,
  captured_ore_value integer,
  refunded_ore_value integer,
  capture_guaranteed_until_value timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  authorized_ore integer := greatest(coalesce(authorized_ore_value,0),0);
  cancelled_ore integer := greatest(coalesce(cancelled_ore_value,0),0);
  captured_ore integer := greatest(coalesce(captured_ore_value,0),0);
  refunded_ore integer := greatest(coalesce(refunded_ore_value,0),0);
  state_value text := upper(coalesce(payment_state_value,''));
  status_value text;
  order_row public.orders%rowtype;
  rental_row public.rental_bookings%rowtype;
begin
  if target_unit not in ('service','rental') then raise exception 'VIPPS_PAYMENT_UNIT_INVALID'; end if;
  if coalesce(target_reference,'')='' then raise exception 'VIPPS_PAYMENT_REFERENCE_REQUIRED'; end if;

  status_value:=case
    when captured_ore>0 and refunded_ore>=captured_ore then 'refunded'
    when captured_ore>0 then
      case
        when target_unit='service' then
          case when captured_ore>=(select greatest(coalesce(total_ore,0),1) from public.orders where order_number=target_reference or payment_reference=target_reference order by case when order_number=target_reference then 0 else 1 end limit 1) then 'paid' else 'partial' end
        else
          case when captured_ore>=(select greatest(coalesce(total_ore,0),1) from public.rental_bookings where booking_number=target_reference or payment_reference=target_reference order by case when booking_number=target_reference then 0 else 1 end limit 1) then 'paid' else 'partial' end
      end
    when state_value='AUTHORIZED' and authorized_ore>cancelled_ore then 'authorized'
    when state_value in ('ABORTED','EXPIRED','TERMINATED') then 'cancelled'
    when state_value='AUTHORIZED' and authorized_ore>0 and cancelled_ore>=authorized_ore then 'cancelled'
    else case when target_unit='service' then 'pending' else 'unpaid' end
  end;

  if target_unit='service' then
    select * into order_row
    from public.orders
    where order_number=target_reference or payment_reference=target_reference
    order by case when order_number=target_reference then 0 else 1 end
    limit 1
    for update;
    if not found then raise exception 'VIPPS_PAYMENT_TARGET_NOT_FOUND'; end if;

    update public.orders set
      payment_provider='vipps',
      payment_reference=target_reference,
      payment_psp_reference=coalesce(nullif(psp_reference_value,''),payment_psp_reference),
      payment_reserved_ore=authorized_ore,
      payment_captured_ore=captured_ore,
      payment_refunded_ore=least(captured_ore,refunded_ore),
      payment_authorized_at=case when authorized_ore>0 then coalesce(payment_authorized_at,now()) else payment_authorized_at end,
      payment_captured_at=case when captured_ore>0 then coalesce(payment_captured_at,now()) else payment_captured_at end,
      payment_refunded_at=case when refunded_ore>0 then coalesce(payment_refunded_at,now()) else payment_refunded_at end,
      payment_cancelled_at=case when status_value='cancelled' then coalesce(payment_cancelled_at,now()) else payment_cancelled_at end,
      payment_capture_guaranteed_until=coalesce(capture_guaranteed_until_value,payment_capture_guaranteed_until),
      payment_status=status_value,
      updated_at=now()
    where id=order_row.id;

    return jsonb_build_object('ok',true,'target','order','id',order_row.id,'status',status_value,
      'authorizedOre',authorized_ore,'cancelledOre',cancelled_ore,'capturedOre',captured_ore,
      'refundedOre',least(captured_ore,refunded_ore));
  end if;

  select * into rental_row
  from public.rental_bookings
  where booking_number=target_reference or payment_reference=target_reference
  order by case when booking_number=target_reference then 0 else 1 end
  limit 1
  for update;
  if not found then raise exception 'VIPPS_PAYMENT_TARGET_NOT_FOUND'; end if;

  update public.rental_bookings set
    payment_provider='vipps',
    payment_reference=target_reference,
    payment_psp_reference=coalesce(nullif(psp_reference_value,''),payment_psp_reference),
    payment_reserved_ore=authorized_ore,
    payment_captured_ore=captured_ore,
    payment_refunded_ore=least(captured_ore,refunded_ore),
    payment_authorized_at=case when authorized_ore>0 then coalesce(payment_authorized_at,now()) else payment_authorized_at end,
    payment_captured_at=case when captured_ore>0 then coalesce(payment_captured_at,now()) else payment_captured_at end,
    payment_refunded_at=case when refunded_ore>0 then coalesce(payment_refunded_at,now()) else payment_refunded_at end,
    payment_cancelled_at=case when status_value='cancelled' then coalesce(payment_cancelled_at,now()) else payment_cancelled_at end,
    payment_capture_guaranteed_until=coalesce(capture_guaranteed_until_value,payment_capture_guaranteed_until),
    payment_status=status_value,
    updated_at=now()
  where id=rental_row.id;

  return jsonb_build_object('ok',true,'target','rental','id',rental_row.id,'status',status_value,
    'authorizedOre',authorized_ore,'cancelledOre',cancelled_ore,'capturedOre',captured_ore,
    'refundedOre',least(captured_ore,refunded_ore));
end;
$function$;

revoke all on function public.sync_vipps_payment_snapshot(text,text,text,text,integer,integer,integer,integer,timestamptz) from public,anon,authenticated;
grant execute on function public.sync_vipps_payment_snapshot(text,text,text,text,integer,integer,integer,integer,timestamptz) to service_role;

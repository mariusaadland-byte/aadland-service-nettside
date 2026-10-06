alter table public.orders
  add column if not exists refund_notice_total_ore integer not null default 0,
  add column if not exists refund_notice_claim_ore integer,
  add column if not exists refund_notice_sending_at timestamptz;

alter table public.rental_bookings
  add column if not exists refund_notice_total_ore integer not null default 0,
  add column if not exists refund_notice_claim_ore integer,
  add column if not exists refund_notice_sending_at timestamptz;

create or replace function public.claim_vipps_refund_notice(target_unit text,target_id uuid)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public
as $function$
declare claimed_total integer; previous_total integer;
begin
  if target_unit='service' then
    with candidate as (
      select id,greatest(coalesce(payment_refunded_ore,0),0) as current_total,
             greatest(coalesce(refund_notice_total_ore,0),0) as notified_total
      from public.orders
      where id=target_id and order_type='order' and payment_provider='vipps'
        and greatest(coalesce(payment_refunded_ore,0),0)>greatest(coalesce(refund_notice_total_ore,0),0)
        and (refund_notice_sending_at is null or refund_notice_sending_at<now()-interval '15 minutes')
      for update
    )
    update public.orders o
    set refund_notice_claim_ore=c.current_total,refund_notice_sending_at=now(),updated_at=now()
    from candidate c where o.id=c.id
    returning c.current_total,c.notified_total into claimed_total,previous_total;
  elsif target_unit='rental' then
    with candidate as (
      select id,greatest(coalesce(payment_refunded_ore,0),0) as current_total,
             greatest(coalesce(refund_notice_total_ore,0),0) as notified_total
      from public.rental_bookings
      where id=target_id and payment_provider='vipps'
        and greatest(coalesce(payment_refunded_ore,0),0)>greatest(coalesce(refund_notice_total_ore,0),0)
        and (refund_notice_sending_at is null or refund_notice_sending_at<now()-interval '15 minutes')
      for update
    )
    update public.rental_bookings b
    set refund_notice_claim_ore=c.current_total,refund_notice_sending_at=now(),updated_at=now()
    from candidate c where b.id=c.id
    returning c.current_total,c.notified_total into claimed_total,previous_total;
  else
    raise exception 'VIPPS_REFUND_NOTICE_UNIT_INVALID';
  end if;

  if claimed_total is null then return jsonb_build_object('claimed',false); end if;
  return jsonb_build_object('claimed',true,'totalOre',claimed_total,'previousNotifiedOre',previous_total,'refundOre',greatest(claimed_total-previous_total,0));
end;
$function$;

create or replace function public.complete_vipps_refund_notice(target_unit text,target_id uuid,claimed_total_ore integer)
returns boolean language plpgsql security definer set search_path = pg_catalog, public
as $function$
declare affected integer:=0; current_previous integer:=0;
begin
  if target_unit='service' then
    select greatest(coalesce(refund_notice_total_ore,0),0) into current_previous from public.orders where id=target_id for update;
    update public.orders
    set refund_last_ore=greatest(claimed_total_ore-current_previous,0),
        refund_reference=coalesce(nullif(payment_psp_reference,''),payment_reference,refund_reference),
        refund_note=coalesce(refund_note,'Vipps-refusjon'),
        refund_notice_total_ore=greatest(coalesce(refund_notice_total_ore,0),claimed_total_ore),
        refund_notice_sent_at=now(),refund_notice_claim_ore=null,refund_notice_sending_at=null,updated_at=now()
    where id=target_id and refund_notice_claim_ore=claimed_total_ore;
    get diagnostics affected=row_count; return affected>0;
  elsif target_unit='rental' then
    select greatest(coalesce(refund_notice_total_ore,0),0) into current_previous from public.rental_bookings where id=target_id for update;
    update public.rental_bookings
    set refund_last_ore=greatest(claimed_total_ore-current_previous,0),
        refund_reference=coalesce(nullif(payment_psp_reference,''),payment_reference,refund_reference),
        refund_note=coalesce(refund_note,'Vipps-refusjon'),
        refund_notice_total_ore=greatest(coalesce(refund_notice_total_ore,0),claimed_total_ore),
        refund_notice_sent_at=now(),refund_notice_claim_ore=null,refund_notice_sending_at=null,updated_at=now()
    where id=target_id and refund_notice_claim_ore=claimed_total_ore;
    get diagnostics affected=row_count; return affected>0;
  end if;
  raise exception 'VIPPS_REFUND_NOTICE_UNIT_INVALID';
end;
$function$;

create or replace function public.release_vipps_refund_notice_claim(target_unit text,target_id uuid,claimed_total_ore integer)
returns boolean language plpgsql security definer set search_path = pg_catalog, public
as $function$
declare affected integer:=0;
begin
  if target_unit='service' then
    update public.orders set refund_notice_claim_ore=null,refund_notice_sending_at=null,updated_at=now()
    where id=target_id and refund_notice_claim_ore=claimed_total_ore;
  elsif target_unit='rental' then
    update public.rental_bookings set refund_notice_claim_ore=null,refund_notice_sending_at=null,updated_at=now()
    where id=target_id and refund_notice_claim_ore=claimed_total_ore;
  else
    raise exception 'VIPPS_REFUND_NOTICE_UNIT_INVALID';
  end if;
  get diagnostics affected=row_count; return affected>0;
end;
$function$;

revoke all on function public.claim_vipps_refund_notice(text,uuid) from public,anon,authenticated;
grant execute on function public.claim_vipps_refund_notice(text,uuid) to service_role;
revoke all on function public.complete_vipps_refund_notice(text,uuid,integer) from public,anon,authenticated;
grant execute on function public.complete_vipps_refund_notice(text,uuid,integer) to service_role;
revoke all on function public.release_vipps_refund_notice_claim(text,uuid,integer) from public,anon,authenticated;
grant execute on function public.release_vipps_refund_notice_claim(text,uuid,integer) to service_role;

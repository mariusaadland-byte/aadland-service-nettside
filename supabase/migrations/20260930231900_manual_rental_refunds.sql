alter table public.rental_bookings
 add column if not exists payment_refunded_ore integer not null default 0,
 add column if not exists payment_refunded_at timestamptz,
 add column if not exists refund_last_ore integer not null default 0,
 add column if not exists refund_reference text,
 add column if not exists refund_note text,
 add column if not exists refund_notice_sent_at timestamptz;

create or replace function public.record_manual_rental_refund(
  target_booking_id uuid,
  refund_ore integer,
  refund_reference_value text default null,
  refund_note_value text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $rental_refund$
declare
  booking_row public.rental_bookings%rowtype;
  captured integer;
  refunded_before integer;
  refunded_after integer;
  now_value timestamptz := now();
  next_status text;
begin
  if refund_ore is null or refund_ore <= 0 then
    raise exception 'INVALID_REFUND_AMOUNT';
  end if;

  select * into booking_row
  from public.rental_bookings
  where id=target_booking_id
  for update;

  if not found then
    raise exception 'RENTAL_BOOKING_NOT_FOUND';
  end if;

  captured:=greatest(coalesce(booking_row.payment_captured_ore,0),0);
  refunded_before:=greatest(coalesce(booking_row.payment_refunded_ore,0),0);

  if captured <= 0 then raise exception 'NO_CAPTURED_PAYMENT'; end if;
  if refunded_before >= captured then raise exception 'PAYMENT_ALREADY_FULLY_REFUNDED'; end if;

  refunded_after:=refunded_before+refund_ore;
  if refunded_after > captured then raise exception 'REFUND_EXCEEDS_CAPTURED_PAYMENT'; end if;

  next_status:=case when refunded_after=captured then 'refunded' else booking_row.payment_status end;

  update public.rental_bookings
  set payment_refunded_ore=refunded_after,
      payment_refunded_at=now_value,
      payment_status=next_status,
      refund_last_ore=refund_ore,
      refund_reference=nullif(left(trim(coalesce(refund_reference_value,'')),120),''),
      refund_note=nullif(left(trim(coalesce(refund_note_value,'')),1000),''),
      refund_notice_sent_at=null,
      updated_at=now_value
  where id=target_booking_id;

  return jsonb_build_object(
    'ok',true,'refundOre',refund_ore,'refundedBeforeOre',refunded_before,
    'refundedTotalOre',refunded_after,'capturedOre',captured,
    'remainingOre',captured-refunded_after,'paymentStatus',next_status,
    'refundedAt',now_value
  );
end;
$rental_refund$;

revoke all on function public.record_manual_rental_refund(uuid,integer,text,text) from public,anon,authenticated;
grant execute on function public.record_manual_rental_refund(uuid,integer,text,text) to service_role;

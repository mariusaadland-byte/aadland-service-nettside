alter table public.orders
  add column if not exists receipt_sending_at timestamptz;

alter table public.rental_bookings
  add column if not exists receipt_sending_at timestamptz;

create or replace function public.claim_payment_receipt(
  target_unit text,
  target_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  affected integer := 0;
begin
  if target_unit='service' then
    update public.orders
    set receipt_sending_at=now(),updated_at=now()
    where id=target_id
      and order_type='order'
      and payment_status='paid'
      and coalesce(payment_captured_ore,0)>0
      and receipt_sent_at is null
      and (receipt_sending_at is null or receipt_sending_at<now()-interval '15 minutes');
    get diagnostics affected=row_count;
    return affected>0;
  elsif target_unit='rental' then
    update public.rental_bookings
    set receipt_sending_at=now(),updated_at=now()
    where id=target_id
      and payment_status='paid'
      and coalesce(payment_captured_ore,0)>0
      and receipt_sent_at is null
      and (receipt_sending_at is null or receipt_sending_at<now()-interval '15 minutes');
    get diagnostics affected=row_count;
    return affected>0;
  end if;
  raise exception 'PAYMENT_RECEIPT_UNIT_INVALID';
end;
$function$;

revoke all on function public.claim_payment_receipt(text,uuid) from public,anon,authenticated;
grant execute on function public.claim_payment_receipt(text,uuid) to service_role;

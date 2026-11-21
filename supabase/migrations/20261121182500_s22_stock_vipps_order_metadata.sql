-- S-22: Fix stock reservations losing Vipps payment metadata when the
-- order and inventory deduction are committed atomically.
-- Only the three previously omitted columns are added to the INSERT.
-- No changes to real products, orders, stock or payment balances.
create or replace function public.create_order_with_stock(
 order_record jsonb,
 stock_requests jsonb
) returns uuid
language plpgsql security definer
set search_path = pg_catalog, public
as $stock_order$
declare
 request jsonb;
 requested_id text;
 requested_quantity integer;
 affected integer;
 new_id uuid;
 provider text;
 reference text;
 checkout_at timestamptz;
begin
 if stock_requests is null or jsonb_typeof(stock_requests)<>'array' then
  raise exception 'INVALID_STOCK_REQUEST';
 end if;
 provider:=nullif(lower(trim(order_record->>'payment_provider')),'');
 reference:=nullif(trim(order_record->>'payment_reference'),'');
 checkout_at:=nullif(order_record->>'vipps_checkout_started_at','')::timestamptz;

 if provider is not null and provider<>'vipps' then
  raise exception 'INVALID_PAYMENT_PROVIDER';
 end if;
 if provider='vipps' and (
   reference is null or checkout_at is null or
   (order_record->>'payment_status')<>'pending' or
   reference is distinct from (order_record->>'order_number')
 ) then
  raise exception 'INVALID_VIPPS_ORDER_REFERENCE';
 end if;
 if provider is null and (reference is not null or checkout_at is not null) then
  raise exception 'INVALID_MANUAL_PAYMENT_METADATA';
 end if;

 for request in
  select value from jsonb_array_elements(stock_requests)
  order by value->>'id'
 loop
  requested_id:=request->>'id';
  requested_quantity:=(request->>'quantity')::integer;
  if requested_id is null or requested_quantity is null or requested_quantity<=0
   then raise exception 'INVALID_STOCK_REQUEST'; end if;
  update public.products
   set stock_quantity=stock_quantity-requested_quantity,
       updated_at=now()
   where id=requested_id
    and inventory_mode='stock'
    and active=true
    and stock_quantity>=requested_quantity;
  get diagnostics affected=row_count;
  if affected<>1 then raise exception 'INSUFFICIENT_STOCK:%',requested_id; end if;
 end loop;

 insert into public.orders(
  customer_user_id,order_number,order_type,status,customer,
  fulfillment_type,delivery_within_radius,items,custom_request,
  total_ore,shipping_ore,payment_status,terms_version,terms_accepted_at,
  payment_provider,payment_reference,vipps_checkout_started_at
 ) values (
  nullif(order_record->>'customer_user_id','')::uuid,
  order_record->>'order_number',
  order_record->>'order_type',
  order_record->>'status',
  order_record->'customer',
  order_record->>'fulfillment_type',
  coalesce((order_record->>'delivery_within_radius')::boolean,false),
  coalesce(order_record->'items','[]'::jsonb),
  nullif(order_record->>'custom_request',''),
  (order_record->>'total_ore')::integer,
  (order_record->>'shipping_ore')::integer,
  order_record->>'payment_status',
  nullif(order_record->>'terms_version',''),
  nullif(order_record->>'terms_accepted_at','')::timestamptz,
  provider,reference,checkout_at
 ) returning id into new_id;
 return new_id;
end;
$stock_order$;
revoke all on function public.create_order_with_stock(jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.create_order_with_stock(jsonb,jsonb) to service_role;

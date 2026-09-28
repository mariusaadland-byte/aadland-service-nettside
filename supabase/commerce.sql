-- Produktlager, produksjon, frakt og ordrebetaling. Kjøres senere i Supabase SQL Editor.
alter table public.products add column if not exists inventory_mode text not null default 'made_to_order';
alter table public.products add column if not exists stock_quantity integer not null default 0;
alter table public.products add column if not exists restock_date date;
alter table public.products add column if not exists lead_time_text text;
alter table public.products add column if not exists shippable boolean not null default false;
alter table public.products add column if not exists shipping_price_ore integer not null default 0;
alter table public.products add column if not exists weight_grams integer;
alter table public.products add column if not exists shipping_length_cm numeric(8,2);
alter table public.products add column if not exists shipping_width_cm numeric(8,2);
alter table public.products add column if not exists shipping_height_cm numeric(8,2);
alter table public.products drop constraint if exists products_inventory_mode_check;
alter table public.products add constraint products_inventory_mode_check check (inventory_mode in ('stock','made_to_order'));
alter table public.products drop constraint if exists products_stock_quantity_check;
alter table public.products add constraint products_stock_quantity_check check (stock_quantity >= 0);

-- Kundekoblingen må finnes før den atomiske ordrefunksjonen opprettes.
-- customers.sql beholder samme IF NOT EXISTS for trygg, idempotent kjøring.
alter table public.orders add column if not exists customer_user_id uuid references auth.users(id) on delete set null;
alter table public.orders add column if not exists payment_status text not null default 'pending';
alter table public.orders add column if not exists payment_reference text;
alter table public.orders add column if not exists payment_reserved_ore integer not null default 0;
alter table public.orders add column if not exists payment_captured_ore integer not null default 0;
alter table public.orders add column if not exists shipping_ore integer not null default 0;
alter table public.orders add column if not exists tracking_number text;
alter table public.orders add column if not exists tracking_url text;
alter table public.orders add column if not exists terms_version text;
alter table public.orders add column if not exists terms_accepted_at timestamptz;
alter table public.orders add column if not exists dispatched_at timestamptz;
alter table public.orders add column if not exists delivered_at timestamptz;
create index if not exists products_inventory_mode_idx on public.products(inventory_mode,active);

-- Klargjør eksplisitte ordrehandlinger uten å koble betalingsleverandør ennå.
alter table public.orders add column if not exists confirmation_sent_at timestamptz;
alter table public.orders add column if not exists receipt_sent_at timestamptz;
alter table public.orders add column if not exists tracking_sent_at timestamptz;
alter table public.orders add column if not exists updated_at timestamptz not null default now();
create index if not exists orders_payment_status_idx on public.orders(payment_status);
create index if not exists orders_status_idx on public.orders(status);

alter table public.orders add column if not exists delivery_notice_sent_at timestamptz;

alter table public.orders add column if not exists archived_at timestamptz;
create index if not exists orders_archived_at_idx on public.orders(archived_at);


-- Atomisk lagerreservasjon. API-et sender kun servervaliderte produkt-ID-er og antall.
create or replace function public.reserve_product_stock(stock_requests jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  request jsonb;
  requested_id text;
  requested_quantity integer;
  affected integer;
begin
  if stock_requests is null or jsonb_typeof(stock_requests) <> 'array' then
    raise exception 'INVALID_STOCK_REQUEST';
  end if;

  for request in select value from jsonb_array_elements(stock_requests)
  loop
    requested_id := request->>'id';
    requested_quantity := (request->>'quantity')::integer;
    if requested_id is null or requested_quantity is null or requested_quantity <= 0 then
      raise exception 'INVALID_STOCK_REQUEST';
    end if;

    update public.products
      set stock_quantity = stock_quantity - requested_quantity,
          updated_at = now()
      where id = requested_id
        and inventory_mode = 'stock'
        and active = true
        and stock_quantity >= requested_quantity;
    get diagnostics affected = row_count;
    if affected <> 1 then
      raise exception 'INSUFFICIENT_STOCK:%', requested_id;
    end if;
  end loop;
end;
$$;
revoke all on function public.reserve_product_stock(jsonb) from public, anon, authenticated;
grant execute on function public.reserve_product_stock(jsonb) to service_role;


-- Kompenserer en reservasjon dersom ordreinnsettingen feiler.
create or replace function public.release_product_stock(stock_requests jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  request jsonb;
  requested_id text;
  requested_quantity integer;
  affected integer;
begin
  if stock_requests is null or jsonb_typeof(stock_requests) <> 'array' then
    raise exception 'INVALID_STOCK_REQUEST';
  end if;

  for request in select value from jsonb_array_elements(stock_requests)
  loop
    requested_id := request->>'id';
    requested_quantity := (request->>'quantity')::integer;
    if requested_id is null or requested_quantity is null or requested_quantity <= 0 then
      raise exception 'INVALID_STOCK_REQUEST';
    end if;

    update public.products
      set stock_quantity = stock_quantity + requested_quantity,
          updated_at = now()
      where id = requested_id
        and inventory_mode = 'stock';
    get diagnostics affected = row_count;
    if affected <> 1 then
      raise exception 'STOCK_RELEASE_FAILED:%', requested_id;
    end if;
  end loop;
end;
$$;
revoke all on function public.release_product_stock(jsonb) from public, anon, authenticated;
grant execute on function public.release_product_stock(jsonb) to service_role;


-- Oppretter ordre og reserverer lager i samme transaksjon.
-- Hvis lagerkontroll eller ordreinnsetting feiler, rulles hele operasjonen tilbake.
create or replace function public.create_order_with_stock(
  order_record jsonb,
  stock_requests jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  request jsonb;
  requested_id text;
  requested_quantity integer;
  affected integer;
  new_id uuid;
begin
  if stock_requests is null or jsonb_typeof(stock_requests) <> 'array' then
    raise exception 'INVALID_STOCK_REQUEST';
  end if;

  for request in
    select value from jsonb_array_elements(stock_requests)
    order by value->>'id'
  loop
    requested_id := request->>'id';
    requested_quantity := (request->>'quantity')::integer;
    if requested_id is null or requested_quantity is null or requested_quantity <= 0 then
      raise exception 'INVALID_STOCK_REQUEST';
    end if;

    update public.products
      set stock_quantity = stock_quantity - requested_quantity,
          updated_at = now()
      where id = requested_id
        and inventory_mode = 'stock'
        and active = true
        and stock_quantity >= requested_quantity;
    get diagnostics affected = row_count;
    if affected <> 1 then
      raise exception 'INSUFFICIENT_STOCK:%', requested_id;
    end if;
  end loop;

  insert into public.orders(
    customer_user_id,order_number,order_type,status,customer,fulfillment_type,
    delivery_within_radius,items,custom_request,total_ore,shipping_ore,
    payment_status,terms_version,terms_accepted_at
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
    nullif(order_record->>'terms_accepted_at','')::timestamptz
  )
  returning id into new_id;

  return new_id;
end;
$$;
revoke all on function public.create_order_with_stock(jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.create_order_with_stock(jsonb,jsonb) to service_role;


-- ============================================================
-- PRODUKTORDRE: KLAR-VARSEL
-- ============================================================

-- Kundemelding når en produktbestilling er klar for henting/levering.
alter table public.orders
 add column if not exists ready_notice_sent_at timestamptz;

create index if not exists orders_ready_notice_sent_at_idx
on public.orders(ready_notice_sent_at)
where ready_notice_sent_at is not null;


-- ============================================================
-- PRODUKTORDRE: SIKKER KANSELLERING
-- ============================================================

-- Sikker kansellering av produktordre med idempotent lagerfrigjøring.
alter table public.orders
 add column if not exists cancellation_reason text,
 add column if not exists cancellation_sent_at timestamptz,
 add column if not exists cancelled_at timestamptz,
 add column if not exists stock_released_at timestamptz;

create or replace function public.cancel_product_order_once(
  target_order_id uuid,
  customer_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $order_cancel$
declare
  order_row public.orders%rowtype;
  item jsonb;
  product_id text;
  quantity integer;
  released_items integer := 0;
  now_value timestamptz := now();
begin
  select * into order_row
  from public.orders
  where id=target_order_id
  for update;

  if not found then
    raise exception 'ORDER_NOT_FOUND';
  end if;

  if order_row.order_type <> 'order' then
    raise exception 'NOT_PRODUCT_ORDER';
  end if;

  if order_row.status='completed' then
    raise exception 'ORDER_ALREADY_COMPLETED';
  end if;

  if order_row.stock_released_at is null then
    for item in
      select value from jsonb_array_elements(coalesce(order_row.items,'[]'::jsonb))
    loop
      if coalesce(item->>'inventoryMode','')='stock' then
        product_id:=item->>'productId';
        quantity:=greatest(coalesce((item->>'quantity')::integer,0),0);
        if product_id is not null and quantity>0 then
          update public.products
          set stock_quantity=stock_quantity+quantity,
              updated_at=now_value
          where id=product_id
            and inventory_mode='stock';
          if found then
            released_items:=released_items+1;
          end if;
        end if;
      end if;
    end loop;
  end if;

  update public.orders
  set status='cancelled',
      cancellation_reason=case
        when nullif(trim(coalesce(customer_reason,'')),'') is not null
          then left(trim(customer_reason),1000)
        else cancellation_reason
      end,
      cancelled_at=coalesce(cancelled_at,now_value),
      stock_released_at=coalesce(stock_released_at,now_value),
      updated_at=now_value
  where id=target_order_id;

  return jsonb_build_object(
    'ok',true,
    'releasedItems',released_items,
    'alreadyCancelled',order_row.status='cancelled',
    'alreadyReleased',order_row.stock_released_at is not null
  );
end;
$order_cancel$;

revoke all on function public.cancel_product_order_once(uuid,text) from public,anon,authenticated;
grant execute on function public.cancel_product_order_once(uuid,text) to service_role;


-- ============================================================
-- PRODUKTORDRE: FREMDRIFT
-- ============================================================

-- Tidsstempler for kundevendte milepæler på produktordre.
alter table public.orders
 add column if not exists confirmed_at timestamptz,
 add column if not exists in_progress_at timestamptz,
 add column if not exists confirmed_notice_sent_at timestamptz,
 add column if not exists in_progress_notice_sent_at timestamptz;

create index if not exists orders_confirmed_at_idx
on public.orders(confirmed_at)
where confirmed_at is not null;

create index if not exists orders_in_progress_at_idx
on public.orders(in_progress_at)
where in_progress_at is not null;


-- ============================================================
-- PRODUKTORDRE: MANUELL REFUSJON
-- ============================================================

-- Manuell tilbakebetaling av produktordre.
-- Bruker de samme summeringsfeltene som Vipps-integrasjonen senere vil bruke.
alter table public.orders
 add column if not exists payment_refunded_ore integer not null default 0,
 add column if not exists payment_refunded_at timestamptz,
 add column if not exists refund_last_ore integer not null default 0,
 add column if not exists refund_reference text,
 add column if not exists refund_note text,
 add column if not exists refund_notice_sent_at timestamptz;

create or replace function public.record_manual_order_refund(
  target_order_id uuid,
  refund_ore integer,
  refund_reference_value text default null,
  refund_note_value text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $manual_refund$
declare
  order_row public.orders%rowtype;
  captured integer;
  refunded_before integer;
  refunded_after integer;
  now_value timestamptz := now();
  next_status text;
begin
  if refund_ore is null or refund_ore <= 0 then
    raise exception 'INVALID_REFUND_AMOUNT';
  end if;

  select * into order_row
  from public.orders
  where id=target_order_id
  for update;

  if not found then
    raise exception 'ORDER_NOT_FOUND';
  end if;

  if order_row.order_type <> 'order' then
    raise exception 'NOT_PRODUCT_ORDER';
  end if;

  if lower(coalesce(order_row.payment_provider,''))='vipps' then
    raise exception 'VIPPS_REFUND_REQUIRES_PROVIDER_FLOW';
  end if;

  captured:=greatest(coalesce(order_row.payment_captured_ore,0),0);
  refunded_before:=greatest(coalesce(order_row.payment_refunded_ore,0),0);

  if captured <= 0 then
    raise exception 'NO_CAPTURED_PAYMENT';
  end if;

  if refunded_before >= captured then
    raise exception 'PAYMENT_ALREADY_FULLY_REFUNDED';
  end if;

  refunded_after:=refunded_before+refund_ore;

  if refunded_after > captured then
    raise exception 'REFUND_EXCEEDS_CAPTURED_PAYMENT';
  end if;

  next_status:=case when refunded_after=captured then 'refunded' else order_row.payment_status end;

  update public.orders
  set payment_refunded_ore=refunded_after,
      payment_refunded_at=now_value,
      payment_status=next_status,
      refund_last_ore=refund_ore,
      refund_reference=nullif(left(trim(coalesce(refund_reference_value,'')),120),''),
      refund_note=nullif(left(trim(coalesce(refund_note_value,'')),1000),''),
      refund_notice_sent_at=null,
      updated_at=now_value
  where id=target_order_id;

  return jsonb_build_object(
    'ok',true,
    'refundOre',refund_ore,
    'refundedBeforeOre',refunded_before,
    'refundedTotalOre',refunded_after,
    'capturedOre',captured,
    'remainingOre',captured-refunded_after,
    'paymentStatus',next_status,
    'refundedAt',now_value
  );
end;
$manual_refund$;

revoke all on function public.record_manual_order_refund(uuid,integer,text,text) from public,anon,authenticated;
grant execute on function public.record_manual_order_refund(uuid,integer,text,text) to service_role;

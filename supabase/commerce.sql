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
-- VIPPS EPAYMENT FOR PRODUKTORDRE
-- ============================================================

alter table public.orders add column if not exists payment_provider text;
alter table public.orders add column if not exists payment_psp_reference text;
alter table public.orders add column if not exists payment_authorized_at timestamptz;
alter table public.orders add column if not exists payment_captured_at timestamptz;
alter table public.orders add column if not exists payment_cancelled_at timestamptz;
alter table public.orders add column if not exists payment_refunded_at timestamptz;
alter table public.orders add column if not exists payment_refunded_ore integer not null default 0;
alter table public.orders add column if not exists payment_capture_guaranteed_until timestamptz;
alter table public.orders add column if not exists payment_stock_released_at timestamptz;
alter table public.orders add column if not exists vipps_checkout_started_at timestamptz;
create index if not exists orders_payment_provider_reference_idx on public.orders(payment_provider,payment_reference);

create schema if not exists private;
create table if not exists private.vipps_payment_events(
 psp_reference text primary key,
 payment_reference text not null,
 event_name text not null,
 amount_ore integer not null default 0,
 payload jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now()
);
revoke all on table private.vipps_payment_events from public,anon,authenticated;
grant select,insert on table private.vipps_payment_events to service_role;

create or replace function public.record_vipps_payment_event_once(
 event_psp_reference text,event_payment_reference text,event_name text,event_amount_ore integer,event_payload jsonb
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, private
as $$
begin
 insert into private.vipps_payment_events(psp_reference,payment_reference,event_name,amount_ore,payload)
 values(event_psp_reference,event_payment_reference,event_name,greatest(coalesce(event_amount_ore,0),0),coalesce(event_payload,'{}'::jsonb))
 on conflict (psp_reference) do nothing;
 return found;
end;
$$;
revoke all on function public.record_vipps_payment_event_once(text,text,text,integer,jsonb) from public,anon,authenticated;
grant execute on function public.record_vipps_payment_event_once(text,text,text,integer,jsonb) to service_role;

create or replace function public.release_order_stock_once(target_order_id uuid)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
 order_row public.orders%rowtype;
 item jsonb;
 product_id text;
 quantity integer;
begin
 select * into order_row from public.orders where id=target_order_id for update;
 if not found then return false; end if;
 if order_row.payment_stock_released_at is not null then return false; end if;
 for item in select value from jsonb_array_elements(coalesce(order_row.items,'[]'::jsonb)) loop
  if coalesce(item->>'inventoryMode','')='stock' then
   product_id:=item->>'productId';
   quantity:=coalesce((item->>'quantity')::integer,0);
   if product_id is not null and quantity>0 then
    update public.products set stock_quantity=stock_quantity+quantity,updated_at=now()
    where id=product_id and inventory_mode='stock';
    if not found then raise exception 'STOCK_RELEASE_FAILED:%',product_id; end if;
   end if;
  end if;
 end loop;
 update public.orders set payment_stock_released_at=now(),updated_at=now() where id=target_order_id;
 return true;
end;
$$;
revoke all on function public.release_order_stock_once(uuid) from public,anon,authenticated;
grant execute on function public.release_order_stock_once(uuid) to service_role;

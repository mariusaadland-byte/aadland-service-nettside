-- Vipps ePayment-integrasjon for produktordre.
-- Feltene er additive og endrer ikke eksisterende ordredata.
alter table public.orders add column if not exists payment_provider text;
alter table public.orders add column if not exists payment_psp_reference text;
alter table public.orders add column if not exists payment_authorized_at timestamptz;
alter table public.orders add column if not exists payment_captured_at timestamptz;
alter table public.orders add column if not exists payment_cancelled_at timestamptz;
alter table public.orders add column if not exists payment_refunded_at timestamptz;
alter table public.orders add column if not exists payment_capture_guaranteed_until timestamptz;
alter table public.orders add column if not exists payment_stock_released_at timestamptz;
alter table public.orders add column if not exists vipps_checkout_started_at timestamptz;

create index if not exists orders_payment_provider_reference_idx
on public.orders(payment_provider,payment_reference);

create schema if not exists private;

create table if not exists private.vipps_payment_events(
  psp_reference text primary key,
  payment_reference text not null,
  event_name text not null,
  amount_ore integer not null default 0,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

revoke all on table private.vipps_payment_events from public, anon, authenticated;
grant select,insert on table private.vipps_payment_events to service_role;

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
  select * into order_row
  from public.orders
  where id=target_order_id
  for update;

  if not found then
    return false;
  end if;

  if order_row.payment_stock_released_at is not null then
    return false;
  end if;

  for item in
    select value from jsonb_array_elements(coalesce(order_row.items,'[]'::jsonb))
  loop
    if coalesce(item->>'inventoryMode','')='stock' then
      product_id:=item->>'productId';
      quantity:=coalesce((item->>'quantity')::integer,0);
      if product_id is not null and quantity>0 then
        update public.products
        set stock_quantity=stock_quantity+quantity,
            updated_at=now()
        where id=product_id
          and inventory_mode='stock';
        if not found then
          raise exception 'STOCK_RELEASE_FAILED:%',product_id;
        end if;
      end if;
    end if;
  end loop;

  update public.orders
  set payment_stock_released_at=now(),
      updated_at=now()
  where id=target_order_id;

  return true;
end;
$$;

revoke all on function public.release_order_stock_once(uuid) from public,anon,authenticated;
grant execute on function public.release_order_stock_once(uuid) to service_role;

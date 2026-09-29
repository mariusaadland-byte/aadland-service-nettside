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

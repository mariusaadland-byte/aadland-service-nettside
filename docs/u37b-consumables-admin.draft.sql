-- DRAFT: run only in isolated test database after U-37 draft table.
begin;
alter table public.rental_consumables add column revision integer not null default 0 check (revision>=0);
alter table public.rental_consumables add constraint rental_consumables_stock_cap check(stock_quantity<=1000000);
alter table public.rental_consumables add constraint rental_consumables_threshold_cap check(low_stock_threshold<=1000000);
create table public.rental_consumable_movements (
 request_id uuid primary key,
 consumable_id uuid not null references public.rental_consumables(id) on delete restrict,
 actor_id uuid not null,
 expected_revision integer not null check(expected_revision>=0),
 delta integer not null check(delta between -1000000 and 1000000 and delta<>0),
 reason text not null check(reason in ('purchase','count','loss','supplier_return','other')),
 note text not null check(length(trim(note)) between 1 and 300),
 before_quantity integer not null check(before_quantity between 0 and 1000000),
 after_quantity integer not null check(after_quantity between 0 and 1000000),
 created_at timestamptz not null default now(),
 check(after_quantity=before_quantity+delta)
);
alter table public.rental_consumable_movements enable row level security;
revoke all on public.rental_consumable_movements from public,anon,authenticated;
grant select,insert on public.rental_consumable_movements to service_role;
grant insert (id,rental_item_id,name,sku,price_ore,cost_ore,low_stock_threshold,active) on public.rental_consumables to service_role;
grant update (rental_item_id,name,sku,price_ore,cost_ore,low_stock_threshold,active,revision,stock_quantity) on public.rental_consumables to service_role;
create function public.adjust_rental_consumable_stock(p_id uuid,p_request uuid,p_actor uuid,p_revision integer,p_delta integer,p_reason text,p_note text)
returns integer language plpgsql security invoker set search_path=pg_catalog,public as $$
declare current_row public.rental_consumables%rowtype; previous public.rental_consumable_movements%rowtype; next_qty bigint;
begin
 if p_request is null or p_id is null or p_actor is null or p_revision is null or p_revision<0 or p_delta is null or p_delta=0 or p_delta not between -1000000 and 1000000 or p_reason is null or p_reason not in ('purchase','count','loss','supplier_return','other') or p_note is null or length(trim(p_note)) not between 1 and 300 or (p_reason='purchase' and p_delta<0) or (p_reason in ('loss','supplier_return') and p_delta>0) then raise exception 'INVALID_STOCK_ADJUSTMENT'; end if;
 -- Serialize request ID as well as product row to handle retries and ID collisions.
 perform pg_advisory_xact_lock(hashtextextended(p_request::text,3702));
 select * into previous from public.rental_consumable_movements where request_id=p_request;
 if found then
  if previous.consumable_id=p_id and previous.actor_id=p_actor and previous.expected_revision=p_revision and previous.delta=p_delta and previous.reason=p_reason and previous.note=p_note then return previous.after_quantity; end if;
  raise exception 'STOCK_REQUEST_CONFLICT';
 end if;
 select * into current_row from public.rental_consumables where id=p_id for update;
 if not found or current_row.revision<>p_revision or current_row.revision>=2147483646 then raise exception 'STOCK_REVISION_CONFLICT'; end if;
 next_qty:=current_row.stock_quantity::bigint+p_delta;
 if next_qty not between 0 and 1000000 then raise exception 'STOCK_OUT_OF_RANGE'; end if;
 update public.rental_consumables set stock_quantity=next_qty::integer,revision=revision+1 where id=p_id;
 insert into public.rental_consumable_movements(request_id,consumable_id,actor_id,expected_revision,delta,reason,note,before_quantity,after_quantity)
 values(p_request,p_id,p_actor,p_revision,p_delta,p_reason,p_note,current_row.stock_quantity,next_qty::integer);
 return next_qty::integer;
end;
$$;
revoke all on function public.adjust_rental_consumable_stock(uuid,uuid,uuid,integer,integer,text,text) from public,anon,authenticated;
grant execute on function public.adjust_rental_consumable_stock(uuid,uuid,uuid,integer,integer,text,text) to service_role;
commit;
-- No anonymous/authenticated policies. Never enable before DB verification.

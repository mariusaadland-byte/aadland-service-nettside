-- ISOLATED DATABASE DESIGN DRAFT ONLY. NOT AN APPLYABLE MIGRATION.
-- Requires U-37 A/B schema in disposable database; supersedes U-37C schema draft.
-- Rollback intentionally preserves live data. No callable order RPC.
begin;
create table public.rental_order_groups (
 id uuid primary key default gen_random_uuid(),
 order_number bigint generated always as identity unique,
 customer_user_id uuid not null references auth.users(id) on delete restrict,
 request_id uuid not null,
 quote_digest text not null check(quote_digest ~ '^[0-9a-f]{64}$'),
 quote_snapshot jsonb not null check(jsonb_typeof(quote_snapshot)='object'),
 terms_version text not null,
 rental_ore integer not null check(rental_ore>=0),
 sales_ore integer not null check(sales_ore>=0),
 deposit_ore integer not null check(deposit_ore>=0),
 payable_ore integer not null check(payable_ore>0),
 status text not null default 'held' check(status in ('held','payment_pending','confirmed','released','fulfilled','review')),
 expires_at timestamptz not null,
 payment_reference text unique,
 created_at timestamptz not null default now(),
 unique(customer_user_id,request_id),
 check(payable_ore::bigint=rental_ore::bigint+sales_ore),
 check(payable_ore::bigint+deposit_ore<=2147483647)
);
-- One existing rental booking per physical unit. Child writers and readers need
-- group awareness BEFORE enabling. Do not populate these columns in live.
alter table public.rental_bookings add column group_id uuid references public.rental_order_groups(id) on delete restrict;
alter table public.rental_bookings add column group_unit integer check(group_unit>0);
alter table public.rental_bookings add constraint rental_group_unit_pair check((group_id is null)=(group_unit is null));
create unique index rental_group_unit_unique on public.rental_bookings(group_id,rental_item_id,group_unit) where group_id is not null;
alter table public.rental_consumables add column reserved_quantity integer not null default 0 check(reserved_quantity between 0 and stock_quantity);
create table public.rental_group_goods (
 group_id uuid not null references public.rental_order_groups(id) on delete restrict,
 consumable_id uuid not null references public.rental_consumables(id) on delete restrict,
 sku text not null, name text not null,
 quantity integer not null check(quantity between 1 and 100),
 unit_ore integer not null check(unit_ore>0),
 primary key(group_id,consumable_id)
);
create table public.rental_group_events(
 group_id uuid not null references public.rental_order_groups(id) on delete restrict,
 event text not null check(event in ('reserve','payment_start','confirm','release','fulfill')),
 source_reference text not null check(length(source_reference) between 1 and 200),
 created_at timestamptz not null default now(),
 primary key(group_id,event)
);
alter table public.rental_order_groups enable row level security;
alter table public.rental_group_goods enable row level security;
alter table public.rental_group_events enable row level security;
revoke all on public.rental_order_groups,public.rental_group_goods,public.rental_group_events from public,anon,authenticated,service_role;
revoke all on sequence public.rental_order_groups_order_number_seq from public,anon,authenticated,service_role;
-- Activation requires shared capacity guards, group-aware payment/expiry,
-- atomic create/release RPC and isolated integration tests.

-- U-37F: isolated candidate functions. No grants to runtime roles.
-- Only a trusted server may construct the snapshot/digest from freshly accepted terms.
-- Full integration with existing writers is deliberately not enabled.
create function public.draft_group_reserve(
 p_customer uuid,p_request uuid,p_digest text,p_snapshot jsonb
) returns uuid language plpgsql security invoker set search_path=pg_catalog,public as $$
declare
 old_group public.rental_order_groups%rowtype;
 r jsonb; g jsonb; item public.rental_items%rowtype; goods public.rental_consumables%rowtype;
 group_uuid uuid; item_uuid uuid; goods_uuid uuid; first_day date; last_day date;
 today date:=(clock_timestamp() at time zone 'Europe/Oslo')::date;
 n integer; d integer; u integer; peak bigint; unit_price bigint; weekly bigint;
 rental_sum bigint:=0; sales_sum bigint:=0; deposit_sum bigint:=0;
 buffer integer; ordinal integer; expiry timestamptz;
begin
 if p_customer is null or p_request is null or p_digest is null or p_digest !~ '^[0-9a-f]{64}$'
 or jsonb_typeof(p_snapshot) is distinct from 'object'
 or p_snapshot->>'version' is distinct from '1'
 or p_snapshot->>'termsVersion' is distinct from '2026-11-25'
 or p_snapshot->>'fulfillment' is distinct from 'pickup'
 or jsonb_typeof(p_snapshot->'rentals') is distinct from 'array'
 or jsonb_typeof(p_snapshot->'goods') is distinct from 'array'
 then raise exception 'GROUP_INVALID'; end if;
 if jsonb_array_length(p_snapshot->'rentals') not between 1 and 10 or jsonb_array_length(p_snapshot->'goods')>20 then raise exception 'GROUP_INVALID'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_customer::text||':'||p_request::text,3706));
 select * into old_group from public.rental_order_groups where customer_user_id=p_customer and request_id=p_request;
 if found then
  if old_group.quote_digest=p_digest and old_group.quote_snapshot=p_snapshot then return old_group.id; end if;
  raise exception 'GROUP_REQUEST_CONFLICT';
 end if;
 if (select count(distinct (x->>'itemId')::uuid) from jsonb_array_elements(p_snapshot->'rentals') x)<>jsonb_array_length(p_snapshot->'rentals')
 or (select count(distinct (x->>'id')::uuid) from jsonb_array_elements(p_snapshot->'goods') x)<>jsonb_array_length(p_snapshot->'goods')
 then raise exception 'GROUP_DUPLICATE'; end if;
 -- Take all same per-item advisory locks used by legacy checkout first.
 for item_uuid in select (x->>'itemId')::uuid from jsonb_array_elements(p_snapshot->'rentals') x order by 1 loop
  perform pg_advisory_xact_lock(hashtext(item_uuid::text));
 end loop;
 for r in select x from jsonb_array_elements(p_snapshot->'rentals') x order by (x->>'itemId')::uuid loop
  item_uuid:=(r->>'itemId')::uuid; n:=(r->>'quantity')::integer;
  first_day:=(r->>'startDate')::date; last_day:=(r->>'endDate')::date;
  if n is null or n not between 1 and 20 or first_day is null or last_day is null or first_day<today or last_day<first_day or last_day-first_day>=365 then raise exception 'GROUP_INVALID'; end if;
  select * into item from public.rental_items where id=item_uuid for update;
  if not found or item.active is distinct from true or item.status is distinct from 'available' or item.pickup_available is distinct from true or item.daily_price_ore<=0 or item.deposit_ore<0 or item.long_term_discount_percent not between 0 and 100 then raise exception 'GROUP_UNAVAILABLE'; end if;
  d:=last_day-first_day+1; buffer:=greatest(0,coalesce(item.buffer_days,0));
  unit_price:=d::bigint*item.daily_price_ore;
  if d>=7 and item.weekly_price_ore>0 then
   weekly:=(d/7)::bigint*item.weekly_price_ore+(d%7)::bigint*item.daily_price_ore;
   unit_price:=least(unit_price,weekly);
  end if;
  if d<=3 and item.weekend_price_ore>0 and (extract(dow from first_day) in (0,5,6) or extract(dow from last_day) in (0,5,6)) then unit_price:=least(unit_price,item.weekend_price_ore); end if;
  if item.long_term_days>0 and d>=item.long_term_days and item.long_term_discount_percent>0 then
   unit_price:=round(unit_price::numeric*(1-item.long_term_discount_percent/100));
  end if;
  if (r->>'name') is distinct from item.name or (r->>'totalOre')::bigint is distinct from unit_price*n or (r->>'depositOre')::bigint is distinct from item.deposit_ore::bigint*n then raise exception 'GROUP_PRICE_CHANGED'; end if;
  if exists(select 1 from public.rental_blocks b where b.rental_item_id=item_uuid and b.start_date<=last_day+buffer and b.end_date>=first_day-buffer) then raise exception 'GROUP_UNAVAILABLE'; end if;
  -- Group children ALWAYS count until explicit group release. Old active overdue
  -- rentals block through the requested end, not merely their scheduled end.
  select coalesce(max(c),0) into peak from (
   select count(b.id) c from generate_series(first_day::timestamp,last_day::timestamp,interval '1 day') day
   left join public.rental_bookings b on b.rental_item_id=item_uuid and b.status in ('new','confirmed','active')
    and (b.group_id is not null or b.status<>'new' or b.payment_due_at is null or b.payment_due_at>clock_timestamp() or b.payment_status is distinct from 'unpaid' or b.payment_reference is not null)
    and b.start_date<=day::date+buffer
    and (b.end_date>=day::date-buffer or (b.status='active' and b.end_date<today))
   group by day
  ) counts;
  if peak+n>item.quantity then raise exception 'GROUP_UNAVAILABLE'; end if;
  rental_sum:=rental_sum+unit_price*n; deposit_sum:=deposit_sum+item.deposit_ore::bigint*n;
 end loop;
 for g in select x from jsonb_array_elements(p_snapshot->'goods') x order by (x->>'id')::uuid loop
  goods_uuid:=(g->>'id')::uuid; n:=(g->>'quantity')::integer;
  if n is null or n not between 1 and 100 then raise exception 'GROUP_INVALID'; end if;
  select * into goods from public.rental_consumables where id=goods_uuid for update;
  if not found or goods.active is distinct from true or goods.stock_quantity-goods.reserved_quantity<n or goods.revision>=2147483646 or not exists(select 1 from jsonb_array_elements(p_snapshot->'rentals') x where (x->>'itemId')::uuid=goods.rental_item_id) then raise exception 'GROUP_UNAVAILABLE'; end if;
  if g->>'name' is distinct from goods.name or g->>'sku' is distinct from goods.sku or (g->>'unitOre')::bigint is distinct from goods.price_ore::bigint or (g->>'totalOre')::bigint is distinct from goods.price_ore::bigint*n then raise exception 'GROUP_PRICE_CHANGED'; end if;
  sales_sum:=sales_sum+goods.price_ore::bigint*n;
 end loop;
 if rental_sum+sales_sum<=0 or rental_sum+sales_sum+deposit_sum>2147483647
 or (p_snapshot->>'rentalOre')::bigint is distinct from rental_sum
 or (p_snapshot->>'salesOre')::bigint is distinct from sales_sum
 or (p_snapshot->>'depositOre')::bigint is distinct from deposit_sum
 or (p_snapshot->>'payableOre')::bigint is distinct from rental_sum+sales_sum then raise exception 'GROUP_PRICE_CHANGED'; end if;
 expiry:=clock_timestamp()+interval '30 minutes';
 insert into public.rental_order_groups(customer_user_id,request_id,quote_digest,quote_snapshot,terms_version,rental_ore,sales_ore,deposit_ore,payable_ore,expires_at)
 values(p_customer,p_request,p_digest,p_snapshot,'2026-11-25',rental_sum::integer,sales_sum::integer,deposit_sum::integer,(rental_sum+sales_sum)::integer,expiry)
 returning id into group_uuid;
 ordinal:=0;
 for r in select x from jsonb_array_elements(p_snapshot->'rentals') x order by (x->>'itemId')::uuid loop
  n:=(r->>'quantity')::integer;
  for u in 1..n loop
   ordinal:=ordinal+1;
   -- No child payment deadline/reference: only group controls expiry.
   insert into public.rental_bookings(group_id,group_unit,customer_user_id,booking_number,rental_item_id,customer,start_date,end_date,status,price_snapshot,total_ore,deposit_ore,terms_version,payment_due_at)
   values(group_uuid,u,p_customer,'GRP-'||group_uuid::text||'-'||ordinal,(r->>'itemId')::uuid,'{}'::jsonb,(r->>'startDate')::date,(r->>'endDate')::date,'new',r,(r->>'totalOre')::integer/n,(r->>'depositOre')::integer/n,'2026-11-25',null);
  end loop;
 end loop;
 for g in select x from jsonb_array_elements(p_snapshot->'goods') x order by (x->>'id')::uuid loop
  goods_uuid:=(g->>'id')::uuid;n:=(g->>'quantity')::integer;
  update public.rental_consumables set reserved_quantity=reserved_quantity+n,revision=revision+1 where id=goods_uuid;
  insert into public.rental_group_goods(group_id,consumable_id,sku,name,quantity,unit_ore)
  values(group_uuid,goods_uuid,g->>'sku',g->>'name',n,(g->>'unitOre')::integer);
 end loop;
 insert into public.rental_group_events(group_id,event,source_reference) values(group_uuid,'reserve',p_request::text);
 return group_uuid;
end $$;
revoke all on function public.draft_group_reserve(uuid,uuid,text,jsonb) from public,anon,authenticated,service_role;

-- Only never-started holds. Future payment start MUST take same group row lock
-- and commit payment_start/reference before calling the provider.
create function public.draft_group_expire(p_group uuid)
returns boolean language plpgsql security invoker set search_path=pg_catalog,public as $$
declare grp public.rental_order_groups%rowtype; r record; actual integer;
begin
 select * into grp from public.rental_order_groups where id=p_group for update;
 if not found or grp.status<>'held' or grp.expires_at>clock_timestamp() or grp.payment_reference is not null or exists(select 1 from public.rental_group_events where group_id=p_group and event='payment_start') then return false; end if;
 for r in select distinct rental_item_id from public.rental_bookings where group_id=p_group order by rental_item_id loop
  perform pg_advisory_xact_lock(hashtext(r.rental_item_id::text));
 end loop;
 -- Refuse to release if any child shows unexpected changes/payment.
 if exists(select 1 from public.rental_bookings where group_id=p_group and (status is distinct from 'new' or payment_status is distinct from 'unpaid' or payment_reference is not null or coalesce(payment_captured_ore,0)<>0 or coalesce(payment_reserved_ore,0)<>0)) then raise exception 'GROUP_REVIEW_REQUIRED'; end if;
 select count(*) into actual from public.rental_bookings where group_id=p_group;
 if actual is distinct from (select sum((x->>'quantity')::integer) from jsonb_array_elements(grp.quote_snapshot->'rentals') x) then raise exception 'GROUP_REVIEW_REQUIRED'; end if;
 for r in select consumable_id,quantity from public.rental_group_goods where group_id=p_group order by consumable_id loop
  update public.rental_consumables set reserved_quantity=reserved_quantity-r.quantity,revision=revision+1
  where id=r.consumable_id and reserved_quantity>=r.quantity and revision<2147483646;
  if not found then raise exception 'GROUP_REVIEW_REQUIRED'; end if;
 end loop;
 update public.rental_bookings set status='cancelled',updated_at=clock_timestamp() where group_id=p_group;
 update public.rental_order_groups set status='released' where id=p_group;
 insert into public.rental_group_events(group_id,event,source_reference) values(p_group,'release','expiry:'||p_group::text);
 return true;
end $$;
revoke all on function public.draft_group_expire(uuid) from public,anon,authenticated,service_role;
-- No scheduler, endpoint, grants, or production migration.
rollback;

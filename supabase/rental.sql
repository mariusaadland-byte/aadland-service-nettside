-- Samlet utleiemigrasjon. Kan kjøres senere i Supabase SQL Editor.
create table if not exists public.rental_items (
 id uuid primary key default gen_random_uuid(), name text not null, slug text not null unique, description text,
 image_urls jsonb not null default '[]'::jsonb, status text not null default 'available' check (status in ('available','unavailable','hidden','maintenance')),
 quantity integer not null default 1 check (quantity > 0), daily_price_ore integer not null default 0 check (daily_price_ore >= 0), weekend_price_ore integer check (weekend_price_ore is null or weekend_price_ore >= 0), weekly_price_ore integer check (weekly_price_ore is null or weekly_price_ore >= 0),
 long_term_days integer check (long_term_days is null or long_term_days > 0), long_term_discount_percent numeric(5,2) not null default 0 check (long_term_discount_percent between 0 and 100), deposit_ore integer not null default 0 check (deposit_ore >= 0), buffer_days integer not null default 0 check (buffer_days >= 0),
 delivery_available boolean not null default false, pickup_available boolean not null default true, active boolean not null default true, sort_order integer not null default 0,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.rental_blocks (
 id uuid primary key default gen_random_uuid(), rental_item_id uuid not null references public.rental_items(id) on delete cascade,
 start_date date not null, end_date date not null, reason text, created_at timestamptz not null default now(), check (end_date >= start_date)
);
create table if not exists public.rental_bookings (
 id uuid primary key default gen_random_uuid(), booking_number text not null unique, rental_item_id uuid not null references public.rental_items(id),
 customer jsonb not null default '{}'::jsonb, start_date date not null, end_date date not null,
 status text not null default 'new' check(status in ('new','confirmed','active','returned','completed','cancelled')),
 price_snapshot jsonb not null default '{}'::jsonb, total_ore integer not null default 0 check (total_ore >= 0), deposit_ore integer not null default 0 check (deposit_ore >= 0),
 payment_status text not null default 'unpaid', deposit_status text not null default 'not_paid', admin_note text, terms_version text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), check (end_date >= start_date)
);
alter table public.rental_bookings add column if not exists payment_status text not null default 'unpaid';
alter table public.rental_bookings add column if not exists deposit_status text not null default 'not_paid';
alter table public.rental_bookings add column if not exists admin_note text;
alter table public.rental_bookings add column if not exists customer_user_id uuid references auth.users(id) on delete set null;
alter table public.rental_items enable row level security; alter table public.rental_blocks enable row level security; alter table public.rental_bookings enable row level security;
grant select,insert,update,delete on public.rental_items to service_role; grant select,insert,update,delete on public.rental_blocks to service_role; grant select,insert,update,delete on public.rental_bookings to service_role;
create index if not exists rental_blocks_item_dates_idx on public.rental_blocks(rental_item_id,start_date,end_date);
create index if not exists rental_bookings_item_dates_idx on public.rental_bookings(rental_item_id,start_date,end_date);
create index if not exists rental_bookings_status_idx on public.rental_bookings(status);


-- Serialiserer booking av samme utleieartikkel slik at samtidige forespørsler
-- ikke kan passere tilgjengelighetskontrollen samtidig.
create or replace function public.create_rental_booking_if_available(
  booking_record jsonb,
  buffered_start date,
  buffered_end date
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  item_id uuid;
  item_quantity integer;
  item_status text;
  used_count integer;
  new_id uuid;
begin
  item_id := (booking_record->>'rental_item_id')::uuid;
  perform pg_advisory_xact_lock(hashtext(item_id::text));

  select quantity,status into item_quantity,item_status
  from public.rental_items
  where id=item_id and active=true
  for update;

  if not found or item_status <> 'available' then
    raise exception 'RENTAL_UNAVAILABLE';
  end if;

  select
    (select count(*) from public.rental_blocks
      where rental_item_id=item_id and start_date <= buffered_end and end_date >= buffered_start)
    +
    (select count(*) from public.rental_bookings
      where rental_item_id=item_id and status in ('new','confirmed','active')
        and start_date <= buffered_end and end_date >= buffered_start)
  into used_count;

  if used_count >= greatest(1,item_quantity) then
    raise exception 'RENTAL_UNAVAILABLE';
  end if;

  insert into public.rental_bookings(
    customer_user_id,booking_number,rental_item_id,customer,start_date,end_date,status,
    price_snapshot,total_ore,deposit_ore,terms_version
  ) values (
    nullif(booking_record->>'customer_user_id','')::uuid,
    booking_record->>'booking_number',item_id,booking_record->'customer',
    (booking_record->>'start_date')::date,(booking_record->>'end_date')::date,
    'new',booking_record->'price_snapshot',(booking_record->>'total_ore')::integer,
    (booking_record->>'deposit_ore')::integer,booking_record->>'terms_version'
  )
  returning id into new_id;

  return new_id;
end;
$$;
revoke all on function public.create_rental_booking_if_available(jsonb,date,date) from public, anon, authenticated;
grant execute on function public.create_rental_booking_if_available(jsonb,date,date) to service_role;


-- Utleiekategorier: holder utleiekatalogen ryddig og kobler hvert utleieprodukt til valgfri kategori.
create table if not exists public.rental_categories (
 id uuid primary key default gen_random_uuid(),
 name text not null,
 slug text not null unique,
 description text,
 sort_order integer not null default 0,
 active boolean not null default true,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);

alter table public.rental_items
 add column if not exists category_id uuid references public.rental_categories(id) on delete set null;

alter table public.rental_categories enable row level security;
grant select,insert,update,delete on public.rental_categories to service_role;

create index if not exists rental_categories_active_sort_idx on public.rental_categories(active,sort_order);
create index if not exists rental_items_category_idx on public.rental_items(category_id,sort_order);

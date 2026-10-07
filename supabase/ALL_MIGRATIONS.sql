-- Aadland Service - samlet Supabase-migrasjon
-- Rekkefølge: schema -> commerce -> surveys -> rental -> customers -> projects -> services -> site-settings
-- Holdes synkron med de separate migrasjonsfilene. Kan brukes ved et nytt, tomt Supabase-prosjekt.


-- ============================================================
-- supabase/schema.sql
-- ============================================================

create table if not exists products (
  id text primary key,
  slug text not null unique,
  name text not null,
  category text not null,
  eyebrow text,
  description text not null,
  base_price_ore integer not null,
  options jsonb not null default '[]'::jsonb,
  image_url text,
  icon text,
  accent text,
  featured boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique,
  order_type text not null check (order_type in ('order','custom')),
  status text not null default 'new',
  customer jsonb not null,
  fulfillment_type text not null,
  delivery_within_radius boolean,
  items jsonb not null default '[]'::jsonb,
  custom_request text,
  total_ore integer not null default 0,
  created_at timestamptz not null default now()
);


-- Kolonner som nyere produkt- og kategoriadministrasjon forventer.
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text,
  image_url text,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.categories enable row level security;
grant select,insert,update,delete on public.categories to service_role;
create index if not exists categories_active_sort_idx on public.categories(active,sort_order);

alter table public.products add column if not exists category_id uuid references public.categories(id) on delete set null;
alter table public.products add column if not exists image_urls jsonb not null default '[]'::jsonb;
alter table public.products add column if not exists dimensions text;
alter table public.products add column if not exists specifications jsonb not null default '[]'::jsonb;
alter table public.products add column if not exists updated_at timestamptz not null default now();
create index if not exists products_category_id_idx on public.products(category_id);
alter table public.products enable row level security;
alter table public.orders enable row level security;
grant select,insert,update,delete on public.products to service_role;
grant select,insert,update,delete on public.orders to service_role;

insert into public.categories (name,slug,sort_order,active)
values
('Benker','benker',10,true),
('Uteplassen','uteplassen',20,true),
('Bord','bord',30,true)
on conflict (slug) do update set name=excluded.name,active=true;

insert into products
(id,slug,name,category,eyebrow,description,base_price_ore,options,image_url,icon,accent,featured,active)
values
('bench-spiler','spilebenk','Spilebenk','Benker','Favoritt',
'En enkel og solid benk med tydelig treverk og et rolig uttrykk. Tilpasses etter plassen du har.',
299000,
'[{"id":"length","label":"Lengde","choices":[{"label":"120 cm","value":"120 cm","extraOre":0},{"label":"160 cm","value":"160 cm","extraOre":90000},{"label":"200 cm","value":"200 cm","extraOre":180000}]},{"id":"finish","label":"Overflate","choices":[{"label":"Ubehandlet","value":"Ubehandlet","extraOre":0},{"label":"Oljet","value":"Oljet","extraOre":25000},{"label":"Svartbeiset","value":"Svartbeiset","extraOre":35000}]}]'::jsonb,
null,'Bench','ember',true,true),
('planter-box','plantekasse','Plantekasse','Uteplassen','Tilpasses uteplassen',
'Plantekasser bygget etter ønsket mål, med plass til urter, blomster eller grønne planter.',
169000,
'[{"id":"length","label":"Lengde","choices":[{"label":"60 cm","value":"60 cm","extraOre":0},{"label":"90 cm","value":"90 cm","extraOre":50000},{"label":"120 cm","value":"120 cm","extraOre":90000}]},{"id":"finish","label":"Overflate","choices":[{"label":"Ubehandlet","value":"Ubehandlet","extraOre":0},{"label":"Oljet","value":"Oljet","extraOre":25000},{"label":"Svartbeiset","value":"Svartbeiset","extraOre":35000}]}]'::jsonb,
null,'Planter','moss',true,true),
('coffee-table','kaffebord','Kaffebord','Bord','Håndlaget i tre',
'Et rent og robust kaffebord som kan lages smalt, lavt eller stort nok til hele sofasonen.',
249000,
'[{"id":"size","label":"Størrelse","choices":[{"label":"70 × 50 cm","value":"70 × 50 cm","extraOre":0},{"label":"90 × 60 cm","value":"90 × 60 cm","extraOre":80000},{"label":"120 × 70 cm","value":"120 × 70 cm","extraOre":150000}]},{"id":"finish","label":"Overflate","choices":[{"label":"Ubehandlet","value":"Ubehandlet","extraOre":0},{"label":"Oljet","value":"Oljet","extraOre":25000},{"label":"Svartbeiset","value":"Svartbeiset","extraOre":35000}]}]'::jsonb,
null,'Table','clay',false,true)
on conflict (id) do nothing;

update public.products p
set category_id=c.id
from public.categories c
where p.category_id is null and lower(trim(p.category))=lower(trim(c.name));

-- Backoffice-brukere. Selve Auth-brukeren opprettes i Supabase Auth og kobles via samme UUID.
create table if not exists public.admin_users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  name text not null,
  role text not null default 'user',
  can_view_orders boolean not null default false,
  can_update_orders boolean not null default false,
  can_manage_products boolean not null default false,
  can_manage_users boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.admin_users add column if not exists updated_at timestamptz not null default now();
alter table public.admin_users enable row level security;
grant select,insert,update,delete on public.admin_users to service_role;
create index if not exists admin_users_active_idx on public.admin_users(active);

-- Produktbilder er offentlige fordi URL-ene brukes direkte på nettsiden.
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('product-images','product-images',true,10485760,array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public=true,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

-- Private kundebilder fra kontaktskjema. Produktbilder bruker fortsatt offentlig product-images-bucket.
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('contact-images','contact-images',false,10485760,array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

-- ============================================================
-- supabase/commerce.sql
-- ============================================================

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
-- supabase/surveys.sql
-- ============================================================

alter table public.orders
add column if not exists survey_date timestamptz,
add column if not exists admin_note text;

create index if not exists orders_survey_date_idx
on public.orders(survey_date)
where survey_date is not null;

-- ============================================================
-- supabase/rental.sql
-- ============================================================

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
alter table public.rental_bookings add column if not exists payment_reference text;
alter table public.rental_bookings add column if not exists payment_captured_ore integer not null default 0;
alter table public.rental_bookings add column if not exists receipt_sent_at timestamptz;
alter table public.rental_bookings add column if not exists deposit_reference text;
alter table public.rental_bookings add column if not exists deposit_held_ore integer not null default 0;
alter table public.rental_bookings add column if not exists deposit_received_at timestamptz;
alter table public.rental_bookings add column if not exists deposit_released_at timestamptz;
alter table public.rental_bookings add column if not exists deposit_charged_ore integer not null default 0;
create index if not exists rental_bookings_payment_status_idx on public.rental_bookings(payment_status);
create index if not exists rental_bookings_deposit_status_idx on public.rental_bookings(deposit_status);
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
set search_path = pg_catalog, public
as $$
declare
  item_id uuid;
  item_quantity integer;
  item_status text;
  booked_count integer;
  is_manually_blocked boolean;
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

  select exists(
    select 1
    from public.rental_blocks
    where rental_item_id=item_id
      and start_date <= buffered_end
      and end_date >= buffered_start
  ) into is_manually_blocked;

  if is_manually_blocked then
    raise exception 'RENTAL_UNAVAILABLE';
  end if;

  select count(*)
  into booked_count
  from public.rental_bookings
  where rental_item_id=item_id
    and status in ('new','confirmed','active')
    and start_date <= buffered_end
    and end_date >= buffered_start;

  if booked_count >= greatest(1,item_quantity) then
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

-- ============================================================
-- supabase/customers.sql
-- ============================================================

-- Kundekonto / Min side. FORBEREDT migrasjon – ikke kjørt automatisk.
create table if not exists public.customer_profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 email text not null unique,
 name text,
 phone text,
 address text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table public.orders add column if not exists customer_user_id uuid references auth.users(id) on delete set null;
alter table public.rental_bookings add column if not exists customer_user_id uuid references auth.users(id) on delete set null;
create index if not exists orders_customer_user_idx on public.orders(customer_user_id,created_at desc);
create index if not exists rental_bookings_customer_user_idx on public.rental_bookings(customer_user_id,created_at desc);
alter table public.customer_profiles enable row level security;
grant select,insert,update,delete on public.customer_profiles to service_role;

-- ============================================================
-- supabase/projects.sql
-- ============================================================

-- Tidligere oppdrag / referanseprosjekter
create table if not exists public.projects (
 id uuid primary key default gen_random_uuid(),
 title text not null,
 slug text not null unique,
 category text,
 description text,
 image_urls jsonb not null default '[]'::jsonb,
 content_blocks jsonb not null default '[]'::jsonb,
 featured boolean not null default true,
 active boolean not null default true,
 sort_order integer not null default 0,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table public.projects enable row level security;
grant select,insert,update,delete on public.projects to service_role;
create index if not exists projects_active_sort_idx on public.projects(active,sort_order);

-- Fleksibel prosjektfortelling med bilde- og tekstblokker.
alter table public.projects
 add column if not exists content_blocks jsonb not null default '[]'::jsonb;


-- Tegninger knyttet til oppdrag. Kjør først når testgrenen er klar for databaseoppgradering.
create table if not exists public.project_drawings (
 id uuid primary key default gen_random_uuid(),
 project_id uuid references public.projects(id) on delete cascade,
 name text not null default 'Ny tegning',
 customer text,
 address text,
 notes text,
 drawing_data jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table public.project_drawings enable row level security;
grant select,insert,update,delete on public.project_drawings to service_role;
create index if not exists project_drawings_project_idx on public.project_drawings(project_id,updated_at desc);

-- ============================================================
-- supabase/services.sql
-- ============================================================

create table if not exists public.services (
 id uuid primary key default gen_random_uuid(), title text not null, slug text not null unique,
 description text, image_url text, kind text not null default 'service',
 active boolean not null default true, show_on_home boolean not null default true,
 show_in_menu boolean not null default true, show_in_footer boolean not null default true,
 has_page boolean not null default false, cta_label text not null default 'Les mer', cta_href text,
 form_title text not null default 'Be om befaring', form_prompt text not null default 'Beskriv kort hva du ønsker hjelp med.',
 publish_from timestamptz, publish_until timestamptz, sort_order integer not null default 0,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
alter table public.services enable row level security;
grant select, insert, update, delete on table public.services to service_role;
create index if not exists services_sort_order_idx on public.services(sort_order, created_at);

-- ============================================================
-- supabase/site-settings.sql
-- ============================================================

begin;
create table if not exists public.site_settings (
 id text primary key default 'main',
 hero_eyebrow text not null default 'BYGG · RENOVERING · UTEOMRÅDER · VEDLIKEHOLD',
 hero_title text not null default 'Kvalitet som varer.',
 hero_text text not null default 'Aadland Service leverer solide løsninger innen bygg, oppussing, vedlikehold og uteområder. Vi kombinerer fagkunnskap, nøyaktighet og god oppfølging – tilpasset dine behov.',
 about_title text not null default 'Lokalt håndverk med stolthet.',
 about_text text not null default 'Vi hjelper med oppussing, vedlikehold, uteområder og spesialtilpassede løsninger. Målet er enkelt: ryddig kommunikasjon, praktiske valg og et resultat du kan være fornøyd med.',
 phone text not null default '471 54 898',
 email text not null default 'post@aadland-service.no',
 org_number text not null default '937 781 873 MVA',
 location text not null default 'Bergen og omegn',
 seasonal_title text,
 seasonal_text text,
 seasonal_cta_label text,
 seasonal_cta_href text,
 seasonal_from date,
 seasonal_until date,
 show_seasonal boolean not null default false,
 show_services boolean not null default true,
 show_projects boolean not null default true,
 show_about boolean not null default true,
 show_survey boolean not null default true,
 updated_at timestamptz not null default now()
);
insert into public.site_settings(id) values('main') on conflict(id) do nothing;
alter table public.site_settings enable row level security;
grant select,insert,update,delete on public.site_settings to service_role;
commit;


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


-- ============================================================
-- supabase/quotes.sql
-- ============================================================

create sequence if not exists public.quote_number_seq start with 1001;

create table if not exists public.quotes (
  id uuid primary key default gen_random_uuid(),
  quote_number text not null unique,
  status text not null default 'draft',
  title text not null,
  customer jsonb not null,
  line_items jsonb not null default '[]'::jsonb,
  payment_plan jsonb not null default '[
    {"id":"deposit","label":"Forskudd","percent":25,"trigger":"Ved aksept av tilbud"},
    {"id":"halfway","label":"Halvført arbeid","percent":50,"trigger":"Når omtrent halvparten av arbeidet er utført"},
    {"id":"completion","label":"Ferdigstillelse","percent":25,"trigger":"Ved ferdigstillelse"}
  ]'::jsonb,
  subtotal_ex_vat_ore integer not null default 0,
  vat_ore integer not null default 0,
  total_inc_vat_ore integer not null default 0,
  intro_text text,
  notes text,
  terms text,
  valid_until date,
  source_order_id uuid references public.orders(id) on delete set null,
  created_by uuid references public.admin_users(id) on delete set null,
  sent_at timestamptz,
  accepted_at timestamptz,
  declined_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.quotes drop constraint if exists quotes_status_check;
alter table public.quotes add constraint quotes_status_check
  check (status in ('draft','sent','accepted','declined','expired','cancelled'));

alter table public.quotes enable row level security;
grant select,insert,update,delete on public.quotes to service_role;
grant usage,select on sequence public.quote_number_seq to service_role;

create index if not exists quotes_status_idx on public.quotes(status,created_at desc);
create index if not exists quotes_archived_idx on public.quotes(archived_at,created_at desc);
create index if not exists quotes_source_order_idx on public.quotes(source_order_id);

create or replace function public.next_quote_number()
returns text
language sql
security definer
set search_path = public
as $$
  select 'TILB-' || to_char(current_date,'YYYY') || '-' || lpad(nextval('public.quote_number_seq')::text,4,'0');
$$;

revoke all on function public.next_quote_number() from public,anon,authenticated;
grant execute on function public.next_quote_number() to service_role;


-- ============================================================
-- supabase/quote_to_order.sql
-- ============================================================

-- Koble godkjent tilbud til opprettet oppdrag
alter table public.quotes
 add column if not exists converted_order_id uuid
 references public.orders(id)
 on delete set null;

create unique index if not exists quotes_converted_order_unique_idx
on public.quotes(converted_order_id)
where converted_order_id is not null;


-- ============================================================
-- supabase/quote_start_date.sql
-- ============================================================

-- Planlagt oppstart som vises i tilbudet til kunden
alter table public.quotes
 add column if not exists planned_start_date date;


-- ============================================================
-- supabase/job_planning.sql
-- ============================================================

-- Planlegging av godkjente oppdrag og kundebekreftelse
alter table public.orders
 add column if not exists job_start_at timestamptz,
 add column if not exists job_customer_agreement text,
 add column if not exists job_planning_updated_at timestamptz,
 add column if not exists job_confirmation_sent_at timestamptz;

create index if not exists orders_job_start_at_idx
on public.orders(job_start_at)
where job_start_at is not null;


-- ============================================================
-- supabase/quote_followups.sql
-- ============================================================

-- Automatisk oppfølging av sendte tilbud etter ca. 2 døgn.
alter table public.quotes
 add column if not exists auto_follow_up boolean not null default true,
 add column if not exists follow_up_sent_at timestamptz;

create index if not exists quotes_follow_up_due_idx
on public.quotes(sent_at)
where status='sent'
  and archived_at is null
  and auto_follow_up=true
  and follow_up_sent_at is null;


-- ============================================================
-- supabase/security_hardening_20260923.sql
-- ============================================================

revoke execute on function public.rls_auto_enable() from public;
revoke execute on function public.rls_auto_enable() from anon;
revoke execute on function public.rls_auto_enable() from authenticated;

create index if not exists quotes_created_by_idx
on public.quotes(created_by);

drop policy if exists admin_users_read_own on public.admin_users;
create policy admin_users_read_own
on public.admin_users
for select
to authenticated
using (id = (select auth.uid()));


-- ============================================================
-- supabase/survey_reminders.sql
-- ============================================================

alter table public.orders
 add column if not exists survey_confirmation_sent_at timestamptz,
 add column if not exists survey_reminder_sent_at timestamptz;

create index if not exists orders_survey_reminder_due_idx
on public.orders(survey_date)
where order_type='custom'
  and status='confirmed'
  and survey_date is not null
  and survey_confirmation_sent_at is not null
  and survey_reminder_sent_at is null
  and archived_at is null;


-- ============================================================
-- supabase/job_reminders.sql
-- ============================================================

alter table public.orders
 add column if not exists job_reminder_sent_at timestamptz;

create index if not exists orders_job_reminder_due_idx
on public.orders(job_start_at)
where order_type='custom'
  and status='confirmed'
  and job_start_at is not null
  and job_confirmation_sent_at is not null
  and job_reminder_sent_at is null
  and archived_at is null;


-- ============================================================
-- supabase/rental_notifications.sql
-- ============================================================

alter table public.rental_bookings
 add column if not exists confirmation_sent_at timestamptz,
 add column if not exists cancellation_sent_at timestamptz;

create index if not exists rental_bookings_notification_idx
on public.rental_bookings(status, start_date)
where status in ('new','confirmed','cancelled');


-- ============================================================
-- supabase/rental_reminders.sql
-- ============================================================

alter table public.rental_bookings
 add column if not exists reminder_sent_at timestamptz;

create index if not exists rental_bookings_reminder_due_idx
on public.rental_bookings(start_date)
where status='confirmed'
  and confirmation_sent_at is not null
  and reminder_sent_at is null;


-- ============================================================
-- supabase/migrations/20260926005033_app_rate_limiting.sql
-- ============================================================

create schema if not exists private;

revoke all on schema private from public;
revoke all on schema private from anon;
revoke all on schema private from authenticated;

create table if not exists private.app_rate_limits (
  id bigserial primary key,
  bucket_key text not null,
  created_at timestamptz not null default now()
);

alter table private.app_rate_limits enable row level security;

create index if not exists app_rate_limits_bucket_created_idx
  on private.app_rate_limits (bucket_key, created_at desc);

create or replace function public.consume_app_rate_limit(
  bucket_key text,
  max_requests integer,
  window_seconds integer
)
returns jsonb
language plpgsql
security definer
set search_path to pg_catalog, private
as $$
declare
  recent_count integer;
  oldest_recent timestamptz;
  retry_after integer;
begin
  if bucket_key is null or length(bucket_key) < 8 or length(bucket_key) > 200 then
    raise exception 'INVALID_RATE_LIMIT_KEY';
  end if;

  if max_requests < 1 or max_requests > 1000 then
    raise exception 'INVALID_RATE_LIMIT_MAX';
  end if;

  if window_seconds < 1 or window_seconds > 86400 then
    raise exception 'INVALID_RATE_LIMIT_WINDOW';
  end if;

  perform pg_advisory_xact_lock(hashtext(bucket_key));

  select count(*), min(created_at)
    into recent_count, oldest_recent
  from private.app_rate_limits
  where app_rate_limits.bucket_key = consume_app_rate_limit.bucket_key
    and created_at > now() - make_interval(secs => window_seconds);

  if recent_count >= max_requests then
    retry_after := greatest(
      1,
      ceil(extract(epoch from (
        oldest_recent + make_interval(secs => window_seconds) - now()
      )))::integer
    );

    return jsonb_build_object(
      'allowed', false,
      'remaining', 0,
      'retry_after', retry_after
    );
  end if;

  insert into private.app_rate_limits(bucket_key) values (bucket_key);

  if random() < 0.02 then
    delete from private.app_rate_limits
    where created_at < now() - interval '2 days';
  end if;

  return jsonb_build_object(
    'allowed', true,
    'remaining', greatest(0, max_requests - recent_count - 1),
    'retry_after', 0
  );
end;
$$;

revoke all on function public.consume_app_rate_limit(text, integer, integer) from public;
revoke all on function public.consume_app_rate_limit(text, integer, integer) from anon;
revoke all on function public.consume_app_rate_limit(text, integer, integer) from authenticated;
grant execute on function public.consume_app_rate_limit(text, integer, integer) to service_role;


-- ============================================================
-- supabase/migrations/20260926102035_harden_public_privileges_and_function_paths.sql
-- ============================================================

revoke truncate, references, trigger
on all tables in schema public
from anon, authenticated;

alter function public.create_order_with_stock(jsonb, jsonb)
  set search_path = pg_catalog, public;

alter function public.create_rental_booking_if_available(jsonb, date, date)
  set search_path = pg_catalog, public;

alter function public.next_quote_number()
  set search_path = pg_catalog, public;

alter function public.release_product_stock(jsonb)
  set search_path = pg_catalog, public;

alter function public.reserve_product_stock(jsonb)
  set search_path = pg_catalog, public;


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
 add column if not exists payment_provider text,
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


-- Manual rental refunds
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

-- ============================================================
-- 20261007020500_customer_billing_profiles.sql
-- ============================================================

-- Fakturakunde/kreditt for utleie. E-post er nøkkel slik at også gjestekunder kan få kredittvilkår.
create table if not exists public.customer_billing_profiles (
  email text primary key,
  invoice_customer boolean not null default false,
  credit_limit_ore bigint,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (credit_limit_ore is null or credit_limit_ore >= 0)
);

alter table public.customer_billing_profiles enable row level security;
revoke all on table public.customer_billing_profiles from anon, authenticated;
grant select,insert,update,delete on table public.customer_billing_profiles to service_role;

-- ============================================================
-- 20261007022000_rental_auto_confirm.sql
-- ============================================================

-- Nye offentlige utleiebookinger bekreftes automatisk når perioden er ledig.
create or replace function public.create_rental_booking_if_available(
  booking_record jsonb,
  buffered_start date,
  buffered_end date
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  item_id uuid;
  item_quantity integer;
  item_status text;
  booked_count integer;
  is_manually_blocked boolean;
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

  select exists(
    select 1
    from public.rental_blocks
    where rental_item_id=item_id
      and start_date <= buffered_end
      and end_date >= buffered_start
  ) into is_manually_blocked;

  if is_manually_blocked then
    raise exception 'RENTAL_UNAVAILABLE';
  end if;

  select count(*)
  into booked_count
  from public.rental_bookings
  where rental_item_id=item_id
    and status in ('new','confirmed','active')
    and start_date <= buffered_end
    and end_date >= buffered_start;

  if booked_count >= greatest(1,item_quantity) then
    raise exception 'RENTAL_UNAVAILABLE';
  end if;

  insert into public.rental_bookings(
    customer_user_id,booking_number,rental_item_id,customer,start_date,end_date,status,
    price_snapshot,total_ore,deposit_ore,terms_version
  ) values (
    nullif(booking_record->>'customer_user_id','')::uuid,
    booking_record->>'booking_number',item_id,booking_record->'customer',
    (booking_record->>'start_date')::date,(booking_record->>'end_date')::date,
    'confirmed',booking_record->'price_snapshot',(booking_record->>'total_ore')::integer,
    (booking_record->>'deposit_ore')::integer,booking_record->>'terms_version'
  )
  returning id into new_id;

  return new_id;
end;
$$;

revoke all on function public.create_rental_booking_if_available(jsonb,date,date) from public, anon, authenticated;
grant execute on function public.create_rental_booking_if_available(jsonb,date,date) to service_role;

-- ============================================================
-- 20260930235535_payment_reminders.sql
-- ============================================================

create sequence if not exists public.payment_reminder_number_seq
  start with 1013
  increment by 1
  minvalue 1013;

create table if not exists public.payment_reminders (
  id uuid primary key default gen_random_uuid(),
  reminder_number bigint not null default nextval('public.payment_reminder_number_seq') unique,
  invoice_number text not null,
  customer_name text not null,
  customer_email text not null,
  amount_ore integer not null check (amount_ore >= 0),
  original_due_date date,
  reminder_due_date date not null,
  subject text not null,
  message text not null,
  attachment_filename text not null,
  status text not null default 'draft' check (status in ('draft','sent','failed')),
  sent_at timestamptz,
  sent_by uuid,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.payment_reminders enable row level security;

revoke all on table public.payment_reminders from public, anon, authenticated;
grant select, insert, update, delete on table public.payment_reminders to service_role;

revoke all on sequence public.payment_reminder_number_seq from public, anon, authenticated;
grant usage, select on sequence public.payment_reminder_number_seq to service_role;

create index if not exists payment_reminders_created_at_idx
  on public.payment_reminders(created_at desc);

create index if not exists payment_reminders_customer_email_idx
  on public.payment_reminders(lower(customer_email));

-- ============================================================
-- 20261003150145_work_time_entries.sql
-- ============================================================

-- Persistent arbeidsklokke / timeregistrering for innlogget admin.
create table if not exists public.work_time_entries (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid not null references public.admin_users(id) on delete restrict,
  order_id uuid references public.orders(id) on delete set null,
  work_date date not null default ((now() at time zone 'Europe/Oslo')::date),
  project_label text not null default '',
  customer_label text not null default '',
  note text not null default '',
  started_at timestamptz,
  ended_at timestamptz,
  duration_minutes integer not null default 0 check (duration_minutes >= 0 and duration_minutes <= 100000),
  hourly_rate_ore integer not null default 50000 check (hourly_rate_ore >= 0 and hourly_rate_ore <= 10000000),
  distance_km numeric(10,2) not null default 0 check (distance_km >= 0 and distance_km <= 1000000),
  km_rate_ore integer not null default 530 check (km_rate_ore >= 0 and km_rate_ore <= 100000),
  toll_ore integer not null default 0 check (toll_ore >= 0 and toll_ore <= 100000000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ended_at is null or started_at is not null),
  check (ended_at is null or ended_at >= started_at)
);

create index if not exists work_time_entries_user_date_idx
  on public.work_time_entries(admin_user_id, work_date desc, created_at desc);

create index if not exists work_time_entries_order_idx
  on public.work_time_entries(order_id)
  where order_id is not null;

create unique index if not exists work_time_entries_one_active_timer_per_user_idx
  on public.work_time_entries(admin_user_id)
  where started_at is not null and ended_at is null;

alter table public.work_time_entries enable row level security;

revoke all on table public.work_time_entries from anon, authenticated;
grant select, insert, update, delete on table public.work_time_entries to service_role;

-- ============================================================
-- 20261007005500_material_supplier_catalog.sql
-- ============================================================

-- Leverandøruavhengig materialkatalog for pris- og materialkalkulator.
create table if not exists public.material_suppliers (
  id text primary key,
  name text not null,
  active boolean not null default true,
  is_primary boolean not null default false,
  default_markup_percent numeric(6,2) not null default 15.00
    check (default_markup_percent >= 0 and default_markup_percent <= 1000),
  last_import_at timestamptz,
  last_source_filename text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists material_suppliers_one_primary_idx
  on public.material_suppliers ((is_primary))
  where is_primary = true;

insert into public.material_suppliers (id,name,active,is_primary,default_markup_percent)
values
  ('byggern','Bygger’n',true,true,15.00),
  ('ahlsell','Ahlsell',true,false,15.00),
  ('optimera','Optimera / MinOptimera',true,false,15.00),
  ('byggmakker','Byggmakker Proff',true,false,15.00),
  ('megaflis','Megaflis',true,false,15.00)
on conflict (id) do update
set name=excluded.name,
    active=excluded.active,
    updated_at=now();

create table if not exists public.material_supplier_products (
  supplier_id text not null references public.material_suppliers(id) on delete cascade,
  supplier_sku text not null,
  name text not null,
  cost_ex_vat_ore bigint not null check (cost_ex_vat_ore >= 0),
  unit text not null default 'STK',
  category_code text not null default '',
  category_name text not null default '',
  ean text not null default '',
  module_number text not null default '',
  active boolean not null default true,
  source_filename text not null default '',
  import_batch text not null default '',
  imported_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  search_document tsvector generated always as (
    to_tsvector(
      'simple',
      coalesce(supplier_sku,'') || ' ' ||
      coalesce(name,'') || ' ' ||
      coalesce(category_code,'') || ' ' ||
      coalesce(category_name,'') || ' ' ||
      coalesce(ean,'') || ' ' ||
      coalesce(module_number,'')
    )
  ) stored,
  primary key (supplier_id,supplier_sku)
);

create index if not exists material_supplier_products_supplier_active_idx
  on public.material_supplier_products (supplier_id,active,name);

create index if not exists material_supplier_products_ean_idx
  on public.material_supplier_products (ean)
  where ean <> '';

create index if not exists material_supplier_products_module_idx
  on public.material_supplier_products (module_number)
  where module_number <> '';

create index if not exists material_supplier_products_search_idx
  on public.material_supplier_products using gin (search_document);

alter table public.material_suppliers enable row level security;
alter table public.material_supplier_products enable row level security;

revoke all on table public.material_suppliers from anon, authenticated;
revoke all on table public.material_supplier_products from anon, authenticated;
grant select, insert, update, delete on table public.material_suppliers to service_role;
grant select, insert, update, delete on table public.material_supplier_products to service_role;

create or replace function public.search_material_supplier_products(
  search_query text,
  supplier_filter text default null,
  result_limit integer default 20
)
returns table (
  supplier_id text,
  supplier_name text,
  supplier_is_primary boolean,
  supplier_sku text,
  product_name text,
  unit text,
  cost_ex_vat_ore bigint,
  category_code text,
  category_name text,
  ean text,
  module_number text
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select
    p.supplier_id,
    s.name,
    s.is_primary,
    p.supplier_sku,
    p.name,
    p.unit,
    p.cost_ex_vat_ore,
    p.category_code,
    p.category_name,
    p.ean,
    p.module_number
  from public.material_supplier_products p
  join public.material_suppliers s on s.id = p.supplier_id
  where p.active = true
    and s.active = true
    and (supplier_filter is null or supplier_filter = '' or p.supplier_id = supplier_filter)
    and nullif(btrim(search_query),'') is not null
    and (
      lower(p.supplier_sku) like '%' || lower(btrim(search_query)) || '%'
      or lower(p.ean) like '%' || lower(btrim(search_query)) || '%'
      or lower(p.module_number) like '%' || lower(btrim(search_query)) || '%'
      or lower(p.name) like '%' || lower(btrim(search_query)) || '%'
      or lower(p.category_name) like '%' || lower(btrim(search_query)) || '%'
      or p.search_document @@ plainto_tsquery('simple', btrim(search_query))
    )
  order by
    case
      when lower(p.supplier_sku) = lower(btrim(search_query)) then 0
      when p.ean <> '' and lower(p.ean) = lower(btrim(search_query)) then 1
      when p.module_number <> '' and lower(p.module_number) = lower(btrim(search_query)) then 2
      when lower(p.name) like lower(btrim(search_query)) || '%' then 3
      else 4
    end,
    s.is_primary desc,
    ts_rank_cd(p.search_document, plainto_tsquery('simple', btrim(search_query))) desc,
    p.name asc
  limit least(greatest(coalesce(result_limit,20),1),50);
$$;

revoke all on function public.search_material_supplier_products(text,text,integer)
  from public, anon, authenticated;
grant execute on function public.search_material_supplier_products(text,text,integer)
  to service_role;

-- ============================================================
-- 20261007193000_material_markup_20_percent.sql
-- ============================================================

-- Standard materialpåslag endres fra 15 % til 20 %.
alter table public.material_suppliers
  alter column default_markup_percent set default 20.00;

update public.material_suppliers
set default_markup_percent = 20.00,
    updated_at = now()
where default_markup_percent = 15.00;

-- ============================================================
-- 20260928051633_vipps_epayment_orders.sql
-- ============================================================

create schema if not exists private;

alter table public.orders
  add column if not exists payment_provider text,
  add column if not exists payment_reference text,
  add column if not exists payment_psp_reference text,
  add column if not exists payment_reserved_ore integer not null default 0,
  add column if not exists payment_captured_ore integer not null default 0,
  add column if not exists payment_authorized_at timestamptz,
  add column if not exists payment_captured_at timestamptz,
  add column if not exists payment_cancelled_at timestamptz,
  add column if not exists payment_refunded_at timestamptz,
  add column if not exists payment_refunded_ore integer not null default 0,
  add column if not exists payment_capture_guaranteed_until timestamptz,
  add column if not exists vipps_checkout_started_at timestamptz;

create index if not exists orders_payment_provider_reference_idx
  on public.orders(payment_provider,payment_reference);
create index if not exists orders_payment_status_idx
  on public.orders(payment_status);

create table if not exists private.vipps_payment_events(
  psp_reference text primary key,
  payment_reference text not null,
  event_name text not null,
  amount_ore integer not null default 0,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace function public.record_vipps_payment_event_once(
  event_psp_reference text,
  event_payment_reference text,
  event_name text,
  event_amount_ore integer,
  event_payload jsonb
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, private
as $function$
begin
  insert into private.vipps_payment_events(
    psp_reference,payment_reference,event_name,amount_ore,payload
  ) values (
    event_psp_reference,event_payment_reference,event_name,
    greatest(coalesce(event_amount_ore,0),0),coalesce(event_payload,'{}'::jsonb)
  )
  on conflict (psp_reference) do nothing;
  return found;
end;
$function$;

revoke all on function public.record_vipps_payment_event_once(text,text,text,integer,jsonb) from public,anon,authenticated;
grant execute on function public.record_vipps_payment_event_once(text,text,text,integer,jsonb) to service_role;

-- ============================================================
-- 20260928052246_vipps_webhook_registration.sql
-- ============================================================

create schema if not exists private;

create table if not exists private.vipps_webhook_registrations(
  webhook_id text primary key,
  environment text not null check (environment in ('test','production')),
  secret text not null,
  callback_url text not null,
  events jsonb not null default '[]'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.upsert_vipps_webhook_registration(
  target_webhook_id text,
  target_environment text,
  target_secret text,
  target_callback_url text,
  target_events jsonb
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, private
as $function$
begin
  if coalesce(target_webhook_id,'')='' or coalesce(target_secret,'')='' or coalesce(target_callback_url,'')='' then
    raise exception 'INVALID_VIPPS_WEBHOOK_REGISTRATION';
  end if;
  if target_environment not in ('test','production') then
    raise exception 'INVALID_VIPPS_ENVIRONMENT';
  end if;

  insert into private.vipps_webhook_registrations(
    webhook_id,environment,secret,callback_url,events,active,updated_at
  ) values (
    target_webhook_id,target_environment,target_secret,target_callback_url,
    coalesce(target_events,'[]'::jsonb),true,now()
  )
  on conflict (webhook_id) do update
  set environment=excluded.environment,
      secret=excluded.secret,
      callback_url=excluded.callback_url,
      events=excluded.events,
      active=true,
      updated_at=now();
end;
$function$;

create or replace function public.deactivate_vipps_webhook_registration(
  target_webhook_id text,
  target_environment text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, private
as $function$
declare affected integer;
begin
  update private.vipps_webhook_registrations
  set active=false,updated_at=now()
  where webhook_id=target_webhook_id
    and environment=target_environment
    and active=true;
  get diagnostics affected=row_count;
  return affected>0;
end;
$function$;

create or replace function public.get_vipps_webhook_secret(
  target_webhook_id text,
  target_environment text
)
returns text
language sql
security definer
set search_path = pg_catalog, private
as $function$
  select secret
  from private.vipps_webhook_registrations
  where webhook_id=target_webhook_id
    and environment=target_environment
    and active=true
  limit 1
$function$;

revoke all on function public.upsert_vipps_webhook_registration(text,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.upsert_vipps_webhook_registration(text,text,text,text,jsonb) to service_role;
revoke all on function public.deactivate_vipps_webhook_registration(text,text) from public,anon,authenticated;
grant execute on function public.deactivate_vipps_webhook_registration(text,text) to service_role;
revoke all on function public.get_vipps_webhook_secret(text,text) from public,anon,authenticated;
grant execute on function public.get_vipps_webhook_secret(text,text) to service_role;

-- ============================================================
-- 20260928052649_vipps_webhook_readiness.sql
-- ============================================================

create or replace function public.has_active_vipps_webhook_registration(
  target_environment text
)
returns boolean
language sql
security definer
set search_path = pg_catalog, private
as $function$
  select exists(
    select 1
    from private.vipps_webhook_registrations
    where environment=target_environment
      and active=true
  )
$function$;

revoke all on function public.has_active_vipps_webhook_registration(text) from public,anon,authenticated;
grant execute on function public.has_active_vipps_webhook_registration(text) to service_role;

-- ============================================================
-- 20260928053104_vipps_webhook_auth_context.sql
-- ============================================================

create or replace function public.get_vipps_webhook_auth(
  target_webhook_id text,
  target_environment text
)
returns jsonb
language sql
security definer
set search_path = pg_catalog, private
as $function$
  select jsonb_build_object(
    'secret',secret,
    'callback_url',callback_url
  )
  from private.vipps_webhook_registrations
  where webhook_id=target_webhook_id
    and environment=target_environment
    and active=true
  limit 1
$function$;

revoke all on function public.get_vipps_webhook_auth(text,text) from public,anon,authenticated;
grant execute on function public.get_vipps_webhook_auth(text,text) to service_role;

-- ============================================================
-- 20261001235835_vipps_epayment_foundation.sql
-- ============================================================

alter table public.rental_bookings
  add column if not exists payment_provider text,
  add column if not exists payment_psp_reference text,
  add column if not exists payment_reserved_ore integer not null default 0,
  add column if not exists payment_authorized_at timestamptz,
  add column if not exists payment_captured_at timestamptz,
  add column if not exists payment_cancelled_at timestamptz,
  add column if not exists payment_capture_guaranteed_until timestamptz,
  add column if not exists vipps_checkout_started_at timestamptz;

create table if not exists public.vipps_webhook_events (
  id uuid primary key default gen_random_uuid(),
  unit text not null check (unit in ('service','rental')),
  idempotency_key text not null,
  event_name text not null,
  payment_reference text not null,
  psp_reference text,
  amount_ore integer,
  event_timestamp timestamptz,
  payload jsonb not null default '{}'::jsonb,
  processed_at timestamptz,
  process_error text,
  received_at timestamptz not null default now(),
  unique(unit,idempotency_key)
);

alter table public.vipps_webhook_events enable row level security;
revoke all on table public.vipps_webhook_events from public,anon,authenticated;
grant select,insert,update,delete on table public.vipps_webhook_events to service_role;

create index if not exists vipps_webhook_events_reference_idx
  on public.vipps_webhook_events(unit,payment_reference,received_at desc);

create or replace function public.apply_vipps_payment_event(
  target_unit text,
  target_reference text,
  event_name_value text,
  amount_ore_value integer default 0,
  psp_reference_value text default null,
  event_timestamp_value timestamptz default null,
  capture_guaranteed_until_value timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $vipps_event$
declare
  now_value timestamptz := coalesce(event_timestamp_value,now());
  amount_value integer := greatest(coalesce(amount_ore_value,0),0);
  order_row public.orders%rowtype;
  rental_row public.rental_bookings%rowtype;
  next_captured integer;
  next_refunded integer;
  next_status text;
begin
  if target_unit='service' then
    select * into order_row from public.orders
    where order_number=target_reference or payment_reference=target_reference
    order by case when order_number=target_reference then 0 else 1 end
    limit 1 for update;
    if not found then raise exception 'VIPPS_PAYMENT_TARGET_NOT_FOUND'; end if;

    next_captured:=greatest(coalesce(order_row.payment_captured_ore,0),0);
    next_refunded:=greatest(coalesce(order_row.payment_refunded_ore,0),0);
    next_status:=coalesce(order_row.payment_status,'pending');

    if event_name_value='AUTHORIZED' then
      next_status:='authorized';
      update public.orders set payment_provider='vipps',payment_reference=target_reference,
        payment_psp_reference=coalesce(nullif(psp_reference_value,''),payment_psp_reference),
        payment_reserved_ore=greatest(coalesce(payment_reserved_ore,0),amount_value),
        payment_authorized_at=coalesce(payment_authorized_at,now_value),
        payment_capture_guaranteed_until=coalesce(capture_guaranteed_until_value,payment_capture_guaranteed_until),
        payment_status=next_status,updated_at=now()
      where id=order_row.id;
    elsif event_name_value='CAPTURED' then
      next_captured:=next_captured+amount_value;
      next_status:=case when next_captured>=greatest(coalesce(order_row.total_ore,0),1) then 'paid' else 'partial' end;
      update public.orders set payment_provider='vipps',payment_reference=target_reference,
        payment_psp_reference=coalesce(nullif(psp_reference_value,''),payment_psp_reference),
        payment_captured_ore=next_captured,payment_captured_at=now_value,payment_status=next_status,updated_at=now()
      where id=order_row.id;
    elsif event_name_value='REFUNDED' then
      next_refunded:=least(next_captured,next_refunded+amount_value);
      next_status:=case when next_captured>0 and next_refunded>=next_captured then 'refunded' else order_row.payment_status end;
      update public.orders set payment_provider='vipps',payment_reference=target_reference,
        payment_psp_reference=coalesce(nullif(psp_reference_value,''),payment_psp_reference),
        payment_refunded_ore=next_refunded,payment_refunded_at=now_value,payment_status=next_status,updated_at=now()
      where id=order_row.id;
    elsif event_name_value in ('CANCELLED','ABORTED','EXPIRED','TERMINATED') then
      next_status:=case when next_captured>next_refunded then order_row.payment_status else 'cancelled' end;
      update public.orders set payment_provider='vipps',payment_reference=target_reference,
        payment_psp_reference=coalesce(nullif(psp_reference_value,''),payment_psp_reference),
        payment_cancelled_at=coalesce(payment_cancelled_at,now_value),payment_status=next_status,updated_at=now()
      where id=order_row.id;
    else
      update public.orders set payment_provider='vipps',payment_reference=coalesce(payment_reference,target_reference),
        payment_psp_reference=coalesce(nullif(psp_reference_value,''),payment_psp_reference),updated_at=now()
      where id=order_row.id;
    end if;

    return jsonb_build_object('ok',true,'target','order','id',order_row.id,'status',next_status);
  elsif target_unit='rental' then
    select * into rental_row from public.rental_bookings
    where booking_number=target_reference or payment_reference=target_reference
    order by case when booking_number=target_reference then 0 else 1 end
    limit 1 for update;
    if not found then raise exception 'VIPPS_PAYMENT_TARGET_NOT_FOUND'; end if;

    next_captured:=greatest(coalesce(rental_row.payment_captured_ore,0),0);
    next_refunded:=greatest(coalesce(rental_row.payment_refunded_ore,0),0);
    next_status:=coalesce(rental_row.payment_status,'unpaid');

    if event_name_value='AUTHORIZED' then
      next_status:='authorized';
      update public.rental_bookings set payment_provider='vipps',payment_reference=target_reference,
        payment_psp_reference=coalesce(nullif(psp_reference_value,''),payment_psp_reference),
        payment_reserved_ore=greatest(coalesce(payment_reserved_ore,0),amount_value),
        payment_authorized_at=coalesce(payment_authorized_at,now_value),
        payment_capture_guaranteed_until=coalesce(capture_guaranteed_until_value,payment_capture_guaranteed_until),
        payment_status=next_status,updated_at=now()
      where id=rental_row.id;
    elsif event_name_value='CAPTURED' then
      next_captured:=next_captured+amount_value;
      next_status:=case when next_captured>=greatest(coalesce(rental_row.total_ore,0),1) then 'paid' else 'partial' end;
      update public.rental_bookings set payment_provider='vipps',payment_reference=target_reference,
        payment_psp_reference=coalesce(nullif(psp_reference_value,''),payment_psp_reference),
        payment_captured_ore=next_captured,payment_captured_at=now_value,payment_status=next_status,updated_at=now()
      where id=rental_row.id;
    elsif event_name_value='REFUNDED' then
      next_refunded:=least(next_captured,next_refunded+amount_value);
      next_status:=case when next_captured>0 and next_refunded>=next_captured then 'refunded' else rental_row.payment_status end;
      update public.rental_bookings set payment_provider='vipps',payment_reference=target_reference,
        payment_psp_reference=coalesce(nullif(psp_reference_value,''),payment_psp_reference),
        payment_refunded_ore=next_refunded,payment_refunded_at=now_value,payment_status=next_status,updated_at=now()
      where id=rental_row.id;
    elsif event_name_value in ('CANCELLED','ABORTED','EXPIRED','TERMINATED') then
      next_status:=case when next_captured>next_refunded then rental_row.payment_status else 'cancelled' end;
      update public.rental_bookings set payment_provider='vipps',payment_reference=target_reference,
        payment_psp_reference=coalesce(nullif(psp_reference_value,''),payment_psp_reference),
        payment_cancelled_at=coalesce(payment_cancelled_at,now_value),payment_status=next_status,updated_at=now()
      where id=rental_row.id;
    else
      update public.rental_bookings set payment_provider='vipps',payment_reference=coalesce(payment_reference,target_reference),
        payment_psp_reference=coalesce(nullif(psp_reference_value,''),payment_psp_reference),updated_at=now()
      where id=rental_row.id;
    end if;

    return jsonb_build_object('ok',true,'target','rental','id',rental_row.id,'status',next_status);
  end if;
  raise exception 'VIPPS_PAYMENT_UNIT_INVALID';
end;
$vipps_event$;

revoke all on function public.apply_vipps_payment_event(text,text,text,integer,text,timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function public.apply_vipps_payment_event(text,text,text,integer,text,timestamptz,timestamptz) to service_role;

-- ============================================================
-- 20261002000114_vipps_private_webhook_v2.sql
-- ============================================================

drop table if exists public.vipps_webhook_events;

alter table private.vipps_payment_events
  add column if not exists unit text,
  add column if not exists idempotency_key text,
  add column if not exists event_timestamp timestamptz,
  add column if not exists processed_at timestamptz,
  add column if not exists process_error text;

create unique index if not exists vipps_payment_events_unit_idempotency_idx
  on private.vipps_payment_events(unit,idempotency_key)
  where unit is not null and idempotency_key is not null;

alter table private.vipps_webhook_registrations
  add column if not exists unit text,
  add column if not exists msn text;

create index if not exists vipps_webhook_registrations_unit_env_idx
  on private.vipps_webhook_registrations(unit,environment)
  where active=true;

create or replace function public.get_vipps_webhook_auth(target_webhook_id text,target_environment text)
returns jsonb language sql security definer set search_path = pg_catalog, private
as $function$
  select jsonb_build_object('secret',secret,'callback_url',callback_url,'unit',unit,'msn',msn)
  from private.vipps_webhook_registrations
  where webhook_id=target_webhook_id and environment=target_environment and active=true
  limit 1
$function$;

create or replace function public.upsert_vipps_webhook_registration_v2(
  target_webhook_id text,target_environment text,target_secret text,target_callback_url text,
  target_events jsonb,target_unit text,target_msn text
)
returns void language plpgsql security definer set search_path = pg_catalog, private
as $function$
begin
  if coalesce(target_webhook_id,'')='' or coalesce(target_secret,'')='' or coalesce(target_callback_url,'')='' then raise exception 'INVALID_VIPPS_WEBHOOK_REGISTRATION'; end if;
  if target_environment not in ('test','production') then raise exception 'INVALID_VIPPS_ENVIRONMENT'; end if;
  if target_unit not in ('service','rental') then raise exception 'INVALID_VIPPS_UNIT'; end if;
  if coalesce(target_msn,'')='' then raise exception 'INVALID_VIPPS_MSN'; end if;
  insert into private.vipps_webhook_registrations(webhook_id,environment,secret,callback_url,events,active,unit,msn,updated_at)
  values(target_webhook_id,target_environment,target_secret,target_callback_url,coalesce(target_events,'[]'::jsonb),true,target_unit,target_msn,now())
  on conflict (webhook_id) do update
  set environment=excluded.environment,secret=excluded.secret,callback_url=excluded.callback_url,
      events=excluded.events,active=true,unit=excluded.unit,msn=excluded.msn,updated_at=now();
end;
$function$;

create or replace function public.record_vipps_payment_event_once_v2(
  event_unit text,event_idempotency_key text,event_psp_reference text,event_payment_reference text,
  event_name text,event_amount_ore integer,event_timestamp_value timestamptz,event_payload jsonb
)
returns boolean language plpgsql security definer set search_path = pg_catalog, private
as $function$
begin
  if event_unit not in ('service','rental') then raise exception 'INVALID_VIPPS_UNIT'; end if;
  if coalesce(event_idempotency_key,'')='' then raise exception 'INVALID_VIPPS_IDEMPOTENCY_KEY'; end if;
  if coalesce(event_psp_reference,'')='' or coalesce(event_payment_reference,'')='' or coalesce(event_name,'')='' then raise exception 'INVALID_VIPPS_EVENT'; end if;
  insert into private.vipps_payment_events(psp_reference,payment_reference,event_name,amount_ore,payload,unit,idempotency_key,event_timestamp)
  values(event_psp_reference,event_payment_reference,event_name,greatest(coalesce(event_amount_ore,0),0),coalesce(event_payload,'{}'::jsonb),event_unit,event_idempotency_key,event_timestamp_value)
  on conflict (unit,idempotency_key) where unit is not null and idempotency_key is not null do nothing;
  return found;
end;
$function$;

create or replace function public.mark_vipps_payment_event_processed(event_unit text,event_idempotency_key text,event_error text default null)
returns boolean language plpgsql security definer set search_path = pg_catalog, private
as $function$
declare affected integer;
begin
  update private.vipps_payment_events
  set processed_at=case when event_error is null then now() else processed_at end,
      process_error=nullif(left(coalesce(event_error,''),1000),'')
  where unit=event_unit and idempotency_key=event_idempotency_key;
  get diagnostics affected=row_count;
  return affected>0;
end;
$function$;

create or replace function public.get_vipps_webhook_status(target_environment text)
returns jsonb language sql security definer set search_path = pg_catalog, private
as $function$
  select coalesce(jsonb_agg(jsonb_build_object(
    'unit',unit,'msn',msn,'webhookId',webhook_id,'callbackUrl',callback_url,
    'events',events,'active',active,'updatedAt',updated_at
  ) order by unit,updated_at desc),'[]'::jsonb)
  from private.vipps_webhook_registrations
  where environment=target_environment and active=true
$function$;

revoke all on function public.upsert_vipps_webhook_registration_v2(text,text,text,text,jsonb,text,text) from public,anon,authenticated;
grant execute on function public.upsert_vipps_webhook_registration_v2(text,text,text,text,jsonb,text,text) to service_role;
revoke all on function public.record_vipps_payment_event_once_v2(text,text,text,text,text,integer,timestamptz,jsonb) from public,anon,authenticated;
grant execute on function public.record_vipps_payment_event_once_v2(text,text,text,text,text,integer,timestamptz,jsonb) to service_role;
revoke all on function public.mark_vipps_payment_event_processed(text,text,text) from public,anon,authenticated;
grant execute on function public.mark_vipps_payment_event_processed(text,text,text) to service_role;
revoke all on function public.get_vipps_webhook_status(text) from public,anon,authenticated;
grant execute on function public.get_vipps_webhook_status(text) to service_role;
revoke all on function public.get_vipps_webhook_auth(text,text) from public,anon,authenticated;
grant execute on function public.get_vipps_webhook_auth(text,text) to service_role;

-- ============================================================
-- 20261002000209_vipps_atomic_event_processing.sql
-- ============================================================

create or replace function public.process_vipps_payment_event_once(
  event_unit text,event_idempotency_key text,event_psp_reference text,event_payment_reference text,
  event_name text,event_amount_ore integer,event_timestamp_value timestamptz,
  capture_guaranteed_until_value timestamptz,event_payload jsonb
)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public, private
as $function$
declare inserted boolean := false; apply_result jsonb;
begin
  if event_unit not in ('service','rental') then raise exception 'INVALID_VIPPS_UNIT'; end if;
  if coalesce(event_idempotency_key,'')='' then raise exception 'INVALID_VIPPS_IDEMPOTENCY_KEY'; end if;
  if coalesce(event_psp_reference,'')='' or coalesce(event_payment_reference,'')='' or coalesce(event_name,'')='' then raise exception 'INVALID_VIPPS_EVENT'; end if;

  insert into private.vipps_payment_events(psp_reference,payment_reference,event_name,amount_ore,payload,unit,idempotency_key,event_timestamp)
  values(event_psp_reference,event_payment_reference,upper(event_name),greatest(coalesce(event_amount_ore,0),0),coalesce(event_payload,'{}'::jsonb),event_unit,event_idempotency_key,event_timestamp_value)
  on conflict (unit,idempotency_key) where unit is not null and idempotency_key is not null do nothing;

  inserted:=found;
  if not inserted then return jsonb_build_object('ok',true,'duplicate',true); end if;

  apply_result:=public.apply_vipps_payment_event(
    event_unit,event_payment_reference,upper(event_name),greatest(coalesce(event_amount_ore,0),0),
    event_psp_reference,event_timestamp_value,capture_guaranteed_until_value
  );

  update private.vipps_payment_events set processed_at=now(),process_error=null
  where unit=event_unit and idempotency_key=event_idempotency_key;

  return jsonb_build_object('ok',true,'duplicate',false,'applied',apply_result);
end;
$function$;

revoke all on function public.process_vipps_payment_event_once(text,text,text,text,text,integer,timestamptz,timestamptz,jsonb) from public,anon,authenticated;
grant execute on function public.process_vipps_payment_event_once(text,text,text,text,text,integer,timestamptz,timestamptz,jsonb) to service_role;

-- ============================================================
-- 20261002092456_vipps_payment_snapshot_sync.sql
-- ============================================================

create or replace function public.sync_vipps_payment_snapshot(
  target_unit text,
  target_reference text,
  payment_state_value text,
  psp_reference_value text,
  authorized_ore_value integer,
  cancelled_ore_value integer,
  captured_ore_value integer,
  refunded_ore_value integer,
  capture_guaranteed_until_value timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  authorized_ore integer := greatest(coalesce(authorized_ore_value,0),0);
  cancelled_ore integer := greatest(coalesce(cancelled_ore_value,0),0);
  captured_ore integer := greatest(coalesce(captured_ore_value,0),0);
  refunded_ore integer := greatest(coalesce(refunded_ore_value,0),0);
  state_value text := upper(coalesce(payment_state_value,''));
  status_value text;
  order_row public.orders%rowtype;
  rental_row public.rental_bookings%rowtype;
begin
  if target_unit not in ('service','rental') then raise exception 'VIPPS_PAYMENT_UNIT_INVALID'; end if;
  if coalesce(target_reference,'')='' then raise exception 'VIPPS_PAYMENT_REFERENCE_REQUIRED'; end if;

  status_value:=case
    when captured_ore>0 and refunded_ore>=captured_ore then 'refunded'
    when captured_ore>0 then
      case
        when target_unit='service' then
          case when captured_ore>=(select greatest(coalesce(total_ore,0),1) from public.orders where order_number=target_reference or payment_reference=target_reference order by case when order_number=target_reference then 0 else 1 end limit 1) then 'paid' else 'partial' end
        else
          case when captured_ore>=(select greatest(coalesce(total_ore,0),1) from public.rental_bookings where booking_number=target_reference or payment_reference=target_reference order by case when booking_number=target_reference then 0 else 1 end limit 1) then 'paid' else 'partial' end
      end
    when state_value='AUTHORIZED' and authorized_ore>cancelled_ore then 'authorized'
    when state_value in ('ABORTED','EXPIRED','TERMINATED') then 'cancelled'
    when state_value='AUTHORIZED' and authorized_ore>0 and cancelled_ore>=authorized_ore then 'cancelled'
    else case when target_unit='service' then 'pending' else 'unpaid' end
  end;

  if target_unit='service' then
    select * into order_row
    from public.orders
    where order_number=target_reference or payment_reference=target_reference
    order by case when order_number=target_reference then 0 else 1 end
    limit 1
    for update;
    if not found then raise exception 'VIPPS_PAYMENT_TARGET_NOT_FOUND'; end if;

    update public.orders set
      payment_provider='vipps',
      payment_reference=target_reference,
      payment_psp_reference=coalesce(nullif(psp_reference_value,''),payment_psp_reference),
      payment_reserved_ore=authorized_ore,
      payment_captured_ore=captured_ore,
      payment_refunded_ore=least(captured_ore,refunded_ore),
      payment_capture_guaranteed_until=coalesce(capture_guaranteed_until_value,payment_capture_guaranteed_until),
      payment_status=status_value,
      updated_at=now()
    where id=order_row.id;

    return jsonb_build_object('ok',true,'target','order','id',order_row.id,'status',status_value,
      'authorizedOre',authorized_ore,'cancelledOre',cancelled_ore,'capturedOre',captured_ore,
      'refundedOre',least(captured_ore,refunded_ore));
  end if;

  select * into rental_row
  from public.rental_bookings
  where booking_number=target_reference or payment_reference=target_reference
  order by case when booking_number=target_reference then 0 else 1 end
  limit 1
  for update;
  if not found then raise exception 'VIPPS_PAYMENT_TARGET_NOT_FOUND'; end if;

  update public.rental_bookings set
    payment_provider='vipps',
    payment_reference=target_reference,
    payment_psp_reference=coalesce(nullif(psp_reference_value,''),payment_psp_reference),
    payment_reserved_ore=authorized_ore,
    payment_captured_ore=captured_ore,
    payment_refunded_ore=least(captured_ore,refunded_ore),
    payment_capture_guaranteed_until=coalesce(capture_guaranteed_until_value,payment_capture_guaranteed_until),
    payment_status=status_value,
    updated_at=now()
  where id=rental_row.id;

  return jsonb_build_object('ok',true,'target','rental','id',rental_row.id,'status',status_value,
    'authorizedOre',authorized_ore,'cancelledOre',cancelled_ore,'capturedOre',captured_ore,
    'refundedOre',least(captured_ore,refunded_ore));
end;
$function$;

revoke all on function public.sync_vipps_payment_snapshot(text,text,text,text,integer,integer,integer,integer,timestamptz) from public,anon,authenticated;
grant execute on function public.sync_vipps_payment_snapshot(text,text,text,text,integer,integer,integer,integer,timestamptz) to service_role;

-- ============================================================
-- 20261002093013_vipps_release_stock_on_failed_checkout.sql
-- ============================================================

create or replace function public.process_vipps_payment_event_once(
  event_unit text,
  event_idempotency_key text,
  event_psp_reference text,
  event_payment_reference text,
  event_name text,
  event_amount_ore integer,
  event_timestamp_value timestamptz,
  capture_guaranteed_until_value timestamptz,
  event_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  inserted boolean := false;
  apply_result jsonb;
  target_id uuid;
begin
  if event_unit not in ('service','rental') then
    raise exception 'INVALID_VIPPS_UNIT';
  end if;
  if coalesce(event_idempotency_key,'')='' then
    raise exception 'INVALID_VIPPS_IDEMPOTENCY_KEY';
  end if;
  if coalesce(event_psp_reference,'')='' or coalesce(event_payment_reference,'')='' or coalesce(event_name,'')='' then
    raise exception 'INVALID_VIPPS_EVENT';
  end if;

  insert into private.vipps_payment_events(
    psp_reference,payment_reference,event_name,amount_ore,payload,
    unit,idempotency_key,event_timestamp
  ) values (
    event_psp_reference,event_payment_reference,upper(event_name),
    greatest(coalesce(event_amount_ore,0),0),coalesce(event_payload,'{}'::jsonb),
    event_unit,event_idempotency_key,event_timestamp_value
  )
  on conflict (unit,idempotency_key) where unit is not null and idempotency_key is not null
  do nothing;

  inserted:=found;
  if not inserted then return jsonb_build_object('ok',true,'duplicate',true); end if;

  apply_result:=public.apply_vipps_payment_event(
    event_unit,event_payment_reference,upper(event_name),
    greatest(coalesce(event_amount_ore,0),0),event_psp_reference,
    event_timestamp_value,capture_guaranteed_until_value
  );

  if event_unit='service'
     and upper(event_name) in ('ABORTED','EXPIRED','TERMINATED')
     and coalesce(apply_result->>'status','')='cancelled' then
    target_id:=(apply_result->>'id')::uuid;
    perform public.cancel_product_order_once(
      target_id,
      case upper(event_name)
        when 'ABORTED' then 'Vipps-betalingen ble avbrutt av kunden.'
        when 'EXPIRED' then 'Vipps-betalingen utløp før den ble godkjent.'
        else 'Vipps-betalingen ble avsluttet før autorisasjon.'
      end
    );
  end if;

  update private.vipps_payment_events
  set processed_at=now(),process_error=null
  where unit=event_unit and idempotency_key=event_idempotency_key;

  return jsonb_build_object('ok',true,'duplicate',false,'applied',apply_result);
end;
$function$;

revoke all on function public.process_vipps_payment_event_once(text,text,text,text,text,integer,timestamptz,timestamptz,jsonb) from public,anon,authenticated;
grant execute on function public.process_vipps_payment_event_once(text,text,text,text,text,integer,timestamptz,timestamptz,jsonb) to service_role;

-- ============================================================
-- 20261003132541_payment_receipt_delivery_claim.sql
-- ============================================================

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

-- ============================================================
-- 20261003132657_vipps_snapshot_payment_timestamps.sql
-- ============================================================

create or replace function public.sync_vipps_payment_snapshot(
  target_unit text,
  target_reference text,
  payment_state_value text,
  psp_reference_value text,
  authorized_ore_value integer,
  cancelled_ore_value integer,
  captured_ore_value integer,
  refunded_ore_value integer,
  capture_guaranteed_until_value timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  authorized_ore integer := greatest(coalesce(authorized_ore_value,0),0);
  cancelled_ore integer := greatest(coalesce(cancelled_ore_value,0),0);
  captured_ore integer := greatest(coalesce(captured_ore_value,0),0);
  refunded_ore integer := greatest(coalesce(refunded_ore_value,0),0);
  state_value text := upper(coalesce(payment_state_value,''));
  status_value text;
  order_row public.orders%rowtype;
  rental_row public.rental_bookings%rowtype;
begin
  if target_unit not in ('service','rental') then raise exception 'VIPPS_PAYMENT_UNIT_INVALID'; end if;
  if coalesce(target_reference,'')='' then raise exception 'VIPPS_PAYMENT_REFERENCE_REQUIRED'; end if;

  status_value:=case
    when captured_ore>0 and refunded_ore>=captured_ore then 'refunded'
    when captured_ore>0 then
      case
        when target_unit='service' then
          case when captured_ore>=(select greatest(coalesce(total_ore,0),1) from public.orders where order_number=target_reference or payment_reference=target_reference order by case when order_number=target_reference then 0 else 1 end limit 1) then 'paid' else 'partial' end
        else
          case when captured_ore>=(select greatest(coalesce(total_ore,0),1) from public.rental_bookings where booking_number=target_reference or payment_reference=target_reference order by case when booking_number=target_reference then 0 else 1 end limit 1) then 'paid' else 'partial' end
      end
    when state_value='AUTHORIZED' and authorized_ore>cancelled_ore then 'authorized'
    when state_value in ('ABORTED','EXPIRED','TERMINATED') then 'cancelled'
    when state_value='AUTHORIZED' and authorized_ore>0 and cancelled_ore>=authorized_ore then 'cancelled'
    else case when target_unit='service' then 'pending' else 'unpaid' end
  end;

  if target_unit='service' then
    select * into order_row
    from public.orders
    where order_number=target_reference or payment_reference=target_reference
    order by case when order_number=target_reference then 0 else 1 end
    limit 1
    for update;
    if not found then raise exception 'VIPPS_PAYMENT_TARGET_NOT_FOUND'; end if;

    update public.orders set
      payment_provider='vipps',
      payment_reference=target_reference,
      payment_psp_reference=coalesce(nullif(psp_reference_value,''),payment_psp_reference),
      payment_reserved_ore=authorized_ore,
      payment_captured_ore=captured_ore,
      payment_refunded_ore=least(captured_ore,refunded_ore),
      payment_authorized_at=case when authorized_ore>0 then coalesce(payment_authorized_at,now()) else payment_authorized_at end,
      payment_captured_at=case when captured_ore>0 then coalesce(payment_captured_at,now()) else payment_captured_at end,
      payment_refunded_at=case when refunded_ore>0 then coalesce(payment_refunded_at,now()) else payment_refunded_at end,
      payment_cancelled_at=case when status_value='cancelled' then coalesce(payment_cancelled_at,now()) else payment_cancelled_at end,
      payment_capture_guaranteed_until=coalesce(capture_guaranteed_until_value,payment_capture_guaranteed_until),
      payment_status=status_value,
      updated_at=now()
    where id=order_row.id;

    return jsonb_build_object('ok',true,'target','order','id',order_row.id,'status',status_value,
      'authorizedOre',authorized_ore,'cancelledOre',cancelled_ore,'capturedOre',captured_ore,
      'refundedOre',least(captured_ore,refunded_ore));
  end if;

  select * into rental_row
  from public.rental_bookings
  where booking_number=target_reference or payment_reference=target_reference
  order by case when booking_number=target_reference then 0 else 1 end
  limit 1
  for update;
  if not found then raise exception 'VIPPS_PAYMENT_TARGET_NOT_FOUND'; end if;

  update public.rental_bookings set
    payment_provider='vipps',
    payment_reference=target_reference,
    payment_psp_reference=coalesce(nullif(psp_reference_value,''),payment_psp_reference),
    payment_reserved_ore=authorized_ore,
    payment_captured_ore=captured_ore,
    payment_refunded_ore=least(captured_ore,refunded_ore),
    payment_authorized_at=case when authorized_ore>0 then coalesce(payment_authorized_at,now()) else payment_authorized_at end,
    payment_captured_at=case when captured_ore>0 then coalesce(payment_captured_at,now()) else payment_captured_at end,
    payment_refunded_at=case when refunded_ore>0 then coalesce(payment_refunded_at,now()) else payment_refunded_at end,
    payment_cancelled_at=case when status_value='cancelled' then coalesce(payment_cancelled_at,now()) else payment_cancelled_at end,
    payment_capture_guaranteed_until=coalesce(capture_guaranteed_until_value,payment_capture_guaranteed_until),
    payment_status=status_value,
    updated_at=now()
  where id=rental_row.id;

  return jsonb_build_object('ok',true,'target','rental','id',rental_row.id,'status',status_value,
    'authorizedOre',authorized_ore,'cancelledOre',cancelled_ore,'capturedOre',captured_ore,
    'refundedOre',least(captured_ore,refunded_ore));
end;
$function$;

revoke all on function public.sync_vipps_payment_snapshot(text,text,text,text,integer,integer,integer,integer,timestamptz) from public,anon,authenticated;
grant execute on function public.sync_vipps_payment_snapshot(text,text,text,text,integer,integer,integer,integer,timestamptz) to service_role;

-- ============================================================
-- 20261003133858_vipps_refund_notice_claims.sql
-- ============================================================

alter table public.orders
  add column if not exists refund_notice_total_ore integer not null default 0,
  add column if not exists refund_notice_claim_ore integer,
  add column if not exists refund_notice_sending_at timestamptz;

alter table public.rental_bookings
  add column if not exists refund_notice_total_ore integer not null default 0,
  add column if not exists refund_notice_claim_ore integer,
  add column if not exists refund_notice_sending_at timestamptz;

create or replace function public.claim_vipps_refund_notice(target_unit text,target_id uuid)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public
as $function$
declare claimed_total integer; previous_total integer;
begin
  if target_unit='service' then
    with candidate as (
      select id,greatest(coalesce(payment_refunded_ore,0),0) as current_total,
             greatest(coalesce(refund_notice_total_ore,0),0) as notified_total
      from public.orders
      where id=target_id and order_type='order' and payment_provider='vipps'
        and greatest(coalesce(payment_refunded_ore,0),0)>greatest(coalesce(refund_notice_total_ore,0),0)
        and (refund_notice_sending_at is null or refund_notice_sending_at<now()-interval '15 minutes')
      for update
    )
    update public.orders o
    set refund_notice_claim_ore=c.current_total,refund_notice_sending_at=now(),updated_at=now()
    from candidate c where o.id=c.id
    returning c.current_total,c.notified_total into claimed_total,previous_total;
  elsif target_unit='rental' then
    with candidate as (
      select id,greatest(coalesce(payment_refunded_ore,0),0) as current_total,
             greatest(coalesce(refund_notice_total_ore,0),0) as notified_total
      from public.rental_bookings
      where id=target_id and payment_provider='vipps'
        and greatest(coalesce(payment_refunded_ore,0),0)>greatest(coalesce(refund_notice_total_ore,0),0)
        and (refund_notice_sending_at is null or refund_notice_sending_at<now()-interval '15 minutes')
      for update
    )
    update public.rental_bookings b
    set refund_notice_claim_ore=c.current_total,refund_notice_sending_at=now(),updated_at=now()
    from candidate c where b.id=c.id
    returning c.current_total,c.notified_total into claimed_total,previous_total;
  else
    raise exception 'VIPPS_REFUND_NOTICE_UNIT_INVALID';
  end if;

  if claimed_total is null then return jsonb_build_object('claimed',false); end if;
  return jsonb_build_object('claimed',true,'totalOre',claimed_total,'previousNotifiedOre',previous_total,'refundOre',greatest(claimed_total-previous_total,0));
end;
$function$;

create or replace function public.complete_vipps_refund_notice(target_unit text,target_id uuid,claimed_total_ore integer)
returns boolean language plpgsql security definer set search_path = pg_catalog, public
as $function$
declare affected integer:=0; current_previous integer:=0;
begin
  if target_unit='service' then
    select greatest(coalesce(refund_notice_total_ore,0),0) into current_previous from public.orders where id=target_id for update;
    update public.orders
    set refund_last_ore=greatest(claimed_total_ore-current_previous,0),
        refund_reference=coalesce(nullif(payment_psp_reference,''),payment_reference,refund_reference),
        refund_note=coalesce(refund_note,'Vipps-refusjon'),
        refund_notice_total_ore=greatest(coalesce(refund_notice_total_ore,0),claimed_total_ore),
        refund_notice_sent_at=now(),refund_notice_claim_ore=null,refund_notice_sending_at=null,updated_at=now()
    where id=target_id and refund_notice_claim_ore=claimed_total_ore;
    get diagnostics affected=row_count; return affected>0;
  elsif target_unit='rental' then
    select greatest(coalesce(refund_notice_total_ore,0),0) into current_previous from public.rental_bookings where id=target_id for update;
    update public.rental_bookings
    set refund_last_ore=greatest(claimed_total_ore-current_previous,0),
        refund_reference=coalesce(nullif(payment_psp_reference,''),payment_reference,refund_reference),
        refund_note=coalesce(refund_note,'Vipps-refusjon'),
        refund_notice_total_ore=greatest(coalesce(refund_notice_total_ore,0),claimed_total_ore),
        refund_notice_sent_at=now(),refund_notice_claim_ore=null,refund_notice_sending_at=null,updated_at=now()
    where id=target_id and refund_notice_claim_ore=claimed_total_ore;
    get diagnostics affected=row_count; return affected>0;
  end if;
  raise exception 'VIPPS_REFUND_NOTICE_UNIT_INVALID';
end;
$function$;

create or replace function public.release_vipps_refund_notice_claim(target_unit text,target_id uuid,claimed_total_ore integer)
returns boolean language plpgsql security definer set search_path = pg_catalog, public
as $function$
declare affected integer:=0;
begin
  if target_unit='service' then
    update public.orders set refund_notice_claim_ore=null,refund_notice_sending_at=null,updated_at=now()
    where id=target_id and refund_notice_claim_ore=claimed_total_ore;
  elsif target_unit='rental' then
    update public.rental_bookings set refund_notice_claim_ore=null,refund_notice_sending_at=null,updated_at=now()
    where id=target_id and refund_notice_claim_ore=claimed_total_ore;
  else
    raise exception 'VIPPS_REFUND_NOTICE_UNIT_INVALID';
  end if;
  get diagnostics affected=row_count; return affected>0;
end;
$function$;

revoke all on function public.claim_vipps_refund_notice(text,uuid) from public,anon,authenticated;
grant execute on function public.claim_vipps_refund_notice(text,uuid) to service_role;
revoke all on function public.complete_vipps_refund_notice(text,uuid,integer) from public,anon,authenticated;
grant execute on function public.complete_vipps_refund_notice(text,uuid,integer) to service_role;
revoke all on function public.release_vipps_refund_notice_claim(text,uuid,integer) from public,anon,authenticated;
grant execute on function public.release_vipps_refund_notice_claim(text,uuid,integer) to service_role;
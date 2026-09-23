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

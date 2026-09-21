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
create index if not exists products_category_id_idx on public.products(category_id);

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

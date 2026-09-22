-- Egne kategorier for utleie.
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

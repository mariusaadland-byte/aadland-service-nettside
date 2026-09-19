-- Tidligere oppdrag / referanseprosjekter
create table if not exists public.projects (
 id uuid primary key default gen_random_uuid(),
 title text not null,
 slug text not null unique,
 category text,
 description text,
 image_urls jsonb not null default '[]'::jsonb,
 featured boolean not null default true,
 active boolean not null default true,
 sort_order integer not null default 0,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table public.projects enable row level security;
grant select,insert,update,delete on public.projects to service_role;
create index if not exists projects_active_sort_idx on public.projects(active,sort_order);

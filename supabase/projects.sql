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

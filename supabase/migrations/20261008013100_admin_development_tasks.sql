-- Oppgaver i admin sin utviklingsplan. Ingen endringer i eksisterende forretningsdata.
create table if not exists public.admin_development_tasks (
  id text primary key,
  title text not null,
  description text not null default '',
  category text not null check (category in ('drawing','business','rental','site')),
  priority text not null default 'normal' check (priority in ('high','normal','low')),
  status text not null default 'todo' check (status in ('todo','progress','test','done')),
  notes text not null default '',
  sort_order integer not null default 1000,
  is_custom boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.admin_development_tasks enable row level security;
revoke all on table public.admin_development_tasks from anon, authenticated;
grant all on table public.admin_development_tasks to service_role;
create index if not exists admin_development_tasks_sort_idx on public.admin_development_tasks (sort_order,created_at);

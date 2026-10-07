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

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

-- Logg over alle tilbudsutsendinger.
create table if not exists public.quote_send_log (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.quotes(id) on delete cascade,
  recipient text not null,
  delivery_type text not null default 'primary'
    check (delivery_type in ('primary','alternate')),
  sent_at timestamptz not null default now()
);

alter table public.quote_send_log enable row level security;

grant select, insert, delete on public.quote_send_log to service_role;

create index if not exists quote_send_log_quote_idx
  on public.quote_send_log(quote_id, sent_at desc);

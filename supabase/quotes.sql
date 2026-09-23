-- Aadland Service - tilbudssystem
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
  planned_start_date date,
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


alter table public.quotes add column if not exists planned_start_date date;
alter table public.quotes add column if not exists auto_follow_up boolean not null default true;
alter table public.quotes add column if not exists follow_up_sent_at timestamptz;

create index if not exists quotes_follow_up_due_idx
on public.quotes(sent_at)
where status='sent'
  and archived_at is null
  and auto_follow_up=true
  and follow_up_sent_at is null;

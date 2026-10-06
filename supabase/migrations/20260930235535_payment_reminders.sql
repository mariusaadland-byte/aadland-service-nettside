create sequence if not exists public.payment_reminder_number_seq
  start with 1013
  increment by 1
  minvalue 1013;

create table if not exists public.payment_reminders (
  id uuid primary key default gen_random_uuid(),
  reminder_number bigint not null default nextval('public.payment_reminder_number_seq') unique,
  invoice_number text not null,
  customer_name text not null,
  customer_email text not null,
  amount_ore integer not null check (amount_ore >= 0),
  original_due_date date,
  reminder_due_date date not null,
  subject text not null,
  message text not null,
  attachment_filename text not null,
  status text not null default 'draft' check (status in ('draft','sent','failed')),
  sent_at timestamptz,
  sent_by uuid,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.payment_reminders enable row level security;

revoke all on table public.payment_reminders from public, anon, authenticated;
grant select, insert, update, delete on table public.payment_reminders to service_role;

revoke all on sequence public.payment_reminder_number_seq from public, anon, authenticated;
grant usage, select on sequence public.payment_reminder_number_seq to service_role;

create index if not exists payment_reminders_created_at_idx
  on public.payment_reminders(created_at desc);

create index if not exists payment_reminders_customer_email_idx
  on public.payment_reminders(lower(customer_email));

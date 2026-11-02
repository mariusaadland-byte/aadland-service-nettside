-- Friendly, fee-free invoice email reminders are distinct from statutory
-- purring/inkassovarsel records. Sending one never modifies invoice_drafts.
create table public.invoice_friendly_reminders (
 id uuid primary key,
 invoice_id uuid not null references public.invoice_drafts(id) on delete restrict,
 recipient text not null,
 subject text not null,
 body text not null,
 original_due_date date not null,
 outstanding_ore bigint not null check (outstanding_ore > 0),
 created_at timestamptz not null default now(),
 first_send_at timestamptz,
 sent_at timestamptz,
 resend_id text,
 error_message text,
 sent_by uuid
);
create index invoice_friendly_reminders_invoice_history_idx
 on public.invoice_friendly_reminders (invoice_id,created_at desc);
alter table public.invoice_friendly_reminders enable row level security;
-- Only the server's service role may access this internal sending log.
revoke all on public.invoice_friendly_reminders from public, anon, authenticated;
grant select, insert, update on public.invoice_friendly_reminders to service_role;

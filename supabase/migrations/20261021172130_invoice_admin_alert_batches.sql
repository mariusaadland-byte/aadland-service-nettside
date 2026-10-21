create table public.invoice_admin_alert_batches (
 alert_day date primary key,
 id uuid not null unique default gen_random_uuid(),
 recipient text not null default 'post@aadland-service.no' check(recipient='post@aadland-service.no'),
 subject text not null,
 body text not null,
 items jsonb not null check(jsonb_typeof(items)='array'),
 status text not null default 'pending' check(status in ('pending','sent','failed')),
 created_at timestamptz not null default now(),
 sent_at timestamptz,
 resend_id text,
 error_message text
);
alter table public.invoice_admin_alert_batches enable row level security;
revoke all on public.invoice_admin_alert_batches from public,anon,authenticated;
grant select,insert on public.invoice_admin_alert_batches to service_role;
grant update(status,sent_at,resend_id,error_message) on public.invoice_admin_alert_batches to service_role;
-- S-17: metadata-only additive tables. Applied to Supabase production on 2026-11-21.
-- Migration version 20261121141809 verified in supabase_migrations.schema_migrations.
create table public.service_cron_runs (
 id uuid primary key default gen_random_uuid(),
 job_key text not null check (job_key in
  ('invoice-review-alerts','vat-deadline-reminders','survey-reminders',
   'job-reminders','quote-followups','scheduled-invoices')),
 state text not null check (state in ('running','ok','warning','failed')),
 detail text not null default '' check(length(detail)<=180),
 http_status integer check(http_status between 100 and 599),
 started_at timestamptz not null default now(),
 finished_at timestamptz,
 constraint service_cron_finished_state check (
  (state='running' and finished_at is null) or
  (state<>'running' and finished_at is not null)
 )
);
create index service_cron_runs_started_at_idx
 on public.service_cron_runs(started_at desc);
create index service_cron_runs_job_started_at_idx
 on public.service_cron_runs(job_key,started_at desc);
alter table public.service_cron_runs enable row level security;
revoke all on public.service_cron_runs from public,anon,authenticated;
grant select,insert,update on public.service_cron_runs to service_role;
comment on table public.service_cron_runs is
 'Private Service cron metadata only. No customer identifiers or email bodies.';

create table public.service_cron_alert_batches (
 alert_day date primary key,
 id uuid not null unique default gen_random_uuid(),
 issue_count integer not null check(issue_count between 1 and 6),
 state text not null default 'pending' check(state in ('pending','sent','uncertain')),
 created_at timestamptz not null default now(),
 sent_at timestamptz,
 constraint service_cron_alert_sent_state check(
  (state='sent' and sent_at is not null) or
  (state<>'sent' and sent_at is null)
 )
);
alter table public.service_cron_alert_batches enable row level security;
revoke all on public.service_cron_alert_batches from public,anon,authenticated;
grant select,insert,update on public.service_cron_alert_batches to service_role;
comment on table public.service_cron_alert_batches is
 'Private one-per-day owner alert lock. No customer data or email content.';

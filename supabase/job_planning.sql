-- Planlegging av godkjente oppdrag og kundebekreftelse
alter table public.orders
 add column if not exists job_start_at timestamptz,
 add column if not exists job_customer_agreement text,
 add column if not exists job_planning_updated_at timestamptz,
 add column if not exists job_confirmation_sent_at timestamptz,
 add column if not exists job_reminder_sent_at timestamptz;

create index if not exists orders_job_start_at_idx
on public.orders(job_start_at)
where job_start_at is not null;


create index if not exists orders_job_reminder_due_idx
on public.orders(job_start_at)
where order_type='custom'
  and status='confirmed'
  and job_start_at is not null
  and job_confirmation_sent_at is not null
  and job_reminder_sent_at is null
  and archived_at is null;

-- Én automatisk påminnelse før avtalt oppstart på oppdrag.
alter table public.orders
 add column if not exists job_reminder_sent_at timestamptz;

create index if not exists orders_job_reminder_due_idx
on public.orders(job_start_at)
where order_type='custom'
  and status='confirmed'
  and job_start_at is not null
  and job_confirmation_sent_at is not null
  and job_reminder_sent_at is null
  and archived_at is null;

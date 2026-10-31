-- Link standalone work-clock entries to a real saved customer, independently
-- of order_id.  Keep historical free-text names and old time entries intact.
alter table public.work_time_entries
 add column if not exists customer_ref text not null default '';
alter table public.work_time_entries
 drop constraint if exists work_time_entries_customer_ref_format;
alter table public.work_time_entries
 add constraint work_time_entries_customer_ref_format check(
  customer_ref='' or customer_ref ~ '^(contact|profile):[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 );
create index if not exists work_time_entries_customer_ref_idx
 on public.work_time_entries(admin_user_id,customer_ref,work_date desc)
 where customer_ref<>'';

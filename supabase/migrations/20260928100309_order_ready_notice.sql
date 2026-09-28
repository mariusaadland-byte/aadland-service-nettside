-- Kundemelding når en produktbestilling er klar for henting/levering.
alter table public.orders
 add column if not exists ready_notice_sent_at timestamptz;

create index if not exists orders_ready_notice_sent_at_idx
on public.orders(ready_notice_sent_at)
where ready_notice_sent_at is not null;

-- Koble godkjent tilbud til opprettet oppdrag
alter table public.quotes
 add column if not exists converted_order_id uuid
 references public.orders(id)
 on delete set null;

create unique index if not exists quotes_converted_order_unique_idx
on public.quotes(converted_order_id)
where converted_order_id is not null;

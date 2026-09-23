-- Planlagt oppstart som vises i tilbudet til kunden
alter table public.quotes
 add column if not exists planned_start_date date;

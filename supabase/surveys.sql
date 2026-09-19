alter table public.orders
add column if not exists survey_date timestamptz,
add column if not exists admin_note text;

create index if not exists orders_survey_date_idx
on public.orders(survey_date)
where survey_date is not null;

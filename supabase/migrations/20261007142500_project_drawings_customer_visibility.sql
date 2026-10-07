alter table public.project_drawings
  add column if not exists customer_user_id uuid references auth.users(id) on delete set null,
  add column if not exists customer_visible boolean not null default false;

create index if not exists project_drawings_customer_user_idx
  on public.project_drawings(customer_user_id, updated_at desc)
  where customer_user_id is not null;

create index if not exists project_drawings_customer_visible_idx
  on public.project_drawings(customer_user_id, customer_visible, updated_at desc)
  where customer_user_id is not null;

alter table public.project_drawings
  add column if not exists order_id uuid references public.orders(id) on delete set null;

create index if not exists project_drawings_order_id_idx
  on public.project_drawings(order_id);

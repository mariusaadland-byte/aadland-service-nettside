-- Standard materialpåslag endres fra 15 % til 20 %.
alter table public.material_suppliers
  alter column default_markup_percent set default 20.00;

update public.material_suppliers
set default_markup_percent = 20.00,
    updated_at = now()
where default_markup_percent = 15.00;

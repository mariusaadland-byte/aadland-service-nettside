-- Optional fixed sale price for manually registered catalog products.
-- The catalog remains server-only under its existing RLS and role grants.
alter table public.material_supplier_products
 add column if not exists sale_ex_vat_ore bigint
 check (sale_ex_vat_ore >= 0 and sale_ex_vat_ore <= 100000000);

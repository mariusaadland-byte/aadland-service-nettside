-- S-01: An unset supplier markup inherits the company's configured default.
-- This changes defaults ONLY. It does not alter purchased goods, saved prices,
-- existing quote lines, issued invoices or customer billing.
alter table public.material_suppliers
  alter column default_markup_percent drop not null,
  alter column default_markup_percent drop default;

-- These six existing suppliers still carry the legacy globally seeded 20 %.
-- Convert that *legacy default* to inheritance. A subsequently saved supplier
-- markup (including 0 or 20) remains a deliberate override.
update public.material_suppliers
set default_markup_percent=null, updated_at=now()
where id in ('ahlsell','byggern','byggmakker','egne-varer','megaflis','optimera')
  and default_markup_percent=20.00;

comment on column public.material_suppliers.default_markup_percent is
  'NULL means inherit quote_admin_preferences.main.default_material_markup; non-NULL is a supplier-specific override (including 0).';

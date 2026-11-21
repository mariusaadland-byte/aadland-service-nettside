-- S-10: Fix Supabase security advisor 0011 (mutable function search_path).
-- The trigger body only raises an exception and does not refer to tables or
-- functions by an unqualified name, so an empty path is compatible.
-- ALTER FUNCTION keeps the existing trigger, ownership, ACL, and body intact.
alter function public.protect_vat_external_sales_file()
 set search_path = '';

comment on function public.protect_vat_external_sales_file() is
 'Immutable original files: reject UPDATE/DELETE. search_path explicitly empty (S-10).';

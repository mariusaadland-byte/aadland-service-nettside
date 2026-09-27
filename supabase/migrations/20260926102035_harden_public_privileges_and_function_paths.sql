revoke truncate, references, trigger
on all tables in schema public
from anon, authenticated;

alter function public.create_order_with_stock(jsonb, jsonb)
  set search_path = pg_catalog, public;

alter function public.create_rental_booking_if_available(jsonb, date, date)
  set search_path = pg_catalog, public;

alter function public.next_quote_number()
  set search_path = pg_catalog, public;

alter function public.release_product_stock(jsonb)
  set search_path = pg_catalog, public;

alter function public.reserve_product_stock(jsonb)
  set search_path = pg_catalog, public;

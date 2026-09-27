-- Kjør manuelt i Supabase SQL Editor som prosjektets postgres-eier.
-- Eksisterende tabellgrants og SECURITY DEFINER-search_path er allerede herdet
-- i migrasjon 20260926102035_harden_public_privileges_and_function_paths.sql.
-- Dette scriptet gjelder KUN default privileges for fremtidige objekter.

alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke execute on functions from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke execute on functions from public;

alter default privileges for role supabase_admin in schema public
  revoke all on tables from anon, authenticated;
alter default privileges for role supabase_admin in schema public
  revoke all on sequences from anon, authenticated;
alter default privileges for role supabase_admin in schema public
  revoke execute on functions from anon, authenticated;
alter default privileges for role supabase_admin in schema public
  revoke execute on functions from public;

-- Manuell Supabase-hardening for prosjektets default privileges.
-- Kjør i Supabase SQL Editor som prosjektets postgres-eier.
-- Beholder service_role-tilgang, men stopper nye public-objekter fra å få
-- unødvendige privilegier til anon/authenticated automatisk.

revoke truncate, references, trigger, maintain
on all tables in schema public
from anon, authenticated;

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

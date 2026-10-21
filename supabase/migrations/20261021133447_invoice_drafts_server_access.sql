-- Server-only invoice access. Customer roles remain blocked by RLS and grants.
grant select, insert, update on table public.invoice_drafts to service_role;

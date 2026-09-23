-- Sikkerhets- og ytelsesherding etter Supabase Advisor.

-- Event-triggeren trenger ikke kunne kalles manuelt fra klientroller.
revoke execute on function public.rls_auto_enable() from public;
revoke execute on function public.rls_auto_enable() from anon;
revoke execute on function public.rls_auto_enable() from authenticated;

-- Dekker foreign key på quotes.created_by.
create index if not exists quotes_created_by_idx
on public.quotes(created_by);

-- Samme tilgang som før, men auth.uid() evalueres én gang per spørring.
drop policy if exists admin_users_read_own on public.admin_users;
create policy admin_users_read_own
on public.admin_users
for select
to authenticated
using (id = (select auth.uid()));

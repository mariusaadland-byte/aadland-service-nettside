-- Draft only: existing documents remain NULL (unallocated). No live migration.
begin;
alter table public.vat_purchase_documents add column cost_unit text check(cost_unit in ('service','rental','shared'));
-- Separate trigger protects the classification as part of the original entry.
-- Reclassification of historical documents requires a separate audit design.
create function public.draft_protect_purchase_cost_unit()
returns trigger language plpgsql set search_path=pg_catalog,public as $$
begin
 if new.cost_unit is distinct from old.cost_unit then raise exception 'Kostnadstype på registrert bilag kan ikke endres direkte';end if;
 return new;
end $$;
revoke all on function public.draft_protect_purchase_cost_unit() from public,anon,authenticated,service_role;
create trigger draft_protect_purchase_cost_unit before update on public.vat_purchase_documents
for each row execute function public.draft_protect_purchase_cost_unit();
rollback;

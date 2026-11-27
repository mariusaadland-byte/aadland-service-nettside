-- READ ONLY. Metadata/aggregate report only. Never a backup or migration.
begin read only;
select current_setting('server_version') as postgres_version, pg_database_size(current_database()) as database_bytes;
select c.relname as table_name,c.relrowsecurity as rls,has_table_privilege('anon',c.oid,'SELECT') as anon_select,has_table_privilege('authenticated',c.oid,'SELECT') as authenticated_select
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind in ('r','p') order by c.relname;
select table_name,column_name,data_type,is_nullable,column_default
from information_schema.columns where table_schema='public' and table_name in ('rental_items','rental_blocks','rental_bookings','vat_purchase_documents','customer_profiles') order by table_name,ordinal_position;
select c.relname,k.conname,pg_get_constraintdef(k.oid) as definition
from pg_constraint k join pg_class c on c.oid=k.conrelid join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname in ('rental_items','rental_blocks','rental_bookings','vat_purchase_documents') order by c.relname,k.conname;
select b.id as bucket,b.public,count(o.id) as object_count,coalesce(sum((o.metadata->>'size')::bigint),0) as metadata_bytes
from storage.buckets b left join storage.objects o on o.bucket_id=b.id group by b.id,b.public order by b.id;
select count(*) as active_purchases_missing_attachment_reference from public.vat_purchase_documents d where d.voided_at is null and not exists(select 1 from public.vat_purchase_document_files f where f.purchase_document_id=d.id);
select count(*) as missing_storage_metadata from (select storage_path from public.vat_purchase_document_files union all select storage_path from public.external_customer_invoices) x where not exists(select 1 from storage.objects o where o.bucket_id='aadland-vat-documents' and o.name=x.storage_path);
rollback;

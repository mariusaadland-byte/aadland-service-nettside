-- S-14 – Skrivebeskyttet metadata-inventar. IKKE en sikkerhetskopi.
-- Kjør bare i Supabase SQL Editor (produksjon); returnerer kun aggregater, ingen kundenavn eller filbaner.

select clock_timestamp() as kontrollert_utc,pg_size_pretty(pg_database_size(current_database())) as database_storrelse;

select 'customer_profiles' as kategori,count(*)::bigint as antall from public.customer_profiles
union all select 'admin_customer_contacts',count(*) from public.admin_customer_contacts
union all select 'orders',count(*) from public.orders
union all select 'quotes',count(*) from public.quotes
union all select 'invoice_drafts',count(*) from public.invoice_drafts
union all select 'external_customer_invoices',count(*) from public.external_customer_invoices
union all select 'vat_purchase_documents',count(*) from public.vat_purchase_documents
union all select 'vat_purchase_document_files',count(*) from public.vat_purchase_document_files
order by kategori;

select b.id as bøtte,b.public,count(o.id)::bigint as antall_filer,
coalesce(sum((o.metadata->>'size')::bigint),0)::bigint as bytes_fra_metadata
from storage.buckets b left join storage.objects o on o.bucket_id=b.id
group by b.id,b.public order by b.id;

with refs as (
 select storage_path from public.vat_purchase_document_files where storage_path is not null
 union all select storage_path from public.external_customer_invoices where storage_path is not null
), filmetadata as (
 select name from storage.objects where bucket_id='aadland-vat-documents'
)
select count(*)::bigint as originale_referanser,
count(distinct refs.storage_path)::bigint as unike_referanser,
count(*) filter(where filmetadata.name is not null)::bigint as finnes_i_filmetadata,
count(*) filter(where filmetadata.name is null)::bigint as mangler_i_filmetadata,
(select count(*) from filmetadata where not exists(select 1 from refs where refs.storage_path=filmetadata.name))::bigint as uregistrerte_objekter
from refs left join filmetadata on filmetadata.name=refs.storage_path;

select count(*)::bigint as fakturakladder,
count(*) filter(where pdf_base64 is not null and length(pdf_base64)>0)::bigint as med_pdf_i_database
from public.invoice_drafts;

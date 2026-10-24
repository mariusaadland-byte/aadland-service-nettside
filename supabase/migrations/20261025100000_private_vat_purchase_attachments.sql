-- Originalbilag are stored privately, never made public or exposed by direct URLs.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('aadland-vat-documents','aadland-vat-documents',false,8388608,
 array['application/pdf','image/jpeg','image/png','image/webp']::text[])
on conflict(id) do update set public=false,file_size_limit=8388608,
 allowed_mime_types=excluded.allowed_mime_types;

create table if not exists public.vat_purchase_document_files(
 id uuid primary key default gen_random_uuid(),
 purchase_document_id uuid not null unique references public.vat_purchase_documents(id),
 storage_path text not null unique,
 original_filename text not null check(length(original_filename) between 1 and 160),
 mime_type text not null check(mime_type in ('application/pdf','image/jpeg','image/png','image/webp')),
 file_size bigint not null check(file_size between 1 and 8388608),
 sha256 text not null check(sha256 ~ '^[0-9a-f]{64}$'),
 uploaded_by uuid not null,
 uploaded_at timestamptz not null default now(),
 check (storage_path like 'vat-purchases/%')
);
create index if not exists vat_purchase_document_files_purchase_idx
 on public.vat_purchase_document_files(purchase_document_id);
alter table public.vat_purchase_document_files enable row level security;
revoke all on public.vat_purchase_document_files from public,anon,authenticated;
grant select,insert on public.vat_purchase_document_files to service_role;
create or replace function public.protect_vat_purchase_document_file()
returns trigger language plpgsql set search_path=pg_catalog,public as $$
begin
 raise exception 'Et opplastet bilag kan ikke endres eller slettes. Behold originaldokumentasjonen.';
end $$;
revoke all on function public.protect_vat_purchase_document_file() from public,anon,authenticated;
drop trigger if exists protect_vat_purchase_document_file on public.vat_purchase_document_files;
create trigger protect_vat_purchase_document_file before update or delete
 on public.vat_purchase_document_files for each row
 execute function public.protect_vat_purchase_document_file();

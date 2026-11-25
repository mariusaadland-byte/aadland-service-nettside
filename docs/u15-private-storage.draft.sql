-- U-15 staged setup. Do not run until private storage policies have been reviewed in staging.
-- Create a dedicated PRIVATE bucket; never reuse public product-images.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('rental-condition-images','rental-condition-images',false,4194304,array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;
-- Audit existing storage.objects policies for broad anon/authenticated access;
-- verify private bucket, no client write/read access and service-role-only API.
-- Do not change unrelated bucket policies. No automatic retention/deletion yet.

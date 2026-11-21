-- S-21: Private contact-image upload receipts. No existing storage objects deleted.
-- Each public uploader holds a random proof, but only the server's service
-- role can inspect or bind the corresponding private image.
create table public.contact_image_uploads (
 storage_path text primary key
  check(storage_path ~ '^contact/[0-9]{4}-[0-9]{2}-[0-9]{2}/[0-9a-f-]{36}[.](jpg|png|webp)$'),
 receipt_hash text not null check(receipt_hash ~ '^[a-f0-9]{64}$'),
 state text not null default 'pending'
  check(state in ('pending','linked','cleaning','removed','cleanup_review')),
 order_id uuid references public.orders(id) on delete restrict,
 created_at timestamptz not null default now(),
 linked_at timestamptz,
 claimed_for_cleanup_at timestamptz,
 removed_at timestamptz,
 updated_at timestamptz not null default now(),
 constraint s21_linked_requires_order
  check(state<>'linked' or (order_id is not null and linked_at is not null))
);
create index contact_image_uploads_pending_date_idx
 on public.contact_image_uploads(created_at,storage_path)
 where state='pending';
alter table public.contact_image_uploads enable row level security;
revoke all on public.contact_image_uploads from public,anon,authenticated;
grant select,insert,update on public.contact_image_uploads to service_role;
comment on table public.contact_image_uploads is
 'Private one-time receipt hashes and lifecycle. No images or full contact details.';

-- A custom request and its attachment bindings commit together or not at all.
-- It never accepts a public image reference without the corresponding upload
-- receipt proof; a pending receipt can only be used once, for one order.
create function public.create_custom_order_with_contact_images(
 p_order_record jsonb,
 p_image_proofs jsonb default '[]'::jsonb
) returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
 entry jsonb;
 p_path text;
 p_hash text;
 token_row public.contact_image_uploads%rowtype;
 seen_paths text[] := '{}'::text[];
 refs text[] := '{}'::text[];
 request_body text;
 created_order_id uuid;
 count_images integer;
begin
 if p_order_record is null or p_order_record->>'order_type'<>'custom'
    or jsonb_typeof(coalesce(p_image_proofs,'[]'::jsonb))<>'array' then
  raise exception 'invalid_custom_order';
 end if;
 count_images:=jsonb_array_length(coalesce(p_image_proofs,'[]'::jsonb));
 if count_images>8 then raise exception 'too_many_contact_images'; end if;
 request_body:=trim(coalesce(p_order_record->>'custom_request',''));
 if length(request_body)=0 or length(request_body)>11000
   or position('private-image:' in lower(request_body))>0 then
  raise exception 'invalid_contact_request';
 end if;
 for entry in select * from jsonb_array_elements(coalesce(p_image_proofs,'[]'::jsonb))
 loop
  p_path:=coalesce(entry->>'path','');
  p_hash:=coalesce(entry->>'receiptHash','');
  if p_path !~ '^contact/[0-9]{4}-[0-9]{2}-[0-9]{2}/[0-9a-f-]{36}[.](jpg|png|webp)$'
     or p_hash !~ '^[a-f0-9]{64}$'
     or p_path=any(seen_paths) then
   raise exception 'invalid_contact_image_proof';
  end if;
  select * into token_row from public.contact_image_uploads
    where storage_path=p_path
    for update;
  if not found or token_row.state<>'pending'
     or token_row.receipt_hash<>p_hash
     or token_row.created_at<now()-interval '1 hour'
     or token_row.created_at>now()+interval '5 minutes' then
   raise exception 'contact_image_proof_expired_or_used';
  end if;
  seen_paths:=array_append(seen_paths,p_path);
  refs:=array_append(refs,'private-image:contact-images:'||p_path);
 end loop;
 if array_length(refs,1)>0 then
  request_body:=request_body||E'\n\nBilder:\n'||array_to_string(refs,E'\n');
 end if;
 if length(request_body)>12000 then raise exception 'contact_request_too_long'; end if;
 insert into public.orders
  (order_number,order_type,status,customer_user_id,customer,
   fulfillment_type,delivery_within_radius,items,custom_request,
   total_ore,shipping_ore,payment_status)
 values (
  p_order_record->>'order_number',
  'custom','new',
  nullif(p_order_record->>'customer_user_id','')::uuid,
  p_order_record->'customer',
  coalesce(p_order_record->>'fulfillment_type','pickup'),
  nullif(p_order_record->>'delivery_within_radius','')::boolean,
  coalesce(p_order_record->'items','[]'::jsonb),
  request_body,
  coalesce((p_order_record->>'total_ore')::integer,0),
  coalesce((p_order_record->>'shipping_ore')::integer,0),
  coalesce(p_order_record->>'payment_status','unpaid')
 ) returning id into created_order_id;
 if array_length(seen_paths,1)>0 then
  update public.contact_image_uploads
   set state='linked',order_id=created_order_id,linked_at=now(),updated_at=now()
   where storage_path=any(seen_paths) and state='pending';
  if not found then raise exception 'contact_image_link_failed'; end if;
 end if;
 return created_order_id;
end;
$$;
revoke all on function public.create_custom_order_with_contact_images(jsonb,jsonb)
 from public,anon,authenticated;
grant execute on function public.create_custom_order_with_contact_images(jsonb,jsonb)
 to service_role;

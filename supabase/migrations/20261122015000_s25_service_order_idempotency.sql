-- S-25: one immutable client intent key for a Service product/custom order.
-- Existing orders remain untouched (new fields nullable).
alter table public.orders
 add column if not exists checkout_request_key uuid,
 add column if not exists checkout_request_fingerprint text,
 add column if not exists checkout_provider_state text,
 add column if not exists checkout_provider_claimed_at timestamptz,
 add column if not exists checkout_redirect_url text,
 add column if not exists checkout_provider_last_issue text;
create unique index if not exists s25_order_request_key_unique
 on public.orders(checkout_request_key) where checkout_request_key is not null;
alter table public.orders
 add constraint s25_request_fingerprint_check
 check(checkout_request_fingerprint is null or
       checkout_request_fingerprint ~ '^[a-f0-9]{64}$'),
 add constraint s25_checkout_provider_state_check
 check(checkout_provider_state is null or checkout_provider_state in
   ('not_applicable','not_started','creating','ready','needs_review','cancelled'));

-- A per-key advisory transaction lock serializes concurrent identical
-- requests, including the period before either inserted an order. The unique
-- index is defense in depth. The existing S-21 contact receipt transaction
-- and S-22 stock reservation function run inside this SAME transaction.
create function public.create_service_order_once(
 p_key uuid,
 p_fingerprint text,
 p_order_record jsonb,
 p_stock_requests jsonb default '[]'::jsonb,
 p_image_proofs jsonb default '[]'::jsonb
) returns jsonb
language plpgsql security definer
set search_path=''
as $order$
declare
 existing public.orders%rowtype;
 new_id uuid;
 typ text;
 provider text;
 request_count integer;
begin
 if p_key is null or (p_key::text !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')
   or p_fingerprint !~ '^[a-f0-9]{64}$'
   or jsonb_typeof(p_order_record)<>'object'
   or jsonb_typeof(p_stock_requests)<>'array'
   or jsonb_typeof(p_image_proofs)<>'array' then
   raise exception 'S25_INVALID_ORDER_INTENT';
 end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_key::text,25));
 select * into existing from public.orders where checkout_request_key=p_key for update;
 if found then
  if existing.checkout_request_fingerprint<>p_fingerprint then
   raise exception 'S25_ORDER_INTENT_CONFLICT';
  end if;
  return jsonb_build_object('order_id',existing.id,'existing',true);
 end if;
 typ:=p_order_record->>'order_type';
 provider:=nullif(p_order_record->>'payment_provider','');
 if typ not in ('order','custom') or
   (typ='custom' and provider is not null) or
   (typ='order' and provider is not null and provider<>'vipps') then
  raise exception 'S25_INVALID_ORDER_TYPE_OR_PROVIDER';
 end if;
 if typ='custom' then
  if jsonb_array_length(p_stock_requests)<>0 then
   raise exception 'S25_CUSTOM_STOCK_FORBIDDEN';
  end if;
  new_id:=public.create_custom_order_with_contact_images(
   p_order_record,p_image_proofs
  );
 else
  if jsonb_array_length(p_image_proofs)<>0 then
   raise exception 'S25_PRODUCT_IMAGE_RECEIPTS_FORBIDDEN';
  end if;
  request_count:=jsonb_array_length(p_stock_requests);
  if request_count>0 then
   new_id:=public.create_order_with_stock(p_order_record,p_stock_requests);
  else
   insert into public.orders(
    customer_user_id,order_number,order_type,status,customer,
    fulfillment_type,delivery_within_radius,items,custom_request,
    total_ore,shipping_ore,payment_status,terms_version,terms_accepted_at,
    payment_provider,payment_reference,vipps_checkout_started_at
   ) values (
    nullif(p_order_record->>'customer_user_id','')::uuid,
    p_order_record->>'order_number','order',p_order_record->>'status',
    p_order_record->'customer',p_order_record->>'fulfillment_type',
    nullif(p_order_record->>'delivery_within_radius','')::boolean,
    coalesce(p_order_record->'items','[]'::jsonb),
    nullif(p_order_record->>'custom_request',''),
    (p_order_record->>'total_ore')::integer,
    (p_order_record->>'shipping_ore')::integer,
    p_order_record->>'payment_status',
    nullif(p_order_record->>'terms_version',''),
    nullif(p_order_record->>'terms_accepted_at','')::timestamptz,
    provider,nullif(p_order_record->>'payment_reference',''),
    nullif(p_order_record->>'vipps_checkout_started_at','')::timestamptz
   ) returning id into new_id;
  end if;
 end if;
 if new_id is null then raise exception 'S25_ORDER_INSERT_DID_NOT_RETURN_ID'; end if;
 update public.orders
  set checkout_request_key=p_key,
      checkout_request_fingerprint=p_fingerprint,
      checkout_provider_state=case when provider='vipps' then 'not_started'
       else 'not_applicable' end
  where id=new_id;
 if not found then raise exception 'S25_REQUEST_LINK_FAILED'; end if;
 return jsonb_build_object('order_id',new_id,'existing',false);
end;
$order$;
revoke all on function public.create_service_order_once(uuid,text,jsonb,jsonb,jsonb)
 from public,anon,authenticated;
grant execute on function public.create_service_order_once(uuid,text,jsonb,jsonb,jsonb)
 to service_role;

-- Vipps is an EXTERNAL side effect. No transaction can atomically commit a
-- Vipps API request. Claim ONCE, before calling Vipps; uncertain outcomes are
-- never automatically retried for this order/reference.
create function public.claim_service_order_vipps(
 p_key uuid,p_fingerprint text
) returns jsonb
language plpgsql security definer
set search_path=''
as $checkout$
declare
 o public.orders%rowtype;
begin
 update public.orders
 set checkout_provider_state='creating',
     checkout_provider_claimed_at=now(),
     updated_at=now()
 where checkout_request_key=p_key
  and checkout_request_fingerprint=p_fingerprint
  and checkout_provider_state='not_started'
  and order_type='order' and status='new'
  and payment_provider='vipps'
  and payment_reference=order_number
 returning * into o;
 if not found then return null; end if;
 return jsonb_build_object('order_id',o.id,'reference',o.order_number);
end;
$checkout$;
revoke all on function public.claim_service_order_vipps(uuid,text)
 from public,anon,authenticated;
grant execute on function public.claim_service_order_vipps(uuid,text) to service_role;

create function public.complete_service_order_vipps(
 p_key uuid,p_fingerprint text,p_redirect_url text,
 p_psp_reference text default null
) returns jsonb
language plpgsql security definer
set search_path=''
as $complete$
declare
 o public.orders%rowtype;
begin
 if p_redirect_url is null or length(p_redirect_url)>2048 or
  p_redirect_url !~ '^https://' or
  length(coalesce(p_psp_reference,''))>250 then
  raise exception 'S25_INVALID_CHECKOUT_RESPONSE';
 end if;
 update public.orders
 set checkout_provider_state='ready',
     checkout_redirect_url=p_redirect_url,
     payment_psp_reference=nullif(p_psp_reference,''),
     updated_at=now()
 where checkout_request_key=p_key
  and checkout_request_fingerprint=p_fingerprint
  and checkout_provider_state='creating'
  and payment_provider='vipps'
  and status='new'
 returning * into o;
 if not found then raise exception 'S25_CHECKOUT_NOT_CLAIMED'; end if;
 return jsonb_build_object('order_id',o.id,'ready',true);
end;
$complete$;
revoke all on function public.complete_service_order_vipps(uuid,text,text,text)
 from public,anon,authenticated;
grant execute on function public.complete_service_order_vipps(uuid,text,text,text)
 to service_role;

create function public.hold_service_order_vipps(
 p_key uuid,p_fingerprint text,p_issue text
) returns jsonb
language plpgsql security definer
set search_path=''
as $hold$
declare
 o public.orders%rowtype;
begin
 update public.orders
 set checkout_provider_state='needs_review',
     checkout_provider_last_issue=left(coalesce(p_issue,'provider_status_unknown'),120),
     updated_at=now()
 where checkout_request_key=p_key
  and checkout_request_fingerprint=p_fingerprint
  and checkout_provider_state='creating'
  and payment_provider='vipps'
 returning * into o;
 if not found then return jsonb_build_object('held',false); end if;
 return jsonb_build_object('held',true,'order_id',o.id);
end;
$hold$;
revoke all on function public.hold_service_order_vipps(uuid,text,text)
 from public,anon,authenticated;
grant execute on function public.hold_service_order_vipps(uuid,text,text)
 to service_role;

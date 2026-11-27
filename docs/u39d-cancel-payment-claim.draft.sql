-- Isolated draft, no provider calls or grants.
begin;
create function public.draft_group_release_unpaid(p_group uuid,p_reason text)
returns boolean language plpgsql security invoker set search_path=pg_catalog,public as $$
declare grp public.rental_order_groups%rowtype; r record; actual integer;
begin
 select * into grp from public.rental_order_groups where id=p_group for update;
 if not found or p_reason is null or p_reason not in ('expiry','customer_cancel') or grp.status<>'held' or (p_reason='expiry' and grp.expires_at>clock_timestamp()) or grp.payment_reference is not null or exists(select 1 from public.rental_group_payment_claims where group_id=p_group) or exists(select 1 from public.rental_group_events where group_id=p_group and event='payment_start') then return false; end if;
 for r in select distinct rental_item_id from public.rental_bookings where group_id=p_group order by rental_item_id loop
  perform pg_advisory_xact_lock(hashtext(r.rental_item_id::text));
 end loop;
 -- Refuse to release if any child shows unexpected changes/payment.
 if exists(select 1 from public.rental_bookings where group_id=p_group and (status is distinct from 'new' or payment_status is distinct from 'unpaid' or payment_reference is not null or coalesce(payment_captured_ore,0)<>0 or coalesce(payment_reserved_ore,0)<>0)) then raise exception 'GROUP_REVIEW_REQUIRED'; end if;
 select count(*) into actual from public.rental_bookings where group_id=p_group;
 if actual is distinct from (select sum((x->>'quantity')::integer) from jsonb_array_elements(grp.quote_snapshot->'rentals') x) then raise exception 'GROUP_REVIEW_REQUIRED'; end if;
 if exists(
 (select consumable_id,quantity,unit_ore from public.rental_group_goods where group_id=p_group
 except select (x->>'id')::uuid,(x->>'quantity')::integer,(x->>'unitOre')::integer from jsonb_array_elements(grp.quote_snapshot->'goods') x)
 union all
 (select (x->>'id')::uuid,(x->>'quantity')::integer,(x->>'unitOre')::integer from jsonb_array_elements(grp.quote_snapshot->'goods') x
 except select consumable_id,quantity,unit_ore from public.rental_group_goods where group_id=p_group)
 ) then raise exception 'GROUP_REVIEW_REQUIRED'; end if;
 for r in select consumable_id,quantity from public.rental_group_goods where group_id=p_group order by consumable_id loop
  update public.rental_consumables set reserved_quantity=reserved_quantity-r.quantity,revision=revision+1
  where id=r.consumable_id and reserved_quantity>=r.quantity and revision<2147483646;
  if not found then raise exception 'GROUP_REVIEW_REQUIRED'; end if;
 end loop;
 update public.rental_bookings set status='cancelled',updated_at=clock_timestamp() where group_id=p_group;
 update public.rental_order_groups set status='released' where id=p_group;
 update public.aadland_signing_challenges set state='revoked',code_mac=null where state='pending' and agreement_id in (select id from public.aadland_agreements where group_id=p_group);
 insert into public.rental_group_events(group_id,event,source_reference) values(p_group,'release',p_reason||':'||p_group::text);
 return true;
end $$;
revoke all on function public.draft_group_release_unpaid(uuid,text) from public,anon,authenticated,service_role;
create or replace function public.draft_group_expire(p_group uuid)
returns boolean language sql security invoker set search_path=pg_catalog,public as $$
 select public.draft_group_release_unpaid(p_group,'expiry');
$$;
-- Same request lock as reserve, then account signing lock, then group lock.
-- Cancellation before a reserve exists records a tombstone, never assumes
-- a missing row means a delayed reserve cannot happen.
create function public.draft_group_cancel_request(p_customer uuid,p_request uuid)
returns text language plpgsql security invoker set search_path=pg_catalog,public as $$
declare g public.rental_order_groups%rowtype;
begin
 if p_customer is null or p_request is null or not exists(select 1 from auth.users where id=p_customer and email_confirmed_at is not null) then return 'review'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_customer::text||':'||p_request::text,3706));
 perform pg_advisory_xact_lock(hashtextextended(p_customer::text,3804));
 select * into g from public.rental_order_groups where customer_user_id=p_customer and request_id=p_request for update;
 if found then
  if g.status='released' and g.payment_reference is null and not exists(select 1 from public.rental_group_payment_claims where group_id=g.id) then null;
  elsif g.status<>'held' or g.payment_reference is not null then return 'payment_review';
  elsif not public.draft_group_release_unpaid(g.id,'customer_cancel') then return 'payment_review';
  end if;
 end if;
 insert into public.rental_group_cancelled_requests(customer_user_id,request_id) values(p_customer,p_request) on conflict do nothing;
 return 'cancelled';
end $$;
revoke all on function public.draft_group_cancel_request(uuid,uuid) from public,anon,authenticated,service_role;
rollback;

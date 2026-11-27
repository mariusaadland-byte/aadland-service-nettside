-- Draft only. Terminal no-capture proof from trusted authenticated rental GET.
begin;
create table public.rental_group_terminal_payments(
 group_id uuid primary key references public.rental_group_payment_claims(group_id) on delete restrict,
 reference text not null unique,
 psp text not null unique check(length(psp) between 1 and 200),
 state text not null check(state in ('ABORTED','EXPIRED','TERMINATED')),
 authorized_ore integer not null check(authorized_ore>=0),
 cancelled_ore integer not null check(cancelled_ore=authorized_ore),
 checked_at timestamptz not null,
 released_at timestamptz not null default clock_timestamp()
);
alter table public.rental_group_terminal_payments enable row level security;
revoke all on public.rental_group_terminal_payments from public,anon,authenticated,service_role;
create function public.draft_group_release_terminal(p_group uuid,p_reference text,p_psp text,p_state text,p_currency text,p_authorized integer,p_cancelled integer,p_captured integer,p_refunded integer,p_checked timestamptz)
returns text language plpgsql security invoker set search_path=pg_catalog,public as $$
declare grp public.rental_order_groups%rowtype; c public.rental_group_payment_claims%rowtype; t public.rental_group_terminal_payments%rowtype; r record; actual integer;
begin
 select * into grp from public.rental_order_groups where id=p_group for update;
 if not found or p_reference is distinct from ('AUG-'||p_group::text) or grp.payment_reference is distinct from p_reference or p_psp is null or length(trim(p_psp)) not between 1 and 200 or p_state is null or p_state not in ('ABORTED','EXPIRED','TERMINATED') or p_currency is distinct from 'NOK' or p_authorized is null or p_authorized<0 or p_authorized>grp.payable_ore or p_cancelled is distinct from p_authorized or p_captured is distinct from 0 or p_refunded is distinct from 0 or p_checked is null or p_checked<clock_timestamp()-interval '60 seconds' or p_checked>clock_timestamp()+interval '5 seconds' then return 'review';end if;
 select * into c from public.rental_group_payment_claims where group_id=p_group;
 if not found or c.reference is distinct from p_reference or c.amount_ore is distinct from grp.payable_ore or c.captured_at is not null or c.psp_reference is not null or not public.draft_group_payment_binding(p_group,c.agreement_id,c.document_digest,c.evidence_seal) then return 'review';end if;
 select * into t from public.rental_group_terminal_payments where group_id=p_group;
 if found then
  if grp.status='released' and t.reference=p_reference and t.psp=p_psp and t.state=p_state and t.authorized_ore=p_authorized and t.cancelled_ore=p_cancelled then return 'existing';end if;
  return 'review';
 end if;
 if grp.status<>'payment_pending' or exists(select 1 from public.rental_group_capture_requests where group_id=p_group) or exists(select 1 from public.rental_group_handover_reports where group_id=p_group) or exists(select 1 from public.rental_group_deposit_receipts where group_id=p_group) or exists(select 1 from public.rental_group_bank_evidence where group_id=p_group) or exists(select 1 from public.rental_group_events where group_id=p_group and event in ('confirm','fulfill','release')) or not exists(select 1 from public.rental_group_events where group_id=p_group and event='payment_start' and source_reference=p_reference) or exists(select 1 from public.rental_group_payment_claims where psp_reference=p_psp) then return 'review';end if;
 for r in select distinct rental_item_id from public.rental_bookings where group_id=p_group order by rental_item_id loop
  perform pg_advisory_xact_lock(hashtext(r.rental_item_id::text));
 end loop;
 if p_checked<clock_timestamp()-interval '60 seconds' then return 'review';end if;
 if exists(select 1 from public.rental_bookings where group_id=p_group and (status is distinct from 'new' or payment_status is distinct from 'unpaid' or payment_reference is not null or coalesce(payment_captured_ore,0)<>0 or coalesce(payment_reserved_ore,0)<>0)) then return 'review';end if;
 select count(*) into actual from public.rental_bookings where group_id=p_group;
 if actual<1 or actual is distinct from (select sum((x->>'quantity')::integer) from jsonb_array_elements(grp.quote_snapshot->'rentals') x) then return 'review';end if;
 if exists(
 (select rental_item_id,start_date,end_date,count(*)::integer from public.rental_bookings where group_id=p_group group by rental_item_id,start_date,end_date
 except select (x->>'itemId')::uuid,(x->>'startDate')::date,(x->>'endDate')::date,(x->>'quantity')::integer from jsonb_array_elements(grp.quote_snapshot->'rentals') x)
 union all
 (select (x->>'itemId')::uuid,(x->>'startDate')::date,(x->>'endDate')::date,(x->>'quantity')::integer from jsonb_array_elements(grp.quote_snapshot->'rentals') x
 except select rental_item_id,start_date,end_date,count(*)::integer from public.rental_bookings where group_id=p_group group by rental_item_id,start_date,end_date)
 ) then return 'review';end if;
 if exists(
 (select consumable_id,quantity,unit_ore from public.rental_group_goods where group_id=p_group
 except select (x->>'id')::uuid,(x->>'quantity')::integer,(x->>'unitOre')::integer from jsonb_array_elements(grp.quote_snapshot->'goods') x)
 union all
 (select (x->>'id')::uuid,(x->>'quantity')::integer,(x->>'unitOre')::integer from jsonb_array_elements(grp.quote_snapshot->'goods') x
 except select consumable_id,quantity,unit_ore from public.rental_group_goods where group_id=p_group)
 ) then return 'review';end if;
 for r in select consumable_id,quantity from public.rental_group_goods where group_id=p_group order by consumable_id loop
  update public.rental_consumables set reserved_quantity=reserved_quantity-r.quantity,revision=revision+1 where id=r.consumable_id and reserved_quantity>=r.quantity and revision<2147483646;
  if not found then raise exception 'GROUP_REVIEW_REQUIRED';end if;
 end loop;
 insert into public.rental_group_terminal_payments(group_id,reference,psp,state,authorized_ore,cancelled_ore,checked_at) values(p_group,p_reference,p_psp,p_state,p_authorized,p_cancelled,p_checked);
 update public.rental_bookings set status='cancelled',updated_at=clock_timestamp() where group_id=p_group;
 update public.rental_order_groups set status='released' where id=p_group;
 update public.aadland_signing_challenges set state='revoked',code_mac=null where state='pending' and agreement_id in (select id from public.aadland_agreements where group_id=p_group);
 insert into public.rental_group_events(group_id,event,source_reference) values(p_group,'release','terminal:'||p_group::text);
 return 'released';
end $$;
revoke all on function public.draft_group_release_terminal(uuid,text,text,text,text,integer,integer,integer,integer,timestamptz) from public,anon,authenticated,service_role;
rollback;

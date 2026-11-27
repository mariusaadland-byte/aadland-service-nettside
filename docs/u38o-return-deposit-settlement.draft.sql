-- Isolated design draft only. No live grants, provider calls or migrations.
begin;
create table public.rental_group_deposit_receipts(
 group_id uuid primary key references public.rental_order_groups(id) on delete restrict,
 reference text not null unique check(length(trim(reference)) between 1 and 200),
 amount_ore integer not null check(amount_ore>0),
 proof_digest text not null check(proof_digest ~ '^[0-9a-f]{64}$'),
 recorded_by uuid not null, recorded_at timestamptz not null default clock_timestamp()
);
create table public.rental_group_returns(
 booking_id uuid primary key references public.rental_bookings(id) on delete restrict,
 group_id uuid not null references public.rental_order_groups(id) on delete restrict,
 receipt_id uuid not null unique, received_by uuid not null,
 condition text not null check(condition in ('ok','damage','missing_accessory','uninspected')),
 note text not null check(length(note)<=2000),
 report_digest text check(report_digest ~ '^[0-9a-f]{64}$'),
 received_at timestamptz not null default clock_timestamp(),
 check(condition='uninspected' or report_digest is not null),
 check(condition not in ('damage','missing_accessory') or length(trim(note))>0)
);
create table public.rental_group_return_settlements(
 group_id uuid primary key references public.rental_order_groups(id) on delete restrict,
 request_id uuid not null unique, reviewed_by uuid not null,
 deposit_ore integer not null check(deposit_ore>=0),
 refund_ore integer not null check(refund_ore>=0),
 retained_ore integer not null check(retained_ore>=0),
 review_digest text not null check(review_digest ~ '^[0-9a-f]{64}$'),
 refund_reference text unique,
 transfer_digest text check(transfer_digest ~ '^[0-9a-f]{64}$'),
 closed_at timestamptz,
 check(deposit_ore::bigint=refund_ore::bigint+retained_ore),
 check((refund_reference is null)=(transfer_digest is null)),
 check(closed_at is null or refund_ore=0 or refund_reference is not null)
);
alter table public.rental_group_deposit_receipts enable row level security;
alter table public.rental_group_returns enable row level security;
alter table public.rental_group_return_settlements enable row level security;
revoke all on public.rental_group_deposit_receipts,public.rental_group_returns,public.rental_group_return_settlements from public,anon,authenticated,service_role;

-- Records evidence of an externally checked deposit; does not collect money.
create function public.draft_group_deposit_record(p_group uuid,p_reference text,p_amount integer,p_proof text,p_actor uuid)
returns text language plpgsql security invoker set search_path=pg_catalog,public as $$
declare g public.rental_order_groups%rowtype; d public.rental_group_deposit_receipts%rowtype;
begin
 select * into g from public.rental_order_groups where id=p_group for update;
 if not found or p_actor is null or p_amount is null or p_amount<=0 or p_amount is distinct from g.deposit_ore or p_reference is null or length(trim(p_reference)) not between 1 and 200 or p_proof is null or p_proof !~ '^[0-9a-f]{64}$' then return 'review'; end if;
 select * into d from public.rental_group_deposit_receipts where group_id=p_group;
 if found then
  if d.reference=p_reference and d.amount_ore=p_amount and d.proof_digest=p_proof then return 'existing'; end if;
  return 'review';
 end if;
 if g.status<>'confirmed' or p_reference=g.payment_reference then return 'review'; end if;
 insert into public.rental_group_deposit_receipts(group_id,reference,amount_ore,proof_digest,recorded_by) values(p_group,p_reference,p_amount,p_proof,p_actor);
 return 'recorded';
end $$;
revoke all on function public.draft_group_deposit_record(uuid,text,integer,text,uuid) from public,anon,authenticated,service_role;

-- Each physical unit can be received independently; signature not required.
-- Uninspected/damaged units remain active for capacity purposes until reviewed.
create function public.draft_group_receive_return(p_group uuid,p_booking uuid,p_receipt uuid,p_actor uuid,p_condition text,p_note text,p_report text)
returns text language plpgsql security invoker set search_path=pg_catalog,public as $$
declare g public.rental_order_groups%rowtype; b public.rental_bookings%rowtype; r public.rental_group_returns%rowtype;
begin
 select * into g from public.rental_order_groups where id=p_group for update;
 if not found or g.status<>'fulfilled' or p_receipt is null or p_actor is null or p_condition is null or p_condition not in ('ok','damage','missing_accessory','uninspected') or p_note is null or length(p_note)>2000 or (p_condition<>'uninspected' and p_report is null) or (p_report is not null and p_report !~ '^[0-9a-f]{64}$') or (p_condition in ('damage','missing_accessory') and length(trim(p_note))=0) then return 'review'; end if;
 select * into b from public.rental_bookings where id=p_booking and group_id=p_group;
 if not found then return 'review'; end if;
 perform pg_advisory_xact_lock(hashtext(b.rental_item_id::text));
 select * into r from public.rental_group_returns where booking_id=p_booking;
 if found then
  if r.receipt_id=p_receipt and r.received_by=p_actor and r.condition=p_condition and r.note=p_note and r.report_digest is not distinct from p_report then return 'existing'; end if;
  return 'review';
 end if;
 if b.status<>'active' then return 'review'; end if;
 insert into public.rental_group_returns(booking_id,group_id,receipt_id,received_by,condition,note,report_digest) values(p_booking,p_group,p_receipt,p_actor,p_condition,p_note,p_report);
 if p_condition='ok' then update public.rental_bookings set status='returned',updated_at=clock_timestamp() where id=p_booking; end if;
 return 'received';
end $$;
revoke all on function public.draft_group_receive_return(uuid,uuid,uuid,uuid,text,text,text) from public,anon,authenticated,service_role;

-- Owner-reviewed plan only. A digest is a binding, not a legal decision or proof of transfer.
-- All units physically received before any final settlement. No automatic deductions.
create function public.draft_group_return_plan(p_group uuid,p_request uuid,p_actor uuid,p_refund integer,p_retained integer,p_review text)
returns text language plpgsql security invoker set search_path=pg_catalog,public as $$
declare g public.rental_order_groups%rowtype; d public.rental_group_deposit_receipts%rowtype; s public.rental_group_return_settlements%rowtype; n integer;
begin
 select * into g from public.rental_order_groups where id=p_group for update;
 if not found or g.status<>'fulfilled' or p_request is null or p_actor is null or p_refund is null or p_retained is null or p_refund<0 or p_retained<0 or p_review is null or p_review !~ '^[0-9a-f]{64}$' or p_refund::bigint+p_retained<>g.deposit_ore then return 'review'; end if;
 select * into s from public.rental_group_return_settlements where group_id=p_group;
 if found then
  if s.request_id=p_request and s.reviewed_by=p_actor and s.refund_ore=p_refund and s.retained_ore=p_retained and s.review_digest=p_review then return 'existing'; end if;
  return 'review';
 end if;
 select count(*) into n from public.rental_group_returns where group_id=p_group;
 if n=0 or n<>(select count(*) from public.rental_bookings where group_id=p_group) then return 'review'; end if;
 -- Pending inspection or damage requires a separate reviewed resolution first.
 if exists(select 1 from public.rental_bookings where group_id=p_group and status<>'returned') then return 'review'; end if;
 if g.deposit_ore>0 then
  select * into d from public.rental_group_deposit_receipts where group_id=p_group;
  if not found or d.amount_ore<>g.deposit_ore then return 'review'; end if;
 end if;
 -- Initial safe model permits only full refund: claims/deductions remain manual.
 if p_retained<>0 then return 'review'; end if;
 insert into public.rental_group_return_settlements(group_id,request_id,reviewed_by,deposit_ore,refund_ore,retained_ore,review_digest) values(p_group,p_request,p_actor,g.deposit_ore,p_refund,p_retained,p_review);
 return 'planned';
end $$;
revoke all on function public.draft_group_return_plan(uuid,uuid,uuid,integer,integer,text) from public,anon,authenticated,service_role;

-- Record externally reconciled refund, never initiate it. No sold consumables restocked.
create function public.draft_group_return_close(p_group uuid,p_request uuid,p_refund integer,p_reference text,p_proof text)
returns text language plpgsql security invoker set search_path=pg_catalog,public as $$
declare g public.rental_order_groups%rowtype; s public.rental_group_return_settlements%rowtype;
begin
 select * into g from public.rental_order_groups where id=p_group for update;
 if not found or g.status<>'fulfilled' then return 'review'; end if;
 select * into s from public.rental_group_return_settlements where group_id=p_group;
 if not found or s.request_id is distinct from p_request or s.refund_ore is distinct from p_refund then return 'review'; end if;
 if p_refund>0 and (p_reference is null or length(trim(p_reference)) not between 1 and 200 or p_proof is null or p_proof !~ '^[0-9a-f]{64}$') then return 'review'; end if;
 if p_refund=0 and (p_reference is not null or p_proof is not null) then return 'review'; end if;
 if s.closed_at is not null then
  if s.refund_reference is not distinct from p_reference and s.transfer_digest is not distinct from p_proof then return 'existing'; end if;
  return 'review';
 end if;
 if exists(select 1 from public.rental_bookings where group_id=p_group and status<>'returned') then return 'review'; end if;
 update public.rental_group_return_settlements set refund_reference=p_reference,transfer_digest=p_proof,closed_at=clock_timestamp() where group_id=p_group;
 return 'closed';
end $$;
revoke all on function public.draft_group_return_close(uuid,uuid,integer,text,text) from public,anon,authenticated,service_role;
rollback;

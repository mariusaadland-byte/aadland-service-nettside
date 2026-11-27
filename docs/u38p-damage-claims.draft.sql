-- Isolated design draft. No live grants or financial actions.
begin;
create table public.rental_group_damage_claims(
 id uuid primary key,
 group_id uuid not null references public.rental_order_groups(id) on delete restrict,
 booking_id uuid not null unique references public.rental_group_returns(booking_id) on delete restrict,
 created_by uuid not null,
 description text not null check(length(trim(description)) between 1 and 2000),
 amount_ore integer not null check(amount_ore>0),
 photo_digests text[] not null check(cardinality(photo_digests) between 1 and 12),
 cost_proof_digest text not null check(cost_proof_digest ~ '^[0-9a-f]{64}$'),
 claim_digest text not null check(claim_digest ~ '^[0-9a-f]{64}$'),
 created_at timestamptz not null default clock_timestamp()
);
create table public.rental_group_damage_responses(
 claim_id uuid primary key references public.rental_group_damage_claims(id) on delete restrict,
 customer_id uuid not null references auth.users(id) on delete restrict,
 claim_digest text not null check(claim_digest ~ '^[0-9a-f]{64}$'),
 response text not null check(response in ('accepted','disputed')),
 note text not null check(length(note)<=2000),
 responded_at timestamptz not null default clock_timestamp()
);
create table public.rental_group_inspection_resolutions(
 booking_id uuid primary key references public.rental_group_returns(booking_id) on delete restrict,
 actor_id uuid not null, proof_digest text not null check(proof_digest ~ '^[0-9a-f]{64}$'),
 resolved_at timestamptz not null default clock_timestamp()
);
alter table public.rental_group_damage_claims enable row level security;
alter table public.rental_group_damage_responses enable row level security;
alter table public.rental_group_inspection_resolutions enable row level security;
revoke all on public.rental_group_damage_claims,public.rental_group_damage_responses,public.rental_group_inspection_resolutions from public,anon,authenticated,service_role;
-- Digests refer to privately retained photo/document bytes. Actual storage and
-- access verification are required at trusted server entry, not supplied by browser.
create function public.draft_group_damage_claim(p_group uuid,p_booking uuid,p_claim uuid,p_actor uuid,p_description text,p_amount integer,p_photos text[],p_cost text,p_digest text)
returns text language plpgsql security invoker set search_path=pg_catalog,public as $$
declare g public.rental_order_groups%rowtype; r public.rental_group_returns%rowtype; c public.rental_group_damage_claims%rowtype;
begin
 select * into g from public.rental_order_groups where id=p_group for update;
 if not found or g.status<>'fulfilled' or p_claim is null or p_actor is null or p_description is null or length(trim(p_description)) not between 1 and 2000 or p_amount is null or p_amount<=0 or p_photos is null or cardinality(p_photos) not between 1 and 12 or exists(select 1 from unnest(p_photos) x where x is null or x !~ '^[0-9a-f]{64}$') or p_cost is null or p_cost !~ '^[0-9a-f]{64}$' or p_digest is null or p_digest !~ '^[0-9a-f]{64}$' then return 'review'; end if;
 select * into r from public.rental_group_returns where booking_id=p_booking and group_id=p_group;
 if not found or r.condition not in ('damage','missing_accessory') then return 'review'; end if;
 select * into c from public.rental_group_damage_claims where booking_id=p_booking;
 if found then
  if c.id=p_claim and c.created_by=p_actor and c.description=p_description and c.amount_ore=p_amount and c.photo_digests=p_photos and c.cost_proof_digest=p_cost and c.claim_digest=p_digest then return 'existing'; end if;
  return 'review';
 end if;
 if exists(select 1 from public.rental_group_return_settlements where group_id=p_group) then return 'review'; end if;
 insert into public.rental_group_damage_claims(id,group_id,booking_id,created_by,description,amount_ore,photo_digests,cost_proof_digest,claim_digest) values(p_claim,p_group,p_booking,p_actor,p_description,p_amount,p_photos,p_cost,p_digest);
 return 'recorded';
end $$;
revoke all on function public.draft_group_damage_claim(uuid,uuid,uuid,uuid,text,integer,text[],text,text) from public,anon,authenticated,service_role;

create function public.draft_group_damage_response(p_group uuid,p_claim uuid,p_customer uuid,p_digest text,p_response text,p_note text)
returns text language plpgsql security invoker set search_path=pg_catalog,public as $$
declare g public.rental_order_groups%rowtype; c public.rental_group_damage_claims%rowtype; r public.rental_group_damage_responses%rowtype;
begin
 select * into g from public.rental_order_groups where id=p_group for update;
 if not found or g.customer_user_id is distinct from p_customer or p_response is null or p_response not in ('accepted','disputed') or p_note is null or length(p_note)>2000 then return 'review'; end if;
 select * into c from public.rental_group_damage_claims where id=p_claim and group_id=p_group;
 if not found or c.claim_digest is distinct from p_digest then return 'review'; end if;
 select * into r from public.rental_group_damage_responses where claim_id=p_claim;
 if found then
  if r.customer_id=p_customer and r.response=p_response and r.note=p_note and r.claim_digest=p_digest then return 'existing'; end if;
  return 'review';
 end if;
 if exists(select 1 from public.rental_group_return_settlements where group_id=p_group) then return 'review'; end if;
 insert into public.rental_group_damage_responses(claim_id,customer_id,claim_digest,response,note) values(p_claim,p_customer,p_digest,p_response,p_note);
 return 'recorded';
end $$;
revoke all on function public.draft_group_damage_response(uuid,uuid,uuid,text,text,text) from public,anon,authenticated,service_role;

-- Only after verified physical safety inspection. Financial agreement is separate.
create function public.draft_group_inspection_resolve(p_group uuid,p_booking uuid,p_actor uuid,p_proof text)
returns text language plpgsql security invoker set search_path=pg_catalog,public as $$
declare g public.rental_order_groups%rowtype; b public.rental_bookings%rowtype; r public.rental_group_inspection_resolutions%rowtype;
begin
 select * into g from public.rental_order_groups where id=p_group for update;
 if not found or g.status<>'fulfilled' or p_actor is null or p_proof is null or p_proof !~ '^[0-9a-f]{64}$' then return 'review'; end if;
 select * into b from public.rental_bookings where id=p_booking and group_id=p_group;
 if not found or not exists(select 1 from public.rental_group_returns where booking_id=p_booking and group_id=p_group) then return 'review'; end if;
 perform pg_advisory_xact_lock(hashtext(b.rental_item_id::text));
 select * into r from public.rental_group_inspection_resolutions where booking_id=p_booking;
 if found then
  if r.actor_id=p_actor and r.proof_digest=p_proof then return 'existing'; end if;
  return 'review';
 end if;
 if b.status<>'active' or exists(select 1 from public.rental_group_return_settlements where group_id=p_group) then return 'review'; end if;
 insert into public.rental_group_inspection_resolutions(booking_id,actor_id,proof_digest) values(p_booking,p_actor,p_proof);
 update public.rental_bookings set status='returned',updated_at=clock_timestamp() where id=p_booking;
 return 'resolved';
end $$;
revoke all on function public.draft_group_inspection_resolve(uuid,uuid,uuid,text) from public,anon,authenticated,service_role;
-- Separate restricted plan for agreed claims. Never transfer funds or create invoices.
create function public.draft_group_agreed_damage_plan(p_group uuid,p_request uuid,p_actor uuid,p_refund integer,p_retained integer,p_review text)
returns text language plpgsql security invoker set search_path=pg_catalog,public as $$
declare g public.rental_order_groups%rowtype; s public.rental_group_return_settlements%rowtype; agreed bigint;
begin
 select * into g from public.rental_order_groups where id=p_group for update;
 if not found or g.status<>'fulfilled' or p_request is null or p_actor is null or p_refund is null or p_refund<0 or p_retained is null or p_retained<=0 or p_refund::bigint+p_retained<>g.deposit_ore or p_review is null or p_review !~ '^[0-9a-f]{64}$' then return 'review'; end if;
 select * into s from public.rental_group_return_settlements where group_id=p_group;
 if found then
  if s.request_id=p_request and s.reviewed_by=p_actor and s.refund_ore=p_refund and s.retained_ore=p_retained and s.review_digest=p_review then return 'existing'; end if;
  return 'review';
 end if;
 if not exists(select 1 from public.rental_bookings where group_id=p_group) or exists(select 1 from public.rental_bookings b where b.group_id=p_group and (b.status<>'returned' or not exists(select 1 from public.rental_group_returns r where r.booking_id=b.id and r.group_id=p_group))) then return 'review'; end if;
 if not exists(select 1 from public.rental_group_deposit_receipts d where d.group_id=p_group and d.amount_ore=g.deposit_ore) then return 'review'; end if;
 if exists(select 1 from public.rental_group_damage_claims c left join public.rental_group_damage_responses r on r.claim_id=c.id where c.group_id=p_group and (r.response is distinct from 'accepted' or r.claim_digest is distinct from c.claim_digest or r.customer_id is distinct from g.customer_user_id)) then return 'review'; end if;
 select coalesce(sum(c.amount_ore),0) into agreed from public.rental_group_damage_claims c where c.group_id=p_group;
 -- Do not silently deduct excess claims or allocate partial amounts.
 if agreed<>p_retained or agreed>g.deposit_ore then return 'review'; end if;
 insert into public.rental_group_return_settlements(group_id,request_id,reviewed_by,deposit_ore,refund_ore,retained_ore,review_digest) values(p_group,p_request,p_actor,g.deposit_ore,p_refund,p_retained,p_review);
 return 'planned';
end $$;
revoke all on function public.draft_group_agreed_damage_plan(uuid,uuid,uuid,integer,integer,text) from public,anon,authenticated,service_role;
rollback;

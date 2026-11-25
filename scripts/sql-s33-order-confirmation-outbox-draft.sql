-- S33: opt-in transactional outbox for NEW manual webshop product orders only.
create table public.service_order_confirmation_outbox (
 order_id uuid primary key references public.orders(id) on delete cascade,
 state text not null default 'queued' check (state in ('queued','claimed','accepted','needs_review','skipped')),
 created_at timestamptz not null default now(),
 claimed_at timestamptz,
 accepted_at timestamptz,
 provider_email_id text
);
alter table public.service_order_confirmation_outbox enable row level security;
revoke all on public.service_order_confirmation_outbox from public, anon, authenticated;
grant select, insert, update on public.service_order_confirmation_outbox to service_role;
create index s33_confirmation_queued_idx on public.service_order_confirmation_outbox(created_at) where state='queued';

create function public.create_service_order_with_confirmation(
 p_key uuid,p_fingerprint text,p_order_record jsonb,p_stock_requests jsonb,p_image_proofs jsonb
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare r jsonb;
begin
 if p_order_record->>'order_type' is distinct from 'order' or nullif(p_order_record->>'payment_provider','') is not null then
  raise exception 'S33_MANUAL_PRODUCT_ONLY';
 end if;
 r:=public.create_service_order_once(p_key,p_fingerprint,p_order_record,p_stock_requests,p_image_proofs);
 if (r->>'existing')::boolean is false then
  insert into public.service_order_confirmation_outbox(order_id) values ((r->>'order_id')::uuid);
 end if;
 return r;
end;
$$;
revoke all on function public.create_service_order_with_confirmation(uuid,text,jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.create_service_order_with_confirmation(uuid,text,jsonb,jsonb,jsonb) to service_role;

-- Single transaction: lock order, claim first delivery and snapshot its current data.
create function public.claim_service_order_confirmation(p_order_id uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare o public.orders%rowtype;
begin
 select * into o from public.orders where id=p_order_id for update;
 if not found then return null; end if;
 if o.order_type<>'order' or coalesce(o.payment_provider,'')='vipps'
 or o.archived_at is not null or o.status in ('cancelled','completed') or o.confirmation_sent_at is not null then
  update public.service_order_confirmation_outbox set state='skipped' where order_id=p_order_id and state='queued';
  return null;
 end if;
 update public.service_order_confirmation_outbox set state='claimed',claimed_at=now()
 where order_id=p_order_id and state='queued';
 if not found then return null; end if;
 return to_jsonb(o);
end;
$$;
revoke all on function public.claim_service_order_confirmation(uuid) from public,anon,authenticated;
grant execute on function public.claim_service_order_confirmation(uuid) to service_role;

create function public.accept_service_order_confirmation(p_order_id uuid,p_provider_email_id text)
returns boolean language plpgsql security invoker set search_path='' as $$
begin
 if length(coalesce(p_provider_email_id,'')) not between 1 and 240 then raise exception 'S33_INVALID_PROVIDER_ID'; end if;
 -- Match lock order in claim.
 perform 1 from public.orders where id=p_order_id for update;
 update public.service_order_confirmation_outbox set state='accepted',accepted_at=now(),provider_email_id=p_provider_email_id
 where order_id=p_order_id and state='claimed';
 if not found then return false; end if;
 update public.orders set confirmation_sent_at=coalesce(confirmation_sent_at,now()) where id=p_order_id;
 return true;
end;
$$;
revoke all on function public.accept_service_order_confirmation(uuid,text) from public,anon,authenticated;
grant execute on function public.accept_service_order_confirmation(uuid,text) to service_role;

-- Owner reconciliation records evidence only; never invokes an email provider.
alter table public.service_order_confirmation_outbox
 add column reviewed_at timestamptz,
 add column reviewer_id text,
 add column review_note text;
create function public.review_service_order_confirmation(p_order_id uuid,p_reviewer_id text,p_result text,p_note text,p_provider_id text,p_accepted_at timestamptz)
returns boolean language plpgsql security invoker set search_path='' as $$
declare o public.orders%rowtype; q public.service_order_confirmation_outbox%rowtype;
begin
 if p_result not in ('accepted','skipped') or p_result is null
 or length(coalesce(p_reviewer_id,'')) not between 1 and 200
 or length(coalesce(p_note,'')) not between 12 and 1200
 or (p_result='accepted' and (length(coalesce(p_provider_id,'')) not between 8 and 240 or p_accepted_at is null or p_accepted_at>now()))
 then raise exception 'S33_INVALID_REVIEW'; end if;
 select * into o from public.orders where id=p_order_id for update;
 if not found or o.order_type<>'order' or coalesce(o.payment_provider,'')='vipps' or o.confirmation_sent_at is not null then return false; end if;
 select * into q from public.service_order_confirmation_outbox where order_id=p_order_id for update;
 if found then
  if q.state not in ('claimed','needs_review') or q.claimed_at is null or q.claimed_at>now()-interval '5 minutes' then return false; end if;
 else
  insert into public.service_order_confirmation_outbox(order_id,state) values (p_order_id,'needs_review');
 end if;
 if p_result='accepted' and p_accepted_at<o.created_at then raise exception 'S33_INVALID_ACCEPTANCE_TIME'; end if;
 update public.service_order_confirmation_outbox set state=p_result,reviewed_at=now(),reviewer_id=p_reviewer_id,review_note=p_note,
  provider_email_id=case when p_result='accepted' then p_provider_id else null end,
  accepted_at=case when p_result='accepted' then p_accepted_at else null end
 where order_id=p_order_id;
 if p_result='accepted' then update public.orders set confirmation_sent_at=p_accepted_at where id=p_order_id; end if;
 return true;
end;
$$;
revoke all on function public.review_service_order_confirmation(uuid,text,text,text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.review_service_order_confirmation(uuid,text,text,text,text,timestamptz) to service_role;

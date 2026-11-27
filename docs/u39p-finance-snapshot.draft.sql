-- Read-only, one statement snapshot. Draft only: no grants or migration.
begin;
create function public.draft_group_finance_snapshot()
returns jsonb language sql stable security invoker set search_path=pg_catalog,public as $$
 with selected as (
  select * from public.rental_order_groups order by id limit 501
 ), rows as (
  select g.id, g.order_number, g.status, g.created_at, g.quote_snapshot, g.quote_digest, g.terms_version,
   g.rental_ore,g.sales_ore,g.payable_ore,g.deposit_ore,g.payment_reference,
   case when c.group_id is not null then jsonb_build_object('group_id',c.group_id,'reference',c.reference,'amount_ore',c.amount_ore,'psp_reference',c.psp_reference,'captured_at',c.captured_at) end as claim,
   case when d.group_id is not null then jsonb_build_object('amount_ore',d.amount_ore,'documented',exists(select 1 from public.rental_group_bank_evidence e where e.group_id=g.id and e.kind='deposit' and e.digest=d.proof_digest and e.reference=d.reference and e.amount_ore=d.amount_ore)) end as deposit,
   case when s.group_id is not null then jsonb_build_object('deposit_ore',s.deposit_ore,'refund_ore',s.refund_ore,'retained_ore',s.retained_ore,'closed_at',s.closed_at,'documented',s.closed_at is not null and (s.refund_ore=0 or exists(select 1 from public.rental_group_bank_evidence e where e.group_id=g.id and e.kind='record_refund' and e.digest=s.transfer_digest and e.reference=s.refund_reference and e.amount_ore=s.refund_ore and e.request_id=s.request_id))) end as settlement,
   case when t.group_id is not null then jsonb_build_object('state',t.state,'gross_ore',t.gross_ore,'remote_invoice_id',t.remote_invoice_id) end as invoice,
   case when p.group_id is not null then jsonb_build_object('state',p.state,'amount_ore',p.amount_ore,'remote_invoice_id',p.remote_invoice_id) end as payment
  from selected g
  left join public.rental_group_payment_claims c on c.group_id=g.id
  left join public.rental_group_deposit_receipts d on d.group_id=g.id
  left join public.rental_group_return_settlements s on s.group_id=g.id
  left join public.rental_group_tripletex_transfers t on t.group_id=g.id
  left join public.rental_group_tripletex_payment_transfers p on p.group_id=g.id
 )
 select case when count(*)>500 then jsonb_build_object('complete',false) else jsonb_build_object('complete',true,'rows',coalesce(jsonb_agg(to_jsonb(rows) order by id),'[]'::jsonb)) end from rows;
$$;
revoke all on function public.draft_group_finance_snapshot() from public,anon,authenticated,service_role;
rollback;

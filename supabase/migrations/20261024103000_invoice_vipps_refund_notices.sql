-- Durable notices for confirmed Vipps refunds on invoice payments.
-- No historic refunds are resent: rows are made only when cumulative amount increases.
create table if not exists public.invoice_vipps_refund_notices (
 id uuid primary key default gen_random_uuid(),
 payment_id uuid not null references public.invoice_vipps_payments(id),
 invoice_id uuid not null references public.invoice_drafts(id),
 refunded_total_ore bigint not null check (refunded_total_ore > 0),
 refunded_delta_ore bigint not null check (refunded_delta_ore > 0),
 status text not null default 'pending' check (status in ('pending','sending','failed','sent')),
 first_send_at timestamptz,
 last_attempt_at timestamptz,
 sent_at timestamptz,
 resend_id text,
 error_message text,
 created_at timestamptz not null default now(),
 unique(payment_id,refunded_total_ore)
);
create index if not exists invoice_vipps_refund_notices_pending_idx
 on public.invoice_vipps_refund_notices(status,last_attempt_at,created_at)
 where sent_at is null;
alter table public.invoice_vipps_refund_notices enable row level security;
revoke all on public.invoice_vipps_refund_notices from public,anon,authenticated;
grant select,insert,update on public.invoice_vipps_refund_notices to service_role;

create or replace function public.log_invoice_vipps_refund_notice()
returns trigger language plpgsql set search_path=pg_catalog,public
as $$
begin
 if new.refunded_ore > old.refunded_ore then
   if new.refunded_ore > new.captured_ore then
     raise exception 'Refund exceeds captured value';
   end if;
   insert into public.invoice_vipps_refund_notices
   (payment_id,invoice_id,refunded_total_ore,refunded_delta_ore)
   values(new.id,new.invoice_id,new.refunded_ore,new.refunded_ore-old.refunded_ore)
   on conflict (payment_id,refunded_total_ore) do nothing;
 end if;
 return new;
end;
$$;
drop trigger if exists invoice_vipps_refund_notice_added on public.invoice_vipps_payments;
create trigger invoice_vipps_refund_notice_added
after update of refunded_ore on public.invoice_vipps_payments
for each row execute function public.log_invoice_vipps_refund_notice();

create or replace function public.claim_invoice_vipps_refund_notice(p_payment_id uuid default null)
returns public.invoice_vipps_refund_notices
language plpgsql set search_path=pg_catalog,public as $$
declare claimed public.invoice_vipps_refund_notices%rowtype;
begin
 select * into claimed from public.invoice_vipps_refund_notices n
 where n.sent_at is null
 and (p_payment_id is null or n.payment_id=p_payment_id)
 and (n.first_send_at is null or n.first_send_at>now()-interval '23 hours')
 and (n.last_attempt_at is null or n.last_attempt_at<now()-interval '5 minutes')
 and n.status in ('pending','failed','sending')
 order by n.created_at,n.id
 limit 1 for update skip locked;
 if not found then return null; end if;
 update public.invoice_vipps_refund_notices
 set status='sending',first_send_at=coalesce(first_send_at,now()),
     last_attempt_at=now(),error_message=null
 where id=claimed.id returning * into claimed;
 return claimed;
end; $$;
revoke all on function public.claim_invoice_vipps_refund_notice(uuid) from public,anon,authenticated;
grant execute on function public.claim_invoice_vipps_refund_notice(uuid) to service_role;
revoke all on function public.log_invoice_vipps_refund_notice() from public,anon,authenticated;

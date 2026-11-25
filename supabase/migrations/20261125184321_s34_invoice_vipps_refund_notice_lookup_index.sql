-- S34: support invoice activity and dependency checks by invoice_id.
set local lock_timeout = '3s';
create index if not exists s34_invoice_vipps_refund_notices_invoice_id_idx on public.invoice_vipps_refund_notices(invoice_id);

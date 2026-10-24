-- Explicit, retry-safe customer delivery for issued credit notes.
alter table public.invoice_credit_notes
 add column if not exists first_send_at timestamptz,
 add column if not exists sent_at timestamptz,
 add column if not exists resend_id text,
 add column if not exists delivery_error text;

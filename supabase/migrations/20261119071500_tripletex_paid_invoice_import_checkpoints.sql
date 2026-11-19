-- Historical payments on an already-sent invoice are NOT a matched balance.
-- Keep a separate initial import checkpoint, never pretend local/remote matched.
alter table public.tripletex_direct_invoice_claims
 add column if not exists initial_paid_ore bigint not null default 0 check(initial_paid_ore>=0),
 add column if not exists initial_payment_count integer not null default 0 check(initial_payment_count>=0 and initial_payment_count<=100),
 add column if not exists initial_payment_digest text
  check(initial_payment_digest is null or length(initial_payment_digest)=64);
alter table public.tripletex_invoice_api_links
 add column if not exists initial_import_checkpoint_at timestamptz,
 add column if not exists initial_import_outstanding_ore bigint
  check(initial_import_outstanding_ore is null or initial_import_outstanding_ore>=0);
comment on column public.tripletex_invoice_api_links.initial_import_checkpoint_at is
 'Historic-payment checkpoint preceding the first locally recorded payment; NOT a balance-match timestamp.';
comment on column public.tripletex_invoice_api_links.initial_import_outstanding_ore is
 'Initial Tripletex balance before importing historically recorded local payments.';

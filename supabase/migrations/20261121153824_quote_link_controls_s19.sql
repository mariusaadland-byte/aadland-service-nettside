-- S-19: additive quote-link revocation; applied to production 2026-11-21.
alter table public.quotes
 add column quote_link_generation integer not null default 1
  check(quote_link_generation between 1 and 2147483647),
 add column quote_link_disabled_at timestamptz;
comment on column public.quotes.quote_link_generation is
 'Signed public link generation; increments invalidate all earlier URLs.';
comment on column public.quotes.quote_link_disabled_at is
 'When set, public bearer URLs cannot open the quote. Customer account history is separate.';
-- Original RLS and service-role-only grants remain unchanged.

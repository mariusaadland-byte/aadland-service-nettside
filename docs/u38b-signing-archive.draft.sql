-- DESIGN ONLY: isolated test database; U-37 group schema required. No live migration.
begin;
create table public.aadland_agreements (
 id uuid primary key,
 group_id uuid not null references public.rental_order_groups(id) on delete restrict,
 customer_user_id uuid not null references auth.users(id) on delete restrict,
 revision integer not null check(revision>0),
 document_bytes bytea not null check(octet_length(document_bytes) between 1 and 1048576),
 document_digest text not null check(document_digest ~ '^[0-9a-f]{64}$'),
 quote_digest text not null check(quote_digest ~ '^[0-9a-f]{64}$'),
 terms_version text not null,
 created_at timestamptz not null default now(),
 unique(group_id,revision),
 unique(id,customer_user_id,document_digest,quote_digest,terms_version),
 check(document_digest=encode(sha256(document_bytes),'hex'))
);
-- Current pointer is distinct from the immutable archived versions.
create table public.aadland_agreement_current (
 group_id uuid primary key references public.rental_order_groups(id) on delete restrict,
 agreement_id uuid not null unique references public.aadland_agreements(id) on delete restrict
);
create table public.aadland_signing_challenges (
 id uuid primary key,
 agreement_id uuid not null,
 customer_user_id uuid not null,
 document_digest text not null,
 quote_digest text not null,
 terms_version text not null,
 email text not null,
 key_id text not null,
 code_mac text check(code_mac ~ '^[0-9a-f]{64}$'),
 attempts integer not null default 0 check(attempts between 0 and 5),
 state text not null check(state in ('pending','consumed','revoked','locked','expired')),
 issued_at timestamptz not null,
 expires_at timestamptz not null,
 foreign key(agreement_id,customer_user_id,document_digest,quote_digest,terms_version)
 references public.aadland_agreements(id,customer_user_id,document_digest,quote_digest,terms_version) on delete restrict,
 check(expires_at=issued_at+interval '10 minutes'),
 check((state='pending')=(code_mac is not null))
);
create unique index aadland_one_pending_challenge on public.aadland_signing_challenges(agreement_id) where state='pending';
-- Persist original canonical evidence JSON as TEXT (JSONB changes key order).
create table public.aadland_signing_evidence (
 agreement_id uuid primary key references public.aadland_agreements(id) on delete restrict,
 challenge_id uuid not null unique references public.aadland_signing_challenges(id) on delete restrict,
 evidence_text text not null check(octet_length(evidence_text) between 1 and 20000),
 evidence_seal text not null check(evidence_seal ~ '^[0-9a-f]{64}$'),
 key_id text not null,
 signed_at timestamptz not null
);
alter table public.aadland_agreements enable row level security;
alter table public.aadland_agreement_current enable row level security;
alter table public.aadland_signing_challenges enable row level security;
alter table public.aadland_signing_evidence enable row level security;
revoke all on public.aadland_agreements,public.aadland_agreement_current,public.aadland_signing_challenges,public.aadland_signing_evidence from public,anon,authenticated,service_role;
-- No runtime grants or policies yet; future RPC must verify pointer/group/customer,
-- full document binding, account-level quotas and transactional OTP consumption.
rollback;

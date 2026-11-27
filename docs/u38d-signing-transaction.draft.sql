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

-- U-38D candidate. Run only in disposable database with U-37 group schema.
-- Current pointer cannot reference a document from another group.
alter table public.aadland_agreements add unique(group_id,id);
alter table public.aadland_agreement_current add foreign key(group_id,agreement_id)
 references public.aadland_agreements(group_id,id) on delete restrict;
create table public.aadland_signing_attempt_events(
 id bigint generated always as identity primary key,
 customer_user_id uuid not null references auth.users(id) on delete restrict,
 challenge_id uuid not null references public.aadland_signing_challenges(id) on delete restrict,
 occurred_at timestamptz not null default clock_timestamp()
);
create index aadland_attempt_account_time on public.aadland_signing_attempt_events(customer_user_id,occurred_at);
create index aadland_issue_account_time on public.aadland_signing_challenges(customer_user_id,issued_at);
alter table public.aadland_signing_attempt_events enable row level security;
revoke all on public.aadland_signing_attempt_events from public,anon,authenticated,service_role;
revoke all on sequence public.aadland_signing_attempt_events_id_seq from public,anon,authenticated,service_role;

-- All issue/verify writers take account advisory lock, then group row lock.
-- Current pointer writers must take group lock too. Account authentication is
-- also required at server entry; account ID must never come from browser.
create function public.draft_signing_context_ok(p_agreement uuid,p_customer uuid,p_email text)
returns boolean language plpgsql security invoker set search_path=pg_catalog,public as $$
declare a public.aadland_agreements%rowtype; g public.rental_order_groups%rowtype;
begin
 if p_customer is null or p_agreement is null or p_email is null then return false; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_customer::text,3804));
 select * into a from public.aadland_agreements where id=p_agreement and customer_user_id=p_customer;
 if not found then return false; end if;
 select * into g from public.rental_order_groups where id=a.group_id for update;
 if not found or g.customer_user_id is distinct from p_customer or g.status is distinct from 'held'
 or g.expires_at<=clock_timestamp() or g.quote_digest is distinct from a.quote_digest
 or g.terms_version is distinct from a.terms_version then return false; end if;
 if not exists(select 1 from public.aadland_agreement_current where group_id=g.id and agreement_id=a.id) then return false; end if;
 if not exists(select 1 from auth.users where id=p_customer and email_confirmed_at is not null and lower(trim(email))=p_email) then return false; end if;
 return true;
end $$;
revoke all on function public.draft_signing_context_ok(uuid,uuid,text) from public,anon,authenticated,service_role;

create function public.draft_signing_issue(p_agreement uuid,p_customer uuid,p_email text,p_id uuid,p_key text,p_mac text,p_issued timestamptz,p_document text,p_quote text,p_terms text)
returns text language plpgsql security invoker set search_path=pg_catalog,public as $$
declare a public.aadland_agreements%rowtype; n timestamptz;
begin
 if not public.draft_signing_context_ok(p_agreement,p_customer,p_email) then return 'unavailable'; end if;
 n:=clock_timestamp();
 if p_id is null or p_key is null or p_key !~ '^[a-zA-Z0-9_-]{1,64}$' or p_mac is null or p_mac !~ '^[0-9a-f]{64}$'
 or p_issued is null or p_issued<n-interval '30 seconds' or p_issued>n+interval '5 seconds' then return 'unavailable'; end if;
 select * into a from public.aadland_agreements where id=p_agreement;
 if a.document_digest is distinct from p_document or a.quote_digest is distinct from p_quote or a.terms_version is distinct from p_terms
 or exists(select 1 from public.aadland_signing_evidence where agreement_id=p_agreement) then return 'unavailable'; end if;
 if exists(select 1 from public.aadland_signing_challenges where customer_user_id=p_customer and issued_at>n-interval '60 seconds')
 or (select count(*) from public.aadland_signing_challenges where customer_user_id=p_customer and issued_at>n-interval '1 hour')>=3
 or (select count(*) from public.aadland_signing_attempt_events where customer_user_id=p_customer and occurred_at>n-interval '1 hour')>=5 then return 'limited'; end if;
 update public.aadland_signing_challenges set state='revoked',code_mac=null where agreement_id=p_agreement and state='pending';
 insert into public.aadland_signing_challenges(id,agreement_id,customer_user_id,document_digest,quote_digest,terms_version,email,key_id,code_mac,state,issued_at,expires_at)
 values(p_id,p_agreement,p_customer,p_document,p_quote,p_terms,p_email,p_key,p_mac,'pending',p_issued,p_issued+interval '10 minutes');
 return 'reserved';
end $$;
revoke all on function public.draft_signing_issue(uuid,uuid,text,uuid,text,text,timestamptz,text,text,text) from public,anon,authenticated,service_role;

create function public.draft_signing_revoke(p_customer uuid,p_agreement uuid,p_id uuid)
returns boolean language plpgsql security invoker set search_path=pg_catalog,public as $$
begin
 perform pg_advisory_xact_lock(hashtextextended(p_customer::text,3804));
 update public.aadland_signing_challenges set state='revoked',code_mac=null
 where id=p_id and customer_user_id=p_customer and agreement_id=p_agreement and state='pending';
 return found;
end $$;
revoke all on function public.draft_signing_revoke(uuid,uuid,uuid) from public,anon,authenticated,service_role;

-- Trusted server verifies HMAC with a private key before calling. SQL does NOT
-- independently verify code or seal. This endpoint must never accept browser
-- decisions. Compare-and-swap binds the decision to exact pending challenge.
create function public.draft_signing_commit(p_agreement uuid,p_customer uuid,p_email text,p_id uuid,p_expected_mac text,p_expected_attempts integer,p_key text,p_action text,p_evidence text,p_seal text)
returns text language plpgsql security invoker set search_path=pg_catalog,public as $$
declare c public.aadland_signing_challenges%rowtype; n timestamptz; e jsonb; signed timestamptz;
begin
 if not public.draft_signing_context_ok(p_agreement,p_customer,p_email) then return 'unavailable'; end if;
 select * into c from public.aadland_signing_challenges where id=p_id and agreement_id=p_agreement and customer_user_id=p_customer for update;
 if not found then return 'unavailable'; end if;
 if c.state<>'pending' then return 'closed'; end if;
 n:=clock_timestamp();
 if c.expires_at<=n then
  update public.aadland_signing_challenges set state='expired',code_mac=null where id=c.id; return 'expired';
 end if;
 if c.email is distinct from p_email or c.code_mac is distinct from p_expected_mac or c.attempts is distinct from p_expected_attempts or c.key_id is distinct from p_key then return 'stale'; end if;
 if c.attempts>=5 or (select count(*) from public.aadland_signing_attempt_events where customer_user_id=p_customer and occurred_at>n-interval '1 hour')>=5 then return 'limited'; end if;
 if p_action='record_failure' then
  insert into public.aadland_signing_attempt_events(customer_user_id,challenge_id) values(p_customer,c.id);
  update public.aadland_signing_challenges set attempts=attempts+1,
   state=case when attempts+1>=5 then 'locked' else 'pending' end,
   code_mac=case when attempts+1>=5 then null else code_mac end where id=c.id;
  return 'wrong_code';
 end if;
 if p_action is distinct from 'consume_and_record' or p_evidence is null or octet_length(p_evidence)>20000 or p_seal is null or p_seal !~ '^[0-9a-f]{64}$' then return 'unavailable'; end if;
 e:=p_evidence::jsonb; signed:=(e->>'signedAt')::timestamptz;
 if e->>'version' is distinct from 'aadland-email-otp-v1' or e->>'method' is distinct from 'typed_name_email_otp'
 or e->>'agreementId' is distinct from p_agreement::text or e->>'customerId' is distinct from p_customer::text
 or e->>'challengeId' is distinct from c.id::text or e->>'email' is distinct from c.email
 or e->>'documentDigest' is distinct from c.document_digest or e->>'quoteDigest' is distinct from c.quote_digest
 or e->>'termsVersion' is distinct from c.terms_version or e->>'statement' is distinct from 'Jeg har lest den viste leieavtalen og godtar den avtalte betalingsforpliktelsen og ansvaret som følger av avtalen.'
 or coalesce(length(trim(e->>'name')),0) not between 2 and 120
 or signed is null or signed<c.issued_at or signed>=c.expires_at or signed<n-interval '30 seconds' or signed>n then return 'unavailable'; end if;
 if exists(select 1 from public.aadland_signing_evidence where agreement_id=p_agreement) then return 'closed'; end if;
 insert into public.aadland_signing_evidence(agreement_id,challenge_id,evidence_text,evidence_seal,key_id,signed_at)
 values(p_agreement,c.id,p_evidence,p_seal,c.key_id,signed);
 update public.aadland_signing_challenges set state='consumed',code_mac=null where id=c.id;
 return 'signed';
end $$;
revoke all on function public.draft_signing_commit(uuid,uuid,text,uuid,text,integer,text,text,text,text) from public,anon,authenticated,service_role;
-- No grants or runtime endpoints. Retention/cleanup and private document reads pending.
rollback;

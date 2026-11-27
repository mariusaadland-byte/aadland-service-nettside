-- Isolated draft. No runtime grants. Attach after reserve; safe replay.
begin;
create function public.draft_group_attach_agreement(p_group uuid,p_customer uuid,p_email text,p_id uuid,p_bytes bytea,p_document text,p_quote text,p_terms text)
returns uuid language plpgsql security invoker set search_path=pg_catalog,public as $$
declare g public.rental_order_groups%rowtype; a public.aadland_agreements%rowtype;
begin
 if p_customer is null or p_group is null or p_id is null or p_email is null or p_bytes is null or octet_length(p_bytes) not between 16 and 1048576 or substring(p_bytes from 1 for 5)<>convert_to('%PDF-','UTF8') or p_document is distinct from encode(sha256(p_bytes),'hex') then return null; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_customer::text,3804));
 select * into g from public.rental_order_groups where id=p_group for update;
 if not found or g.customer_user_id is distinct from p_customer or g.status<>'held' or g.expires_at<=clock_timestamp() or g.quote_digest is distinct from p_quote or g.terms_version is distinct from p_terms or not exists(select 1 from auth.users where id=p_customer and email_confirmed_at is not null and lower(trim(email))=p_email) then return null; end if;
 select a0.* into a from public.aadland_agreement_current c join public.aadland_agreements a0 on a0.id=c.agreement_id where c.group_id=g.id;
 if found then
  if a.customer_user_id=p_customer and a.quote_digest=p_quote and a.terms_version=p_terms then return a.id; end if;
  return null;
 end if;
 if exists(select 1 from public.aadland_agreements where group_id=g.id) then return null; end if;
 insert into public.aadland_agreements(id,group_id,customer_user_id,revision,document_bytes,document_digest,quote_digest,terms_version)
 values(p_id,g.id,p_customer,1,p_bytes,p_document,p_quote,p_terms);
 insert into public.aadland_agreement_current(group_id,agreement_id) values(g.id,p_id);
 return p_id;
end $$;
revoke all on function public.draft_group_attach_agreement(uuid,uuid,text,uuid,bytea,text,text,text) from public,anon,authenticated,service_role;
rollback;

-- Prevent indeterminate cron claims from remaining "processing" indefinitely.
alter table public.invoice_drafts
 add column if not exists auto_send_claimed_at timestamptz;

create or replace function public.claim_scheduled_invoice_sends(p_today date,p_batch_size integer default 5)
returns table(invoice_id uuid) language plpgsql security invoker set search_path=pg_catalog,public as $claim$
begin
 return query
 with ready as (
  select id from public.invoice_drafts
  where automatic_send=true and auto_send_state='scheduled'
   and status='draft' and planned_send_on<=p_today
  order by planned_send_on,id
  for update skip locked limit least(greatest(p_batch_size,1),10)
 ), claimed as (
  update public.invoice_drafts i
  set auto_send_state='processing',auto_send_claimed_at=now()
  from ready where i.id=ready.id
  returning i.id
 )
 select id from claimed;
end $claim$;
revoke all on function public.claim_scheduled_invoice_sends(date,integer) from public,anon,authenticated;
grant execute on function public.claim_scheduled_invoice_sends(date,integer) to service_role;

-- Unknown-provider outcomes can NEVER be picked up for another automatic send.
create or replace function public.expire_stale_scheduled_invoice_claims()
returns table(invoice_id uuid,final_state text)
language plpgsql security invoker set search_path=pg_catalog,public as $expire$
begin
 return query
 with stale as (
  select id from public.invoice_drafts
  where automatic_send and auto_send_state='processing'
   and (auto_send_claimed_at is null or
    auto_send_claimed_at<now()-interval '30 minutes')
  order by id for update skip locked limit 20
 ), changed as (
  update public.invoice_drafts i set
   auto_send_state=case when i.status='sent' or i.sent_at is not null
    then 'sent' else 'needs_review' end,
   auto_send_error=case when i.status='sent' or i.sent_at is not null
    then null else 'Tidligere automatiske sendeforsøk er avbrutt eller har ukjent status. Kontroller e-postloggen før ny sending.' end
  from stale where i.id=stale.id
  returning i.id,i.auto_send_state
 )
 select id,auto_send_state from changed;
end $expire$;
revoke all on function public.expire_stale_scheduled_invoice_claims() from public,anon,authenticated;
grant execute on function public.expire_stale_scheduled_invoice_claims() to service_role;

-- Only a narrowly audited owner-only RPC may refresh a stopped unsent second
-- invoice; old financial data and the original first invoice stay unchanged.
create or replace function public.protect_split_invoice_draft()
returns trigger language plpgsql security invoker set search_path=pg_catalog,public as $guard$
begin
 if old.status='draft' and new.status='draft' and old.split_group_id is not null and
  (new.customer,new.title,new.line_items,new.notes,new.pricing_model,
   new.due_date_mode,new.due_date,new.installment_percent)
  is distinct from
  (old.customer,old.title,old.line_items,old.notes,old.pricing_model,
   old.due_date_mode,old.due_date,old.installment_percent)
  and current_setting('app.scheduled_invoice_review',true) is distinct from 'approved'
 then
  raise exception 'Oppdelte fakturakladder er låst for redigering av beløp og kundedata.';
 end if;
 return new;
end $guard$;
revoke all on function public.protect_split_invoice_draft() from public,anon,authenticated;

create or replace function public.review_scheduled_invoice_for_manual_send(p_id uuid)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $review$
declare i public.invoice_drafts%rowtype; first_invoice public.invoice_drafts%rowtype;
 contact public.admin_customer_contacts%rowtype; next_customer jsonb;
 contact_id text;
begin
 select * into i from public.invoice_drafts where id=p_id for update;
 if not found or i.status<>'draft' or i.split_part<>2
   or i.auto_send_state<>'needs_review' or not i.automatic_send then
  raise exception 'Denne del-fakturaen er ikke klar for manuell gjennomgang.'; end if;
 if i.first_send_at is not null or i.invoice_number is not null then
  raise exception 'Tidligere utsendelsesforsøk eller utstedt faktura må kontrolleres i e-postloggen. Automatisk frigivelse er sperret.'; end if;
 select * into first_invoice from public.invoice_drafts where id=i.split_group_id;
 if not found or first_invoice.status<>'sent' or first_invoice.sent_at is null then
  raise exception 'Del 1 må være registrert sendt før del 2 kan frigis.'; end if;
 next_customer:=i.customer;
 contact_id:=nullif(btrim(coalesce(i.customer->>'contactId','')),'');
 if contact_id is not null then
  if contact_id !~ '^[0-9a-fA-F-]{36}$' then raise exception 'Kundekort-ID er ugyldig.'; end if;
  select * into contact from public.admin_customer_contacts where id=contact_id::uuid;
  if not found then raise exception 'Kundekortet finnes ikke. Kontroller mottaker manuelt.'; end if;
  next_customer:=next_customer||jsonb_build_object(
   'name',contact.name,'email',coalesce(contact.email,''),
   'address',coalesce(contact.address,''),'phone',coalesce(contact.phone,''),
   'customerType',contact.customer_type,
   'organizationNumber',case when contact.customer_type='business'
     then coalesce(contact.organization_number,'') else '' end,
   'contactPerson',case when contact.customer_type='business'
     then coalesce(contact.contact_person,'') else '' end
  );
 end if;
 if btrim(coalesce(next_customer->>'name',''))='' or
    btrim(coalesce(next_customer->>'address',''))='' or
    coalesce(next_customer->>'email','') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
  raise exception 'Fyll inn gyldig navn, fakturaadresse og e-post på kundekortet.'; end if;
 perform set_config('app.scheduled_invoice_review','approved',true);
 update public.invoice_drafts set
  customer=next_customer,
  automatic_send=false,auto_send_state='manual',auto_send_error=null,updated_at=now()
 where id=p_id;
 return jsonb_build_object('id',p_id,'status','manual','customerUpdated',next_customer is distinct from i.customer);
end $review$;
revoke all on function public.review_scheduled_invoice_for_manual_send(uuid) from public,anon,authenticated;
grant execute on function public.review_scheduled_invoice_for_manual_send(uuid) to service_role;

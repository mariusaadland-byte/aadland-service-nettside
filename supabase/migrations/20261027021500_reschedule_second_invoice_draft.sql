-- Reschedule only a never-issued second invoice, without changing its
-- original total, number, recipient, or first installment.
create or replace function public.reschedule_second_invoice_draft(
 p_id uuid,p_send_on date,p_terms_days integer,p_auto_send boolean
) returns jsonb
language plpgsql security invoker set search_path=pg_catalog,public as $body$
declare
 i public.invoice_drafts%rowtype;
 first_part public.invoice_drafts%rowtype;
 today_local date:=(now() at time zone 'Europe/Oslo')::date;
 work_date date;
 new_customer jsonb;
 new_state text;
begin
 if p_id is null or p_send_on is null or
  p_terms_days is null or p_terms_days not between 0 and 365 or
  p_auto_send is null then
  raise exception 'Velg gyldig dato, betalingsfrist og utsendelsesmetode.';
 end if;

 select * into i from public.invoice_drafts where id=p_id for update;
 if not found or i.status<>'draft' or i.split_part<>2 or i.split_group_id is null then
  raise exception 'Bare del 2 av en usendt, oppdelt faktura kan flyttes.';
 end if;
 if i.auto_send_state not in ('scheduled','manual','cancelled') or
  i.first_send_at is not null or i.sent_at is not null or
  i.invoice_number is not null or i.issued_at is not null or i.pdf_base64 is not null then
  raise exception 'Tidligere utstedelse eller usikker sendestatus må kontrolleres. Flytting er sperret.';
 end if;

 select * into first_part from public.invoice_drafts where id=i.split_group_id;
 if not found or first_part.split_part<>1 then
  raise exception 'Den opprinnelige del-fakturaen kan ikke kontrolleres.';
 end if;
 if p_send_on<today_local or p_send_on<=first_part.planned_send_on then
  raise exception 'Ny sendingsdato må være fra i dag og etter datoen for del 1.';
 end if;
 if coalesce(i.customer->>'workDate','') !~ '^\d{4}-\d{2}-\d{2}$' then
  raise exception 'Leveringsdato mangler eller er ugyldig.';
 end if;
 work_date:=(i.customer->>'workDate')::date;
 if p_send_on<work_date or
    p_send_on>(work_date+interval '1 month')::date then
  raise exception 'Datoen må være etter levering og normalt innen én måned fra leveringsdato. Vurder annen betalingsplan særskilt.';
 end if;
 new_customer:=i.customer||jsonb_build_object('paymentTermsDays',p_terms_days);
 new_state:=case when p_auto_send then 'scheduled' else 'manual' end;
 -- Existing DB draft guard deliberately blocks any direct edits of a split
 -- invoice's recipient and due date. Only this restricted service_role RPC may
 -- set the local override flag in the same SQL transaction.
 perform set_config('app.scheduled_invoice_review','approved',true);
 update public.invoice_drafts set
  customer=new_customer,
  payment_terms_override_days=p_terms_days,
  planned_send_on=p_send_on,due_date=p_send_on+p_terms_days,
  automatic_send=p_auto_send,auto_send_state=new_state,
  auto_send_error=null,auto_send_claimed_at=null,
  updated_at=now()
 where id=p_id;
 return jsonb_build_object(
  'id',p_id,'plannedSendOn',p_send_on,'termsDays',p_terms_days,
  'autoSend',p_auto_send,'status',new_state,'dueDate',p_send_on+p_terms_days);
end $body$;

revoke all on function public.reschedule_second_invoice_draft(uuid,date,integer,boolean)
 from public,anon,authenticated;
grant execute on function public.reschedule_second_invoice_draft(uuid,date,integer,boolean)
 to service_role;

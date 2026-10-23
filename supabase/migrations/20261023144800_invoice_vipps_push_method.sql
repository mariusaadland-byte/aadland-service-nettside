-- Merchant-initiated in-person Vipps requests are restricted to an approved
-- sales unit. Keep the method and approved mobile number immutable while the
-- payment attempt is pending, to prevent accidental second push requests.
alter table public.invoice_vipps_payments
 add column if not exists delivery_method text not null default 'email_link'
   check(delivery_method in ('email_link','vipps_push')),
 add column if not exists push_phone text,
 add column if not exists push_requested_at timestamptz;

alter table public.invoice_vipps_payments
 add constraint invoice_vipps_push_phone_required
 check (
   (delivery_method='email_link' and push_phone is null)
   or
   (delivery_method='vipps_push' and push_phone ~ '^47[0-9]{8}$')
 );

create or replace function public.prepare_invoice_vipps_v2(
 p_invoice_id uuid, p_delivery_method text, p_push_phone text default null
) returns jsonb language plpgsql set search_path=pg_catalog,public as $$
declare i public.invoice_drafts%rowtype; p public.invoice_vipps_payments%rowtype; total bigint;
begin
 if p_delivery_method not in ('email_link','vipps_push') then
  raise exception 'Ugyldig betalingskanal.';
 end if;
 if (p_delivery_method='vipps_push' and (p_push_phone is null or p_push_phone !~ '^47[0-9]{8}$'))
    or (p_delivery_method='email_link' and p_push_phone is not null) then
  raise exception 'Ugyldig mobilnummer eller betalingskanal.';
 end if;
 select * into i from public.invoice_drafts where id=p_invoice_id for update;
 if not found or i.status='draft' then raise exception 'Utsted fakturaen først.'; end if;
 select * into p from public.invoice_vipps_payments
  where invoice_id=i.id and state in ('pending','authorized')
  order by created_at desc limit 1;
 if found then
  if p.delivery_method<>p_delivery_method
     or coalesce(p.push_phone,'')<>coalesce(p_push_phone,'') then
   raise exception 'Et annet Vipps-forsøk pågår. Kontroller det før du bytter betalingsmåte eller nummer.';
  end if;
  return to_jsonb(p);
 end if;
 select sum(round((l->>'quantity')::numeric*(l->>'unitPriceOre')::numeric)+round(round((l->>'quantity')::numeric*(l->>'unitPriceOre')::numeric)*(l->>'vatRate')::numeric/100))::bigint
  into total from jsonb_array_elements(i.line_items) l;
 if total-i.paid_ore<100 then raise exception 'Fakturaen er betalt eller restbeløpet er under 1 krone.'; end if;
 insert into public.invoice_vipps_payments(invoice_id,amount_ore,delivery_method,push_phone)
 values(i.id,total-i.paid_ore,p_delivery_method,p_push_phone) returning * into p;
 return to_jsonb(p);
end $$;
revoke all on function public.prepare_invoice_vipps_v2(uuid,text,text) from public,anon,authenticated;
grant execute on function public.prepare_invoice_vipps_v2(uuid,text,text) to service_role;

create or replace function public.create_accepted_quote_order(p_quote_id uuid,p_order_number text)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare
 q public.quotes%rowtype; created_order public.orders%rowtype;
 customer_id uuid; line_text text; request_text text;
begin
 select * into q from public.quotes where id=p_quote_id for update;
 if not found then raise exception using errcode='P0002',message='Tilbudet ble ikke funnet.'; end if;
 if q.status<>'accepted' then raise exception using errcode='22023',message='Bare godkjente tilbud kan gjøres om til oppdrag.'; end if;
 if q.converted_order_id is not null then
  return jsonb_build_object('orderId',q.converted_order_id,'alreadyExists',true);
 end if;
 if p_order_number is null or length(p_order_number)>100 or btrim(p_order_number)='' then
  raise exception using errcode='22023',message='Oppdragsnummer mangler.';
 end if;
 if q.source_order_id is not null then
  select customer_user_id into customer_id from public.orders where id=q.source_order_id;
 end if;
 if customer_id is null and nullif(btrim(q.customer->>'email'),'') is not null then
  select id into customer_id from public.customer_profiles
   where email=lower(btrim(q.customer->>'email')) limit 1;
 end if;
 select string_agg('• '||coalesce(value->>'description','')||' — '||
  coalesce(value->>'quantity','')||' '||coalesce(value->>'unit',''),E'\n' order by ord)
 into line_text from jsonb_array_elements(coalesce(q.line_items,'[]'::jsonb)) with ordinality as lines(value,ord);
 request_text=concat_ws(E'\n','Godkjent tilbud '||q.quote_number,nullif(q.title,''),nullif(q.intro_text,''),
  case when line_text is not null then E'\nArbeid og leveranser:\n'||line_text end,
  case when nullif(q.notes,'') is not null then E'\nTilleggsinformasjon:\n'||q.notes end);
 insert into public.orders(customer_user_id,order_number,order_type,status,customer,fulfillment_type,
  delivery_within_radius,items,custom_request,total_ore,shipping_ore,payment_status,terms_version,terms_accepted_at)
 values(customer_id,p_order_number,'custom','confirmed',coalesce(q.customer,'{}'::jsonb),'pickup',
  null,'[]'::jsonb,request_text,coalesce(q.total_inc_vat_ore,0),0,'unpaid',null,null)
 returning * into created_order;
 update public.quotes set converted_order_id=created_order.id,updated_at=now() where id=q.id;
 return jsonb_build_object('orderId',created_order.id,'orderNumber',created_order.order_number,'alreadyExists',false);
end; $$;
revoke all on function public.create_accepted_quote_order(uuid,text) from public,anon,authenticated;
grant execute on function public.create_accepted_quote_order(uuid,text) to service_role;

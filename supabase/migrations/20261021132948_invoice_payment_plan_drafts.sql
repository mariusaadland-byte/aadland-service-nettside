alter table public.invoice_drafts
 add column installment_index integer not null default 0,
 add column installment_label text,
 add column installment_percent numeric,
 add column installment_trigger text;
alter table public.invoice_drafts drop constraint invoice_drafts_source_quote_id_key;
alter table public.invoice_drafts add constraint invoice_drafts_quote_installment_key unique(source_quote_id,installment_index);
alter table public.invoice_drafts add constraint invoice_drafts_installment_index_check check(installment_index between 0 and 8);

create or replace function public.ensure_quote_invoice_drafts(quote_id uuid)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare
 q public.quotes%rowtype; plan jsonb; stage jsonb; line jsonb;
 stages jsonb[]; count_stages integer; j integer; k integer;
 pct numeric; net bigint; remaining_net bigint; share_net bigint;
 rate integer; quantum integer; model text; result jsonb;
begin
 select * into q from public.quotes where id=quote_id for update;
 if not found then raise exception 'Tilbudet ble ikke funnet.'; end if;
 -- An existing full invoice (index 0) is intentionally left intact.
 select jsonb_agg(jsonb_build_object('id',i.id) order by i.installment_index) into result
 from public.invoice_drafts i where i.source_quote_id=q.id;
 if result is not null then return result; end if;
 if q.status<>'accepted' then raise exception 'Bare godkjente tilbud kan få betalingsplan.'; end if;
 plan=q.payment_plan;
 if plan is null or jsonb_array_length(plan)=0 then
  plan='[{"label":"Forskudd","percent":25,"trigger":"Ved aksept av tilbud"},{"label":"Delbetaling","percent":50,"trigger":"Når omtrent halvparten av arbeidet er utført"},{"label":"Sluttoppgjør","percent":25,"trigger":"Ved ferdigstillelse"}]'::jsonb;
 end if;
 count_stages=jsonb_array_length(plan);
 if count_stages>8 or (select sum((p->>'percent')::numeric) from jsonb_array_elements(plan) p)<>100
 or exists(select 1 from jsonb_array_elements(plan) p where (p->>'percent')::numeric<0 or (p->>'percent')::numeric>100 or p->>'percent' is null)
 then raise exception 'Betalingsplanen må til sammen være 100 prosent.'; end if;
 for j in 1..count_stages loop stages[j]='[]'::jsonb; end loop;
 for line in select value from jsonb_array_elements(q.line_items) loop
  net=round((line->>'quantity')::numeric*(line->>'unitPriceOre')::numeric);
  rate=(line->>'vatRate')::integer;
  if net<0 or rate not in (0,12,15,25) then raise exception 'Kontroller priser og MVA i tilbudet.'; end if;
  -- Exact VAT quanta keep the sum of net amounts AND VAT unchanged.
  quantum=case rate when 12 then 25 when 15 then 20 when 25 then 4 else 1 end;
  remaining_net=net;
  for j in 1..count_stages loop
   pct=(plan->(j-1)->>'percent')::numeric;
   if j=count_stages then share_net=remaining_net;
   else share_net=least(remaining_net,greatest(0,round(net*pct/100/quantum)*quantum)); end if;
   remaining_net=remaining_net-share_net;
   stages[j]=stages[j]||jsonb_build_array(jsonb_build_object(
    'description',left(line->>'description',450)||' - andel '||pct||' %',
    'type',coalesce(line->>'type','work'),'quantity',1,'unit','andel',
    'unitPriceOre',share_net,'vatRate',rate));
  end loop;
 end loop;
 model=case when q.intro_text like 'PRISFORM: TIMEARBEID%' then 'hourly'
            when q.intro_text like 'PRISFORM: PRISOVERSLAG%' then 'estimate' else 'fixed' end;
 for j in 1..count_stages loop
  stage=plan->(j-1);
  insert into public.invoice_drafts(
   source_quote_id,customer,title,pricing_model,line_items,notes,
   installment_index,installment_label,installment_percent,installment_trigger
  ) values(
   q.id,q.customer||jsonb_build_object('workDescription',left(
     coalesce(stage->>'label','Delbetaling')||' ('||(stage->>'percent')||' %) av tilbud '||q.quote_number||
     '. '||coalesce(stage->>'trigger','')||E'\n\n'||coalesce(q.intro_text,q.title),3000)),
   left(q.title||' - '||coalesce(stage->>'label','Delbetaling')||' ('||(stage->>'percent')||' %)',250),
   model,stages[j],
   'Tilbud '||q.quote_number||'. Del '||j||' av '||count_stages||'. '||coalesce(stage->>'trigger','')||
   '. Forfallsdato velges når denne delen skal faktureres. Øreavrunding er fordelt slik at samlet beløp og MVA stemmer med tilbudet.'||
   case when model<>'fixed' then ' Kontroller faktisk medgåtte timer og materialforbruk før sluttoppgjør.' else '' end,
   j,stage->>'label',(stage->>'percent')::numeric,stage->>'trigger');
 end loop;
 select jsonb_agg(jsonb_build_object('id',i.id) order by i.installment_index) into result
 from public.invoice_drafts i where i.source_quote_id=q.id;
 return result;
end; $$;
revoke all on function public.ensure_quote_invoice_drafts(uuid) from public,anon,authenticated;
grant execute on function public.ensure_quote_invoice_drafts(uuid) to service_role;

create or replace function public.quote_accepted_invoice_plan()
returns trigger language plpgsql security invoker set search_path=pg_catalog,public as $$
begin
 if new.status='accepted' then
  perform public.ensure_quote_invoice_drafts(new.id);
 end if;
 return new;
end; $$;
revoke all on function public.quote_accepted_invoice_plan() from public,anon,authenticated;
create trigger quote_accepted_invoice_plan
after insert or update of status on public.quotes
for each row execute function public.quote_accepted_invoice_plan();

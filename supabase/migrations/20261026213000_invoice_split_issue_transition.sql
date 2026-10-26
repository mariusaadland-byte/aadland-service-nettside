-- Preserve immutable split draft amounts while allowing draft -> issued
-- to update due date, recipient's payment term and invoice number atomically.
create or replace function public.protect_split_invoice_draft()
returns trigger language plpgsql security invoker set search_path=pg_catalog,public as $guard$
begin
 if old.status='draft' and new.status='draft' and old.split_group_id is not null and
  (new.customer,new.title,new.line_items,new.notes,new.pricing_model,
   new.due_date_mode,new.due_date,new.installment_percent)
  is distinct from
  (old.customer,old.title,old.line_items,old.notes,old.pricing_model,
   old.due_date_mode,old.due_date,old.installment_percent) then
  raise exception 'Oppdelte fakturakladder er låst for redigering av beløp og kundedata.';
 end if;
 return new;
end $guard$;
revoke all on function public.protect_split_invoice_draft() from public,anon,authenticated;

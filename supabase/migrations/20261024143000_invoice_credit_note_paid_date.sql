
-- Recalculate the fully-paid date when a credit note settles the remaining balance.
do $patch$
declare ddl text; new_ddl text;
begin
 select pg_get_functiondef('public.issue_invoice_credit_note(uuid,uuid,text,jsonb,bigint,uuid)'::regprocedure::oid) into ddl;
 new_ddl=replace(ddl,
 'set credited_ore=credited_ore+total,payment_updated_at=now()',
 'set credited_ore=credited_ore+total,payment_updated_at=now(),
    paid_date=case when i.paid_ore>0 and i.paid_ore=gross-(i.credited_ore+total)
      then (select max(paid_on) from public.invoice_payments
             where invoice_id=i.id and reversed_at is null)
      else null end');
 if ddl=new_ddl then raise exception 'Credit-note paid-date patch target was not found'; end if;
 execute new_ddl;
end $patch$;

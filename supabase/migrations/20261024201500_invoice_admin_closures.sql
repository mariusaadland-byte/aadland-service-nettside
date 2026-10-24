-- Administrative completion never changes the invoice's financial or legal status.
create table if not exists public.invoice_admin_closures(
 invoice_id uuid primary key references public.invoice_drafts(id),
 closed_at timestamptz,
 closed_by uuid,
 close_note text,
 last_changed_at timestamptz not null default now(),
 revision bigint not null default 0
);
create table if not exists public.invoice_admin_closure_events(
 id uuid primary key,
 invoice_id uuid not null references public.invoice_drafts(id),
 action text not null check(action in ('close','reopen','automatic_reopen')),
 actor_id uuid,
 note text not null check(length(btrim(note)) between 5 and 500),
 happened_at timestamptz not null default now(),
 paid_ore bigint not null check(paid_ore>=0),
 credited_ore bigint not null check(credited_ore>=0),
 outstanding_ore bigint not null check(outstanding_ore>=0)
);
create index if not exists invoice_admin_closure_events_invoice_idx
 on public.invoice_admin_closure_events(invoice_id,happened_at desc,id);
alter table public.invoice_admin_closures enable row level security;
alter table public.invoice_admin_closure_events enable row level security;
revoke all on public.invoice_admin_closures from public,anon,authenticated;
revoke all on public.invoice_admin_closure_events from public,anon,authenticated;
grant select,insert,update on public.invoice_admin_closures to service_role;
grant select,insert on public.invoice_admin_closure_events to service_role;

create or replace function public.protect_invoice_admin_closure_event()
returns trigger language plpgsql set search_path=pg_catalog,public as $func$
begin
 raise exception 'Administrative fakturahendelser er låst og kan ikke redigeres eller slettes.';
end;
$func$;
revoke all on function public.protect_invoice_admin_closure_event() from public,anon,authenticated;
drop trigger if exists protect_invoice_admin_closure_event on public.invoice_admin_closure_events;
create trigger protect_invoice_admin_closure_event before update or delete on public.invoice_admin_closure_events
 for each row execute function public.protect_invoice_admin_closure_event();

create or replace function public.set_invoice_admin_closure(
 p_invoice_id uuid,p_request_id uuid,p_action text,p_reason text,
 p_expected_paid_ore bigint,p_expected_credited_ore bigint,
 p_expected_outstanding_ore bigint,p_actor_id uuid
)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $func$
declare
 inv public.invoice_drafts%rowtype;
 current_row public.invoice_admin_closures%rowtype;
 old_event public.invoice_admin_closure_events%rowtype;
 reason text;
 gross bigint;
 ledger_paid bigint;
 credit_issued bigint;
 vipps_net bigint;
 vipps_in_ledger bigint;
 active_vipps integer;
 bad_refunds integer;
 outstanding bigint;
begin
 if p_invoice_id is null or p_request_id is null or p_actor_id is null
  or p_action is null or p_action not in ('close','reopen') then
  raise exception 'Ugyldig faktura, handling eller forespørsel.';
 end if;
 reason=btrim(coalesce(p_reason,''));
 if length(reason)<5 or length(reason)>500 then
  raise exception 'Oppgi en kort begrunnelse (5-500 tegn).';
 end if;
 -- All manual financial RPCs lock the same invoice parent row. Concurrency
 -- is serialized before account balances and the admin state are compared.
 select * into inv from public.invoice_drafts where id=p_invoice_id for update;
 if not found or inv.status='draft' or inv.invoice_number is null then
  raise exception 'Bare utstedte fakturaer kan avsluttes.';
 end if;
 select * into old_event from public.invoice_admin_closure_events where id=p_request_id;
 if found then
  if old_event.invoice_id<>p_invoice_id or old_event.action<>p_action then
   raise exception 'Denne forespørselen tilhører en annen handling.';
  end if;
  select * into current_row from public.invoice_admin_closures where invoice_id=p_invoice_id;
  return jsonb_build_object('alreadyApplied',true,'closed',current_row.closed_at is not null,
   'closedAt',current_row.closed_at,'revision',current_row.revision);
 end if;
 select * into current_row from public.invoice_admin_closures
  where invoice_id=p_invoice_id for update;

 select coalesce(sum(round((line->>'quantity')::numeric*(line->>'unitPriceOre')::numeric)
   +round(round((line->>'quantity')::numeric*(line->>'unitPriceOre')::numeric)
           *(line->>'vatRate')::numeric/100)),0)::bigint into gross
 from jsonb_array_elements(inv.line_items) line;
 select coalesce(sum(amount_ore),0)::bigint into ledger_paid
 from public.invoice_payments where invoice_id=p_invoice_id and reversed_at is null;
 select coalesce(sum(total_ore),0)::bigint into credit_issued
 from public.invoice_credit_notes where invoice_id=p_invoice_id;
 select coalesce(sum(captured_ore-refunded_ore),0)::bigint,
        count(*) filter(where state in ('pending','authorized'))::integer,
        count(*) filter(where refunded_ore>captured_ore)::integer
  into vipps_net,active_vipps,bad_refunds
 from public.invoice_vipps_payments where invoice_id=p_invoice_id;
 select coalesce(sum(amount_ore),0)::bigint into vipps_in_ledger
 from public.invoice_payments where invoice_id=p_invoice_id and reversed_at is null
  and vipps_reference is not null;
 outstanding=greatest(0,gross-credit_issued-ledger_paid);

 if p_action='close' then
  if ledger_paid<>inv.paid_ore or credit_issued<>inv.credited_ore
   or gross<credit_issued+ledger_paid or bad_refunds>0
   or vipps_net<>vipps_in_ledger then
   raise exception 'Betalinger eller kreditnotaer stemmer ikke. Kontroller før avslutning.';
  end if;
  if inv.paid_ore is distinct from p_expected_paid_ore
   or inv.credited_ore is distinct from p_expected_credited_ore
   or outstanding is distinct from p_expected_outstanding_ore then
   raise exception 'Saldoen er oppdatert. Hent fakturaen på nytt før du avslutter.';
  end if;
  if current_row.closed_at is not null then raise exception 'Fakturaen er allerede avsluttet.'; end if;
  if gross<=0 or outstanding<>0 or active_vipps>0 then
   raise exception 'Fakturaen kan bare avsluttes ved fullt oppgjør og uten åpne Vipps-betalinger.';
  end if;
  insert into public.invoice_admin_closures(invoice_id,closed_at,closed_by,close_note,revision)
  values(p_invoice_id,now(),p_actor_id,reason,1)
  on conflict(invoice_id) do update
   set closed_at=excluded.closed_at,closed_by=excluded.closed_by,
       close_note=excluded.close_note,last_changed_at=now(),
       revision=invoice_admin_closures.revision+1
  returning * into current_row;
 else
  if current_row.closed_at is null then raise exception 'Fakturaen er ikke avsluttet.'; end if;
  update public.invoice_admin_closures
   set closed_at=null,closed_by=null,close_note=null,last_changed_at=now(),
       revision=revision+1
  where invoice_id=p_invoice_id returning * into current_row;
 end if;
 insert into public.invoice_admin_closure_events(
  id,invoice_id,action,actor_id,note,paid_ore,credited_ore,outstanding_ore
 ) values(
  p_request_id,p_invoice_id,p_action,p_actor_id,reason,ledger_paid,credit_issued,outstanding
 );
 return jsonb_build_object('alreadyApplied',false,'closed',current_row.closed_at is not null,
  'closedAt',current_row.closed_at,'revision',current_row.revision);
end;
$func$;
revoke all on function public.set_invoice_admin_closure(uuid,uuid,text,text,bigint,bigint,bigint,uuid)
 from public,anon,authenticated;
grant execute on function public.set_invoice_admin_closure(uuid,uuid,text,text,bigint,bigint,bigint,uuid)
 to service_role;

-- A later financial adjustment reopens an administrative close and leaves an
-- append-only explanatory event. Original invoice details remain untouched.
create or replace function public.reopen_invoice_after_ledger_change()
returns trigger language plpgsql set search_path=pg_catalog,public as $func$
declare row_state public.invoice_admin_closures%rowtype;
 gross bigint;
 outstanding bigint;
 msg text='Automatisk gjenåpnet fordi innbetalt eller kreditert beløp ble endret.';
begin
 if new.paid_ore is not distinct from old.paid_ore and
    new.credited_ore is not distinct from old.credited_ore then return new; end if;
 update public.invoice_admin_closures set
  closed_at=null,closed_by=null,close_note=null,last_changed_at=now(),revision=revision+1
 where invoice_id=new.id and closed_at is not null returning * into row_state;
 if not found then return new; end if;
 select coalesce(sum(round((line->>'quantity')::numeric*(line->>'unitPriceOre')::numeric)
  +round(round((line->>'quantity')::numeric*(line->>'unitPriceOre')::numeric)
   *(line->>'vatRate')::numeric/100)),0)::bigint into gross
 from jsonb_array_elements(new.line_items) line;
 outstanding=greatest(0,gross-new.credited_ore-new.paid_ore);
 insert into public.invoice_admin_closure_events(id,invoice_id,action,actor_id,note,
   paid_ore,credited_ore,outstanding_ore)
 values(gen_random_uuid(),new.id,'automatic_reopen',null,msg,
   new.paid_ore,new.credited_ore,outstanding);
 return new;
end;
$func$;
revoke all on function public.reopen_invoice_after_ledger_change() from public,anon,authenticated;
drop trigger if exists reopen_invoice_after_ledger_change on public.invoice_drafts;
create trigger reopen_invoice_after_ledger_change
 after update of paid_ore,credited_ore on public.invoice_drafts for each row
 execute function public.reopen_invoice_after_ledger_change();

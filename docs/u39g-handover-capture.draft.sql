-- Draft only. Conservative exclusive unit assignment until explicit inspected release.
begin;
create table public.rental_group_handover_reports(
 id uuid primary key, group_id uuid not null unique references public.rental_order_groups(id),
 actor_id uuid not null, note text not null check(length(note)<=2000),
 report_digest text not null check(report_digest ~ '^[0-9a-f]{64}$'),
 created_at timestamptz not null default clock_timestamp()
);
create table public.rental_group_unit_assignments(
 booking_id uuid primary key references public.rental_bookings(id),
 report_id uuid not null references public.rental_group_handover_reports(id),
 unit_id uuid not null references public.rental_equipment_units(id),
 released_at timestamptz,
 release_digest text check(release_digest ~ '^[0-9a-f]{64}$'),
 check((released_at is null)=(release_digest is null))
);
create unique index rental_group_unit_active_unique on public.rental_group_unit_assignments(unit_id) where released_at is null;
create table public.rental_group_capture_requests(
 group_id uuid primary key references public.rental_order_groups(id),
 report_id uuid not null unique references public.rental_group_handover_reports(id),
 psp_reference text not null unique check(length(trim(psp_reference)) between 1 and 200),
 amount_ore integer not null check(amount_ore>=100),
 actor_id uuid not null, created_at timestamptz not null default clock_timestamp()
);
alter table public.rental_group_handover_reports enable row level security;
alter table public.rental_group_unit_assignments enable row level security;
alter table public.rental_group_capture_requests enable row level security;
revoke all on public.rental_group_handover_reports,public.rental_group_unit_assignments,public.rental_group_capture_requests from public,anon,authenticated,service_role;
-- Record only manually checked bank/deposit evidence; no provider collection.
create function public.draft_group_handover_deposit(p_group uuid,p_reference text,p_amount integer,p_proof text,p_actor uuid)
returns text language plpgsql security invoker set search_path=pg_catalog,public as $$
declare g public.rental_order_groups%rowtype; d public.rental_group_deposit_receipts%rowtype;
begin
 select * into g from public.rental_order_groups where id=p_group for update;
 if not found or g.status not in ('payment_pending','confirmed') or p_actor is null or p_amount is null or p_amount<=0 or p_amount is distinct from g.deposit_ore or p_reference is null or length(trim(p_reference)) not between 1 and 200 or p_reference=g.payment_reference or p_proof is null or p_proof !~ '^[0-9a-f]{64}$' then return 'review'; end if;
 select * into d from public.rental_group_deposit_receipts where group_id=p_group;
 if found then if d.reference=p_reference and d.amount_ore=p_amount and d.proof_digest=p_proof then return 'existing'; end if; return 'review'; end if;
 insert into public.rental_group_deposit_receipts(group_id,reference,amount_ore,proof_digest,recorded_by) values(p_group,p_reference,p_amount,p_proof,p_actor);
 return 'recorded';
end $$;
revoke all on function public.draft_group_handover_deposit(uuid,text,integer,text,uuid) from public,anon,authenticated,service_role;
create function public.draft_group_prepare_handover(p_group uuid,p_report uuid,p_actor uuid,p_note text,p_digest text,p_units jsonb,p_identity boolean,p_condition boolean,p_instructions boolean)
returns text language plpgsql security invoker set search_path=pg_catalog,public as $$
declare g public.rental_order_groups%rowtype; c public.rental_group_payment_claims%rowtype; old public.rental_group_handover_reports%rowtype; r record; n integer; today date:=(clock_timestamp() at time zone 'Europe/Oslo')::date;
begin
 select * into g from public.rental_order_groups where id=p_group for update;
 if not found or g.status not in ('payment_pending','confirmed') or p_report is null or p_actor is null or p_note is null or length(p_note)>2000 or p_digest is null or p_digest !~ '^[0-9a-f]{64}$' or p_identity is distinct from true or p_condition is distinct from true or p_instructions is distinct from true or jsonb_typeof(p_units) is distinct from 'array' then return 'review'; end if;
 select * into c from public.rental_group_payment_claims where group_id=g.id;
 if not found or c.reference is distinct from g.payment_reference or not public.draft_group_payment_binding(g.id,c.agreement_id,c.document_digest,c.evidence_seal) then return 'review'; end if;
 if g.deposit_ore>0 and not exists(select 1 from public.rental_group_deposit_receipts where group_id=g.id and amount_ore=g.deposit_ore) then return 'review'; end if;
 select * into old from public.rental_group_handover_reports where group_id=g.id;
 if found then
  if old.id=p_report and old.actor_id=p_actor and old.note=p_note and old.report_digest=p_digest and not exists(
   (select booking_id,unit_id from public.rental_group_unit_assignments where report_id=old.id except select (x->>'bookingId')::uuid,(x->>'unitId')::uuid from jsonb_array_elements(p_units) x)
   union all (select (x->>'bookingId')::uuid,(x->>'unitId')::uuid from jsonb_array_elements(p_units) x except select booking_id,unit_id from public.rental_group_unit_assignments where report_id=old.id)
  ) then return 'existing'; end if; return 'review';
 end if;
 select count(*) into n from public.rental_bookings where group_id=g.id;
 if n<1 or n<>jsonb_array_length(p_units) or n<>(select count(distinct x->>'bookingId') from jsonb_array_elements(p_units) x) or n<>(select count(distinct x->>'unitId') from jsonb_array_elements(p_units) x) then return 'review'; end if;
 for r in select distinct rental_item_id from public.rental_bookings where group_id=g.id order by rental_item_id loop perform pg_advisory_xact_lock(hashtext(r.rental_item_id::text)); end loop;
 for r in select (x->>'bookingId')::uuid booking_id,(x->>'unitId')::uuid unit_id from jsonb_array_elements(p_units) x order by (x->>'unitId')::uuid loop
  perform 1 from public.rental_equipment_units where id=r.unit_id for update;
  if not found or not exists(select 1 from public.rental_bookings b join public.rental_equipment_units u on u.rental_item_id=b.rental_item_id where b.id=r.booking_id and b.group_id=g.id and b.status=case when g.status='confirmed' then 'confirmed' else 'new' end and b.start_date<=today and b.end_date>=today and u.id=r.unit_id) or exists(select 1 from public.rental_group_unit_assignments where unit_id=r.unit_id and released_at is null) then return 'review'; end if;
  if not exists(select 1 from (select condition,next_due_on from public.rental_unit_maintenance_events where unit_id=r.unit_id order by performed_on desc,created_at desc,id desc limit 1) m where m.condition='ok' and (m.next_due_on is null or m.next_due_on>=today)) then return 'review'; end if;
 end loop;
 insert into public.rental_group_handover_reports(id,group_id,actor_id,note,report_digest) values(p_report,g.id,p_actor,p_note,p_digest);
 insert into public.rental_group_unit_assignments(booking_id,report_id,unit_id) select (x->>'bookingId')::uuid,p_report,(x->>'unitId')::uuid from jsonb_array_elements(p_units) x;
 return 'prepared';
end $$;
revoke all on function public.draft_group_prepare_handover(uuid,uuid,uuid,text,text,jsonb,boolean,boolean,boolean) from public,anon,authenticated,service_role;
-- Trusted server calls only after fresh authenticated provider GET confirms full authorization.
create function public.draft_group_capture_claim(p_group uuid,p_report uuid,p_actor uuid,p_psp text,p_amount integer)
returns text language plpgsql security invoker set search_path=pg_catalog,public as $$
declare g public.rental_order_groups%rowtype; c public.rental_group_payment_claims%rowtype; r public.rental_group_capture_requests%rowtype;
begin
 select * into g from public.rental_order_groups where id=p_group for update;
 if not found or g.status<>'payment_pending' or p_actor is null or p_psp is null or length(trim(p_psp)) not between 1 and 200 or p_amount is distinct from g.payable_ore then return 'review'; end if;
 select * into c from public.rental_group_payment_claims where group_id=g.id;
 if not found or c.reference is distinct from g.payment_reference or c.amount_ore is distinct from p_amount or c.captured_at is not null or not public.draft_group_payment_binding(g.id,c.agreement_id,c.document_digest,c.evidence_seal) then return 'review'; end if;
 if not exists(select 1 from public.rental_group_handover_reports where id=p_report and group_id=g.id) or (g.deposit_ore>0 and not exists(select 1 from public.rental_group_deposit_receipts where group_id=g.id and amount_ore=g.deposit_ore)) then return 'review'; end if;
 if exists(select 1 from public.rental_group_unit_assignments a where a.report_id=p_report and not exists(select 1 from (select condition,next_due_on from public.rental_unit_maintenance_events where unit_id=a.unit_id order by performed_on desc,created_at desc,id desc limit 1) m where m.condition='ok' and (m.next_due_on is null or m.next_due_on>=(clock_timestamp() at time zone 'Europe/Oslo')::date))) then return 'review'; end if;
 select * into r from public.rental_group_capture_requests where group_id=g.id;
 if found then if r.report_id=p_report and r.psp_reference=p_psp and r.amount_ore=p_amount then return 'existing'; end if;return 'review';end if;
 insert into public.rental_group_capture_requests(group_id,report_id,psp_reference,amount_ore,actor_id) values(g.id,p_report,p_psp,p_amount,p_actor);
 return 'claimed';
end $$;
revoke all on function public.draft_group_capture_claim(uuid,uuid,uuid,text,integer) from public,anon,authenticated,service_role;
-- No legacy fulfillment grant. This wrapper requires actual stored report and deposit.
create function public.draft_group_verified_handover(p_group uuid,p_report uuid,p_reference text,p_psp text)
returns text language plpgsql security invoker set search_path=pg_catalog,public as $$
declare g public.rental_order_groups%rowtype;
begin
 select * into g from public.rental_order_groups where id=p_group for update;
 if not found or not exists(select 1 from public.rental_group_handover_reports where id=p_report and group_id=g.id) or (g.deposit_ore>0 and not exists(select 1 from public.rental_group_deposit_receipts where group_id=g.id and amount_ore=g.deposit_ore)) then return 'review';end if;
 if g.status='fulfilled' then return public.draft_group_fulfill(g.id,p_reference,p_psp,p_report,g.deposit_ore); end if;
 if (select count(*) from public.rental_group_unit_assignments where report_id=p_report and released_at is null)<>(select count(*) from public.rental_bookings where group_id=g.id) then return 'review';end if;
 return public.draft_group_fulfill(g.id,p_reference,p_psp,p_report,g.deposit_ore);
end $$;
revoke all on function public.draft_group_verified_handover(uuid,uuid,text,text) from public,anon,authenticated,service_role;
rollback;
),
 check((released_at is null)=(release_digest is null))
);
create table public.rental_group_capture_requests(
 group_id uuid primary key references public.rental_order_groups(id),
 report_id uuid not null unique references public.rental_group_handover_reports(id),
 psp_reference text not null unique check(length(trim(psp_reference)) between 1 and 200),
 amount_ore integer not null check(amount_ore>=100),
 actor_id uuid not null, created_at timestamptz not null default clock_timestamp()
);
alter table public.rental_group_handover_reports enable row level security;
alter table public.rental_group_unit_assignments enable row level security;
alter table public.rental_group_capture_requests enable row level security;
revoke all on public.rental_group_handover_reports,public.rental_group_unit_assignments,public.rental_group_capture_requests from public,anon,authenticated,service_role;
-- Record only manually checked bank/deposit evidence; no provider collection.
create function public.draft_group_handover_deposit(p_group uuid,p_reference text,p_amount integer,p_proof text,p_actor uuid)
returns text language plpgsql security invoker set search_path=pg_catalog,public as $$
declare g public.rental_order_groups%rowtype; d public.rental_group_deposit_receipts%rowtype;
begin
 select * into g from public.rental_order_groups where id=p_group for update;
 if not found or g.status not in ('payment_pending','confirmed') or p_actor is null or p_amount is null or p_amount<=0 or p_amount is distinct from g.deposit_ore or p_reference is null or length(trim(p_reference)) not between 1 and 200 or p_reference=g.payment_reference or p_proof is null or p_proof !~ '^[0-9a-f]{64}$' then return 'review'; end if;
 select * into d from public.rental_group_deposit_receipts where group_id=p_group;
 if found then if d.reference=p_reference and d.amount_ore=p_amount and d.proof_digest=p_proof then return 'existing'; end if; return 'review'; end if;
 insert into public.rental_group_deposit_receipts(group_id,reference,amount_ore,proof_digest,recorded_by) values(p_group,p_reference,p_amount,p_proof,p_actor);
 return 'recorded';
end $$;
revoke all on function public.draft_group_handover_deposit(uuid,text,integer,text,uuid) from public,anon,authenticated,service_role;
create function public.draft_group_prepare_handover(p_group uuid,p_report uuid,p_actor uuid,p_note text,p_digest text,p_units jsonb,p_identity boolean,p_condition boolean,p_instructions boolean)
returns text language plpgsql security invoker set search_path=pg_catalog,public as $$
declare g public.rental_order_groups%rowtype; c public.rental_group_payment_claims%rowtype; old public.rental_group_handover_reports%rowtype; r record; n integer; today date:=(clock_timestamp() at time zone 'Europe/Oslo')::date;
begin
 select * into g from public.rental_order_groups where id=p_group for update;
 if not found or g.status not in ('payment_pending','confirmed') or p_report is null or p_actor is null or p_note is null or length(p_note)>2000 or p_digest is null or p_digest !~ '^[0-9a-f]{64}$' or p_identity is distinct from true or p_condition is distinct from true or p_instructions is distinct from true or jsonb_typeof(p_units) is distinct from 'array' then return 'review'; end if;
 select * into c from public.rental_group_payment_claims where group_id=g.id;
 if not found or c.reference is distinct from g.payment_reference or not public.draft_group_payment_binding(g.id,c.agreement_id,c.document_digest,c.evidence_seal) then return 'review'; end if;
 if g.deposit_ore>0 and not exists(select 1 from public.rental_group_deposit_receipts where group_id=g.id and amount_ore=g.deposit_ore) then return 'review'; end if;
 select * into old from public.rental_group_handover_reports where group_id=g.id;
 if found then
  if old.id=p_report and old.actor_id=p_actor and old.note=p_note and old.report_digest=p_digest and not exists(
   (select booking_id,unit_id from public.rental_group_unit_assignments where report_id=old.id except select (x->>'bookingId')::uuid,(x->>'unitId')::uuid from jsonb_array_elements(p_units) x)
   union all (select (x->>'bookingId')::uuid,(x->>'unitId')::uuid from jsonb_array_elements(p_units) x except select booking_id,unit_id from public.rental_group_unit_assignments where report_id=old.id)
  ) then return 'existing'; end if; return 'review';
 end if;
 select count(*) into n from public.rental_bookings where group_id=g.id;
 if n<1 or n<>jsonb_array_length(p_units) or n<>(select count(distinct x->>'bookingId') from jsonb_array_elements(p_units) x) or n<>(select count(distinct x->>'unitId') from jsonb_array_elements(p_units) x) then return 'review'; end if;
 for r in select distinct rental_item_id from public.rental_bookings where group_id=g.id order by rental_item_id loop perform pg_advisory_xact_lock(hashtext(r.rental_item_id::text)); end loop;
 for r in select (x->>'bookingId')::uuid booking_id,(x->>'unitId')::uuid unit_id from jsonb_array_elements(p_units) x order by (x->>'unitId')::uuid loop
  perform 1 from public.rental_equipment_units where id=r.unit_id for update;
  if not found or not exists(select 1 from public.rental_bookings b join public.rental_equipment_units u on u.rental_item_id=b.rental_item_id where b.id=r.booking_id and b.group_id=g.id and b.status=case when g.status='confirmed' then 'confirmed' else 'new' end and b.start_date<=today and b.end_date>=today and u.id=r.unit_id) or exists(select 1 from public.rental_group_unit_assignments where unit_id=r.unit_id) then return 'review'; end if;
  if not exists(select 1 from (select condition,next_due_on from public.rental_unit_maintenance_events where unit_id=r.unit_id order by performed_on desc,created_at desc,id desc limit 1) m where m.condition='ok' and (m.next_due_on is null or m.next_due_on>=today)) then return 'review'; end if;
 end loop;
 insert into public.rental_group_handover_reports(id,group_id,actor_id,note,report_digest) values(p_report,g.id,p_actor,p_note,p_digest);
 insert into public.rental_group_unit_assignments(booking_id,report_id,unit_id) select (x->>'bookingId')::uuid,p_report,(x->>'unitId')::uuid from jsonb_array_elements(p_units) x;
 return 'prepared';
end $$;
revoke all on function public.draft_group_prepare_handover(uuid,uuid,uuid,text,text,jsonb,boolean,boolean,boolean) from public,anon,authenticated,service_role;
-- Trusted server calls only after fresh authenticated provider GET confirms full authorization.
create function public.draft_group_capture_claim(p_group uuid,p_report uuid,p_actor uuid,p_psp text,p_amount integer)
returns text language plpgsql security invoker set search_path=pg_catalog,public as $$
declare g public.rental_order_groups%rowtype; c public.rental_group_payment_claims%rowtype; r public.rental_group_capture_requests%rowtype;
begin
 select * into g from public.rental_order_groups where id=p_group for update;
 if not found or g.status<>'payment_pending' or p_actor is null or p_psp is null or length(trim(p_psp)) not between 1 and 200 or p_amount is distinct from g.payable_ore then return 'review'; end if;
 select * into c from public.rental_group_payment_claims where group_id=g.id;
 if not found or c.reference is distinct from g.payment_reference or c.amount_ore is distinct from p_amount or c.captured_at is not null or not public.draft_group_payment_binding(g.id,c.agreement_id,c.document_digest,c.evidence_seal) then return 'review'; end if;
 if not exists(select 1 from public.rental_group_handover_reports where id=p_report and group_id=g.id) or (g.deposit_ore>0 and not exists(select 1 from public.rental_group_deposit_receipts where group_id=g.id and amount_ore=g.deposit_ore)) then return 'review'; end if;
 if exists(select 1 from public.rental_group_unit_assignments a where a.report_id=p_report and not exists(select 1 from (select condition,next_due_on from public.rental_unit_maintenance_events where unit_id=a.unit_id order by performed_on desc,created_at desc,id desc limit 1) m where m.condition='ok' and (m.next_due_on is null or m.next_due_on>=(clock_timestamp() at time zone 'Europe/Oslo')::date))) then return 'review'; end if;
 select * into r from public.rental_group_capture_requests where group_id=g.id;
 if found then if r.report_id=p_report and r.psp_reference=p_psp and r.amount_ore=p_amount then return 'existing'; end if;return 'review';end if;
 insert into public.rental_group_capture_requests(group_id,report_id,psp_reference,amount_ore,actor_id) values(g.id,p_report,p_psp,p_amount,p_actor);
 return 'claimed';
end $$;
revoke all on function public.draft_group_capture_claim(uuid,uuid,uuid,text,integer) from public,anon,authenticated,service_role;
-- No legacy fulfillment grant. This wrapper requires actual stored report and deposit.
create function public.draft_group_verified_handover(p_group uuid,p_report uuid,p_reference text,p_psp text)
returns text language plpgsql security invoker set search_path=pg_catalog,public as $$
declare g public.rental_order_groups%rowtype;
begin
 select * into g from public.rental_order_groups where id=p_group for update;
 if not found or not exists(select 1 from public.rental_group_handover_reports where id=p_report and group_id=g.id) or (g.deposit_ore>0 and not exists(select 1 from public.rental_group_deposit_receipts where group_id=g.id and amount_ore=g.deposit_ore)) then return 'review';end if;
 if (select count(*) from public.rental_group_unit_assignments where report_id=p_report)<>(select count(*) from public.rental_bookings where group_id=g.id) then return 'review';end if;
 return public.draft_group_fulfill(g.id,p_reference,p_psp,p_report,g.deposit_ore);
end $$;
revoke all on function public.draft_group_verified_handover(uuid,uuid,text,text) from public,anon,authenticated,service_role;
rollback;

-- Isolated draft. Return is independent of financial settlement.
begin;
-- Serialize maintenance writes with assignment/release checks on the same unit.
create function public.draft_unit_maintenance_lock()
returns trigger language plpgsql security invoker set search_path=pg_catalog,public as $$
begin
 perform pg_advisory_xact_lock(hashtextextended(new.unit_id::text,4020));
 return new;
end $$;
revoke all on function public.draft_unit_maintenance_lock() from public,anon,authenticated,service_role;
create trigger draft_unit_maintenance_before_insert before insert on public.rental_unit_maintenance_events for each row execute function public.draft_unit_maintenance_lock();
create function public.draft_group_unit_receive(p_group uuid,p_booking uuid,p_unit uuid,p_receipt uuid,p_actor uuid,p_condition text,p_note text,p_digest text)
returns text language plpgsql security invoker set search_path=pg_catalog,public as $$
declare g public.rental_order_groups%rowtype; b public.rental_bookings%rowtype; a public.rental_group_unit_assignments%rowtype; result text; safe boolean;
begin
 select * into g from public.rental_order_groups where id=p_group for update;
 if not found or g.status<>'fulfilled' then return 'review'; end if;
 select * into b from public.rental_bookings where id=p_booking and group_id=g.id;
 if not found then return 'review'; end if;
 perform pg_advisory_xact_lock(hashtext(b.rental_item_id::text));
 select a0.* into a from public.rental_group_unit_assignments a0 join public.rental_group_handover_reports h on h.id=a0.report_id where a0.booking_id=b.id and h.group_id=g.id and a0.unit_id=p_unit;
 if not found then return 'review'; end if;
 perform pg_advisory_xact_lock(hashtextextended(a.unit_id::text,4020));
 perform 1 from public.rental_equipment_units where id=a.unit_id;
 if not found then return 'review'; end if;
 -- Physical receipt never depends on payment, signature, or maintenance status.
 -- For a clean return require a current safe maintenance record before release.
 safe:=exists(select 1 from (select condition,next_due_on,performed_on from public.rental_unit_maintenance_events where unit_id=a.unit_id order by performed_on desc,created_at desc,id desc limit 1) m where m.condition='ok' and m.performed_on<=(clock_timestamp() at time zone 'Europe/Oslo')::date and (m.next_due_on is null or m.next_due_on>=(clock_timestamp() at time zone 'Europe/Oslo')::date));
 result:=public.draft_group_receive_return(g.id,b.id,p_receipt,p_actor,p_condition,p_note,p_digest);
 if result not in ('received','existing') then return result; end if;
 if p_condition='ok' and a.released_at is null then
  if not safe or result='existing' then
   -- Preserve the submitted receipt and digest. Keep the booking active until new inspection.
   update public.rental_bookings set status='active',updated_at=clock_timestamp() where id=b.id and status='returned';
   return 'received_inspection_required';
  end if;
  update public.rental_group_unit_assignments set released_at=clock_timestamp(),release_digest=p_digest where booking_id=b.id and released_at is null;
 end if;
 return result;
end $$;
revoke all on function public.draft_group_unit_receive(uuid,uuid,uuid,uuid,uuid,text,text,text) from public,anon,authenticated,service_role;
-- Repair/inspection must be recorded AFTER receipt and match the actual unit.
create function public.draft_group_unit_release_after_inspection(p_group uuid,p_booking uuid,p_unit uuid,p_actor uuid,p_event uuid,p_proof text)
returns text language plpgsql security invoker set search_path=pg_catalog,public as $$
declare g public.rental_order_groups%rowtype; b public.rental_bookings%rowtype; a public.rental_group_unit_assignments%rowtype; r public.rental_group_returns%rowtype; result text;
begin
 select * into g from public.rental_order_groups where id=p_group for update;
 if not found or g.status<>'fulfilled' or p_actor is null or p_proof is null or p_proof !~ '^[a-f0-9]{64}$' then return 'review'; end if;
 select * into b from public.rental_bookings where id=p_booking and group_id=g.id;
 if not found then return 'review'; end if;
 perform pg_advisory_xact_lock(hashtext(b.rental_item_id::text));
 select a0.* into a from public.rental_group_unit_assignments a0 join public.rental_group_handover_reports h on h.id=a0.report_id where a0.booking_id=b.id and h.group_id=g.id and a0.unit_id=p_unit;
 if not found then return 'review'; end if;
 select * into r from public.rental_group_returns where booking_id=b.id and group_id=g.id;
 if not found then return 'review'; end if;
 if a.released_at is not null then
  if a.release_digest=p_proof and exists(select 1 from public.rental_group_inspection_resolutions where booking_id=b.id and actor_id=p_actor and proof_digest=p_proof) then return 'existing'; end if;
  return 'review';
 end if;
 perform pg_advisory_xact_lock(hashtextextended(a.unit_id::text,4020));
 perform 1 from public.rental_equipment_units where id=a.unit_id;
 if not exists(select 1 from (select id,kind,condition,created_at,performed_on,next_due_on from public.rental_unit_maintenance_events where unit_id=a.unit_id order by performed_on desc,created_at desc,id desc limit 1) m where m.id=p_event and m.kind in ('inspection','service','repair') and m.condition='ok' and m.created_at>=r.received_at and m.performed_on>=(r.received_at at time zone 'Europe/Oslo')::date and m.performed_on<=(clock_timestamp() at time zone 'Europe/Oslo')::date and (m.next_due_on is null or m.next_due_on>=(clock_timestamp() at time zone 'Europe/Oslo')::date)) then return 'inspection_required'; end if;
 result:=public.draft_group_inspection_resolve(g.id,b.id,p_actor,p_proof);
 if result not in ('resolved','existing') then return result; end if;
 update public.rental_group_unit_assignments set released_at=clock_timestamp(),release_digest=p_proof where booking_id=b.id and released_at is null;
 return result;
end $$;
revoke all on function public.draft_group_unit_release_after_inspection(uuid,uuid,uuid,uuid,uuid,text) from public,anon,authenticated,service_role;
-- Full refund automatically proposed only for clean returns; no waiver of damage.
create function public.draft_group_clean_refund_plan(p_group uuid,p_request uuid,p_actor uuid,p_review text)
returns text language plpgsql security invoker set search_path=pg_catalog,public as $$
declare g public.rental_order_groups%rowtype;
begin
 select * into g from public.rental_order_groups where id=p_group for update;
 if not found or g.status<>'fulfilled' then return 'review'; end if;
 if not exists(select 1 from public.rental_bookings where group_id=g.id) or exists(
 select 1 from public.rental_bookings b left join public.rental_group_returns r on r.booking_id=b.id and r.group_id=g.id left join public.rental_group_unit_assignments a on a.booking_id=b.id
 where b.group_id=g.id and (b.status<>'returned' or r.condition is distinct from 'ok' or a.released_at is null)
 ) or exists(select 1 from public.rental_group_damage_claims where group_id=g.id) then return 'review';end if;
 return public.draft_group_return_plan(g.id,p_request,p_actor,g.deposit_ore,0,p_review);
end $$;
revoke all on function public.draft_group_clean_refund_plan(uuid,uuid,uuid,text) from public,anon,authenticated,service_role;
-- External bank transfer attestation, not a Vipps refund. Keep deposit separate.
create function public.draft_group_record_deposit_refund(p_group uuid,p_request uuid,p_actor uuid,p_amount integer,p_reference text,p_proof text)
returns text language plpgsql security invoker set search_path=pg_catalog,public as $$
declare g public.rental_order_groups%rowtype;
begin
 select * into g from public.rental_order_groups where id=p_group for update;
 if not found or p_actor is null or p_reference=g.payment_reference or exists(select 1 from public.rental_group_deposit_receipts where reference=p_reference) or exists(select 1 from public.rental_bookings b left join public.rental_group_unit_assignments a on a.booking_id=b.id where b.group_id=g.id and a.released_at is null) then return 'review';end if;
 return public.draft_group_return_close(g.id,p_request,p_amount,p_reference,p_proof);
end $$;
revoke all on function public.draft_group_record_deposit_refund(uuid,uuid,uuid,integer,text,text) from public,anon,authenticated,service_role;
rollback;

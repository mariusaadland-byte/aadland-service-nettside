-- DRAFT ONLY: validate in isolated PostgreSQL staging before deploying.
-- Existing public checkout RPC uses pg_advisory_xact_lock(hashtext(item_id::text)).
-- Manual blocks and new capacity consumption must use that same lock.
-- Do not run on production until concurrency tests, Vipps transitions and existing data are verified.
create or replace function public.rental_guard_manual_block()
returns trigger language plpgsql security invoker set search_path=pg_catalog,public as $$
declare buffer_days integer;
begin
 if tg_op='UPDATE' then
  if new.rental_item_id=old.rental_item_id and new.start_date=old.start_date and new.end_date=old.end_date then return new; end if;
  if new.rental_item_id<>old.rental_item_id then raise exception 'RENTAL_UNAVAILABLE'; end if;
 end if;
 if not pg_try_advisory_xact_lock(hashtext(new.rental_item_id::text)) then raise exception 'RENTAL_CAPACITY_BUSY'; end if;
 select greatest(0,coalesce(i.buffer_days,0)) into buffer_days from public.rental_items i where i.id=new.rental_item_id;
 if not found then raise exception 'RENTAL_UNAVAILABLE'; end if;
 if exists(select 1 from public.rental_bookings b where b.rental_item_id=new.rental_item_id
 and b.status in ('new','confirmed','active')
 and (b.status<>'new' or b.payment_due_at is null or b.payment_due_at>clock_timestamp()
 or b.payment_status is distinct from 'unpaid' or b.payment_reference is not null)
 and b.start_date<=new.end_date+buffer_days and b.end_date>=new.start_date-buffer_days)
 then raise exception 'RENTAL_UNAVAILABLE'; end if;
 return new;
end $$;
revoke all on function public.rental_guard_manual_block() from public,anon,authenticated;
-- No trigger installation until staging signoff.
-- create trigger rental_guard_manual_block before insert or update on public.rental_blocks
-- for each row execute function public.rental_guard_manual_block();

-- A second guard for admin reactivation/date changes and expired payment claims
-- requires reviewing the existing checkout transition trigger ordering and
-- payment-start RPCs. Do not replace the existing checkout reservation function.

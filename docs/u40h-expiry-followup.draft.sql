-- Isolated draft only. No scheduler, grants or provider calls.
begin;
create table public.rental_group_expiry_attempts(
 group_id uuid primary key references public.rental_order_groups(id) on delete restrict,
 checked_at timestamptz not null,
 outcome text not null check(outcome in ('released','review'))
);
alter table public.rental_group_expiry_attempts enable row level security;
revoke all on public.rental_group_expiry_attempts from public,anon,authenticated,service_role;
create function public.draft_group_expiry_candidates()
returns table(group_id uuid)
language sql security invoker set search_path=pg_catalog,public as $$
 select g.id from public.rental_order_groups g
 left join public.rental_group_expiry_attempts a on a.group_id=g.id
 where g.status='held' and g.expires_at<=clock_timestamp()
 and g.payment_reference is null
 and not exists(select 1 from public.rental_group_payment_claims c where c.group_id=g.id)
 and not exists(select 1 from public.rental_group_events e where e.group_id=g.id and e.event='payment_start')
 and (a.checked_at is null or a.checked_at<clock_timestamp()-interval '15 minutes')
 order by g.expires_at,g.id limit 10
$$;
revoke all on function public.draft_group_expiry_candidates() from public,anon,authenticated,service_role;
create function public.draft_group_expiry_attempt(p_group uuid)
returns text language plpgsql security invoker set search_path=pg_catalog,public as $$
declare g public.rental_order_groups%rowtype; result text;
begin
 select * into g from public.rental_order_groups where id=p_group for update skip locked;
 if not found or g.status<>'held' or g.expires_at>clock_timestamp() or g.payment_reference is not null or exists(select 1 from public.rental_group_payment_claims where group_id=g.id) or exists(select 1 from public.rental_group_events where group_id=g.id and event='payment_start') then return 'skipped';end if;
 if exists(select 1 from public.rental_group_expiry_attempts where group_id=g.id and checked_at>=clock_timestamp()-interval '15 minutes') then return 'skipped';end if;
 begin
  if public.draft_group_expire(g.id) then result:='released';else result:='review';end if;
 exception when raise_exception then
  if sqlerrm<>'GROUP_REVIEW_REQUIRED' then raise;end if;
  result:='review';
 end;
 insert into public.rental_group_expiry_attempts(group_id,checked_at,outcome) values(g.id,clock_timestamp(),result)
 on conflict(group_id) do update set checked_at=excluded.checked_at,outcome=excluded.outcome;
 return result;
end $$;
revoke all on function public.draft_group_expiry_attempt(uuid) from public,anon,authenticated,service_role;
-- One statement, no customer data, amount or provider status guessed.
create function public.draft_group_followup_snapshot()
returns jsonb language sql security invoker set search_path=pg_catalog,public as $$
 with candidates as materialized (
  select g.id,g.order_number::text as number,g.status,g.expires_at,g.payable_ore,
  a.checked_at,a.outcome,
  case when g.status='review' then 'review'
   when g.status='payment_pending' or g.payment_reference is not null or exists(select 1 from public.rental_group_payment_claims c where c.group_id=g.id) or exists(select 1 from public.rental_group_events e where e.group_id=g.id and e.event='payment_start') then 'payment_review'
   when a.outcome='review' then 'expiry_review'
   else 'expiry_waiting' end as reason
  from public.rental_order_groups g left join public.rental_group_expiry_attempts a on a.group_id=g.id
  where g.status='review' or (g.status in ('held','payment_pending') and g.expires_at<=statement_timestamp())
 ), first_rows as (
  select * from candidates order by case reason when 'review' then 0 when 'payment_review' then 1 when 'expiry_review' then 2 else 3 end,expires_at,id limit 50
 )
 select jsonb_build_object('total',(select count(*) from candidates),
 'paymentReview',(select count(*) from candidates where reason in ('review','payment_review')),
 'expiryReview',(select count(*) from candidates where reason='expiry_review'),
 'waiting',(select count(*) from candidates where reason='expiry_waiting'),
 'rows',coalesce((select jsonb_agg(to_jsonb(first_rows) order by case reason when 'review' then 0 when 'payment_review' then 1 when 'expiry_review' then 2 else 3 end,expires_at,id) from first_rows),'[]'::jsonb))
$$;
revoke all on function public.draft_group_followup_snapshot() from public,anon,authenticated,service_role;
rollback;

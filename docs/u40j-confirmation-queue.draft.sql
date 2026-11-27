-- Isolated draft only. Never automatically requeue a claimed or review message.
begin;
create function public.draft_group_confirmation_candidates()
returns table(group_id uuid) language sql security invoker set search_path=pg_catalog,public as $$
 select o.group_id from public.rental_group_confirmation_outbox o
 where o.state='pending' order by o.created_at,o.group_id limit 5
$$;
revoke all on function public.draft_group_confirmation_candidates() from public,anon,authenticated,service_role;
create function public.draft_group_confirmation_snapshot()
returns jsonb language sql security invoker set search_path=pg_catalog,public as $$
 with rows as materialized (
 select o.group_id,g.order_number::text as number,o.state,o.created_at,o.claimed_at,
 case when o.state='claimed' and o.claimed_at<statement_timestamp()-interval '10 minutes' then 'stale' else o.state end as display_state
 from public.rental_group_confirmation_outbox o join public.rental_order_groups g on g.id=o.group_id
 ), first_rows as (
 select * from rows where state<>'accepted' order by case display_state when 'review' then 0 when 'stale' then 1 when 'pending' then 2 else 3 end,created_at,group_id limit 50
 )
 select jsonb_build_object('pending',(select count(*) from rows where display_state='pending'),
 'claimed',(select count(*) from rows where display_state='claimed'),
 'stale',(select count(*) from rows where display_state='stale'),
 'review',(select count(*) from rows where display_state='review'),
 'accepted',(select count(*) from rows where display_state='accepted'),
 'rows',coalesce((select jsonb_agg(to_jsonb(first_rows) order by case display_state when 'review' then 0 when 'stale' then 1 when 'pending' then 2 else 3 end,created_at,group_id) from first_rows),'[]'::jsonb))
$$;
revoke all on function public.draft_group_confirmation_snapshot() from public,anon,authenticated,service_role;
rollback;

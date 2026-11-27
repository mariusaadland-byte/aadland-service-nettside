-- Isolated draft only. Confirmation queue is part of the same transaction.
begin;
create table public.rental_group_confirmation_outbox(
 group_id uuid primary key references public.rental_order_groups(id) on delete restrict,
 state text not null default 'pending' check(state in ('pending','claimed','accepted','review')),
 created_at timestamptz not null default clock_timestamp(),
 claimed_at timestamptz, provider_id text unique,
 check((state='pending')=(claimed_at is null)),
 check((state='accepted')=(provider_id is not null))
);
alter table public.rental_group_confirmation_outbox enable row level security;
revoke all on public.rental_group_confirmation_outbox from public,anon,authenticated,service_role;
create function public.draft_group_confirmation_enqueue()
returns trigger language plpgsql security invoker set search_path=pg_catalog,public as $$
begin
 if old.status='payment_pending' and new.status='confirmed' then
  if not exists(select 1 from public.rental_group_payment_claims where group_id=new.id and captured_at is not null and psp_reference is not null and reference=new.payment_reference and amount_ore=new.payable_ore) then raise exception 'GROUP_CONFIRMATION_UNVERIFIED'; end if;
  insert into public.rental_group_confirmation_outbox(group_id) values(new.id);
 end if;
 return new;
end $$;
revoke all on function public.draft_group_confirmation_enqueue() from public,anon,authenticated,service_role;
create trigger draft_group_confirmation_after_update after update of status on public.rental_order_groups for each row execute function public.draft_group_confirmation_enqueue();
create function public.draft_group_confirmation_claim(p_group uuid)
returns boolean language plpgsql security invoker set search_path=pg_catalog,public as $$
begin
 update public.rental_group_confirmation_outbox set state='claimed',claimed_at=clock_timestamp() where group_id=p_group and state='pending';
 return found;
end $$;
revoke all on function public.draft_group_confirmation_claim(uuid) from public,anon,authenticated,service_role;
create function public.draft_group_confirmation_finish(p_group uuid,p_provider text)
returns boolean language plpgsql security invoker set search_path=pg_catalog,public as $$
begin
 if p_provider is not null and length(trim(p_provider)) not between 1 and 200 then return false; end if;
 update public.rental_group_confirmation_outbox set state=case when p_provider is null then 'review' else 'accepted' end,provider_id=p_provider where group_id=p_group and state='claimed';
 return found;
end $$;
revoke all on function public.draft_group_confirmation_finish(uuid,text) from public,anon,authenticated,service_role;
rollback;

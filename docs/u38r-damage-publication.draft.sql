-- Isolated draft only, no runtime grants or storage bucket creation.
begin;
create table public.rental_damage_notice_outbox(
 claim_id uuid primary key references public.rental_group_damage_claims(id) on delete restrict,
 state text not null default 'pending' check(state in ('pending','claimed','accepted','review')),
 created_at timestamptz not null default clock_timestamp(),
 claimed_at timestamptz, provider_id text unique,
 check((state='pending')=(claimed_at is null)),
 check((state='accepted')=(provider_id is not null))
);
alter table public.rental_damage_notice_outbox enable row level security;
revoke all on public.rental_damage_notice_outbox from public,anon,authenticated,service_role;
-- Only called after server checks private object bytes and canonical digest.
-- Claim and outbox row committed atomically; no email sent inside SQL.
create function public.draft_group_damage_publish(p_group uuid,p_booking uuid,p_claim uuid,p_actor uuid,p_description text,p_amount integer,p_photos text[],p_cost text,p_digest text)
returns text language plpgsql security invoker set search_path=pg_catalog,public as $$
declare result text;
begin
 if p_photos is null or p_cost=any(p_photos) or cardinality(p_photos)<>(select count(distinct x) from unnest(p_photos) x) then return 'review'; end if;
 result:=public.draft_group_damage_claim(p_group,p_booking,p_claim,p_actor,p_description,p_amount,p_photos,p_cost,p_digest);
 if result='recorded' then insert into public.rental_damage_notice_outbox(claim_id) values(p_claim); end if;
 if result='existing' and not exists(select 1 from public.rental_damage_notice_outbox where claim_id=p_claim) then return 'review'; end if;
 return result;
end $$;
revoke all on function public.draft_group_damage_publish(uuid,uuid,uuid,uuid,text,integer,text[],text,text) from public,anon,authenticated,service_role;
create function public.draft_damage_notice_claim(p_claim uuid)
returns boolean language plpgsql security invoker set search_path=pg_catalog,public as $$
begin
 update public.rental_damage_notice_outbox set state='claimed',claimed_at=clock_timestamp() where claim_id=p_claim and state='pending';
 return found;
end $$;
revoke all on function public.draft_damage_notice_claim(uuid) from public,anon,authenticated,service_role;
create function public.draft_damage_notice_finish(p_claim uuid,p_provider text)
returns boolean language plpgsql security invoker set search_path=pg_catalog,public as $$
begin
 if p_provider is not null and length(trim(p_provider)) not between 1 and 200 then return false; end if;
 update public.rental_damage_notice_outbox set state=case when p_provider is null then 'review' else 'accepted' end,provider_id=p_provider where claim_id=p_claim and state='claimed';
 return found;
end $$;
revoke all on function public.draft_damage_notice_finish(uuid,text) from public,anon,authenticated,service_role;
rollback;

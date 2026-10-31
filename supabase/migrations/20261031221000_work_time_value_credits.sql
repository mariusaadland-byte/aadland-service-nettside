-- Each agreed value can apply either to one existing order (all its time
-- entries, across months) or to one standalone work-time entry.
-- This is a planning/offset estimate, not an accounting posting or invoice.
create table if not exists public.work_time_value_credits(
 id uuid primary key default gen_random_uuid(),
 admin_user_id uuid not null,
 scope_key text not null,
 agreed_value_ore bigint not null default 0 check(agreed_value_ore between 0 and 100000000000),
 description text not null default '',
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 constraint work_time_value_credits_unique unique(admin_user_id,scope_key),
 constraint work_time_value_credits_scope check(scope_key ~ '^(order|entry):[0-9a-f-]{36}$')
);
alter table public.work_time_value_credits enable row level security;
-- No anon/authenticated grants or policies: server uses existing privileged
-- access only after checking authenticated work-clock access.
revoke all on public.work_time_value_credits from public, anon, authenticated;
create index if not exists work_time_value_credits_admin_idx
 on public.work_time_value_credits(admin_user_id);

-- DRAFT ONLY. Review and test in isolated staging before enabling.
create table public.rental_manual_versions (
 id uuid primary key,
 rental_item_id uuid not null references public.rental_items(id) on delete restrict,
 manufacturer text not null check (char_length(manufacturer) between 1 and 120),
 model text not null check (char_length(model) between 1 and 120),
 manual_url text not null check (char_length(manual_url) between 1 and 1800),
 language text not null check (char_length(language) between 1 and 40),
 safety_note text not null default '' check (char_length(safety_note)<=2000),
 published boolean not null default false,
 created_at timestamptz not null default now()
);
create index rental_manual_versions_item_latest on public.rental_manual_versions(rental_item_id,created_at desc,id desc);
alter table public.rental_manual_versions enable row level security;
revoke all on public.rental_manual_versions from public, anon, authenticated, service_role;
grant select,insert on public.rental_manual_versions to service_role;
-- Latest version governs publication; never fall back to an old published version.
-- No anonymous read grants. Public page reads only allowlisted fields server-side.

create table if not exists public.services (
 id uuid primary key default gen_random_uuid(), title text not null, slug text not null unique,
 description text, image_url text, kind text not null default 'service',
 active boolean not null default true, show_on_home boolean not null default true,
 show_in_menu boolean not null default true, show_in_footer boolean not null default true,
 has_page boolean not null default false, cta_label text not null default 'Les mer', cta_href text,
 form_title text not null default 'Be om befaring', form_prompt text not null default 'Beskriv kort hva du ønsker hjelp med.',
 publish_from timestamptz, publish_until timestamptz, sort_order integer not null default 0,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
alter table public.services enable row level security;
grant select, insert, update, delete on table public.services to service_role;
create index if not exists services_sort_order_idx on public.services(sort_order, created_at);

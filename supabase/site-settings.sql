begin;
create table if not exists public.site_settings (
 id text primary key default 'main',
 hero_eyebrow text not null default 'BYGG · RENOVERING · UTEOMRÅDER · VEDLIKEHOLD',
 hero_title text not null default 'Kvalitet som varer.',
 hero_text text not null default 'Aadland Service leverer solide løsninger innen bygg, oppussing, vedlikehold og uteområder. Vi kombinerer fagkunnskap, nøyaktighet og god oppfølging – tilpasset dine behov.',
 about_title text not null default 'Lokalt håndverk med stolthet.',
 about_text text not null default 'Vi hjelper med oppussing, vedlikehold, uteområder og spesialtilpassede løsninger. Målet er enkelt: ryddig kommunikasjon, praktiske valg og et resultat du kan være fornøyd med.',
 phone text not null default '471 54 898',
 email text not null default 'post@aadland-service.no',
 org_number text not null default '937 781 873 MVA',
 location text not null default 'Bergen og omegn',
 show_services boolean not null default true,
 show_projects boolean not null default true,
 show_about boolean not null default true,
 show_survey boolean not null default true,
 updated_at timestamptz not null default now()
);
insert into public.site_settings(id) values('main') on conflict(id) do nothing;
alter table public.site_settings enable row level security;
grant select,insert,update,delete on public.site_settings to service_role;
commit;

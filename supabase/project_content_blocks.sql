-- Prosjektfortelling: lar bilder og tekst blandes i valgfri rekkefølge.
alter table public.projects
 add column if not exists content_blocks jsonb not null default '[]'::jsonb;

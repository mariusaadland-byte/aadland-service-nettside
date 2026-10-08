-- An offer shares a fixed snapshot, never the editable admin drawing.
-- This table is written only after a real email to the offer's own customer succeeds.
create table if not exists public.quote_drawing_publications(
 id uuid primary key default gen_random_uuid(),
 quote_id uuid not null references public.quotes(id) on delete cascade,
 drawing_id uuid not null references public.project_drawings(id) on delete cascade,
 customer_email text not null,
 name text not null,
 address text not null default '',
 notes text not null default '',
 drawing_data jsonb not null,
 published_at timestamptz not null default now(),
 unique(quote_id,drawing_id)
);
create index if not exists quote_drawing_publications_email_idx
 on public.quote_drawing_publications(lower(customer_email),published_at desc);
create index if not exists quote_drawing_publications_drawing_idx
 on public.quote_drawing_publications(drawing_id);
alter table public.quote_drawing_publications enable row level security;
revoke all on public.quote_drawing_publications from anon,authenticated;
grant all on public.quote_drawing_publications to service_role;

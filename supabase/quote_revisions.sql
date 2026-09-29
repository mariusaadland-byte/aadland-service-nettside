-- Profesjonelle tilbudsrevisjoner.
-- Sendte tilbud beholdes urørt. Ny revisjon får egen rad og eget tilbudsnummer.

alter table public.quotes
  add column if not exists revision_series_id uuid default gen_random_uuid(),
  add column if not exists revision_number integer not null default 1,
  add column if not exists revised_from_id uuid,
  add column if not exists superseded_by_id uuid,
  add column if not exists superseded_at timestamptz;

update public.quotes
set revision_series_id = gen_random_uuid()
where revision_series_id is null;

alter table public.quotes
  alter column revision_series_id set not null;

alter table public.quotes
  drop constraint if exists quotes_revision_number_check;
alter table public.quotes
  add constraint quotes_revision_number_check check (revision_number >= 1);

alter table public.quotes
  drop constraint if exists quotes_revised_from_id_fkey;
alter table public.quotes
  add constraint quotes_revised_from_id_fkey
  foreign key (revised_from_id) references public.quotes(id) on delete set null;

alter table public.quotes
  drop constraint if exists quotes_superseded_by_id_fkey;
alter table public.quotes
  add constraint quotes_superseded_by_id_fkey
  foreign key (superseded_by_id) references public.quotes(id) on delete set null;

alter table public.quotes
  drop constraint if exists quotes_status_check;
alter table public.quotes
  add constraint quotes_status_check check (
    status = any (array['draft','sent','accepted','declined','expired','cancelled','superseded']::text[])
  );

create unique index if not exists quotes_revision_series_number_key
  on public.quotes(revision_series_id, revision_number);
create index if not exists quotes_revised_from_idx on public.quotes(revised_from_id);
create index if not exists quotes_superseded_by_idx on public.quotes(superseded_by_id);

create or replace function public.activate_quote_revision(p_quote_id uuid, p_sent_at timestamptz)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_previous_id uuid;
begin
  select revised_from_id
  into v_previous_id
  from public.quotes
  where id = p_quote_id
  for update;

  if not found then
    raise exception 'quote_not_found';
  end if;

  update public.quotes
  set status = 'sent',
      sent_at = p_sent_at,
      follow_up_sent_at = null,
      updated_at = p_sent_at
  where id = p_quote_id
    and status in ('draft','sent');

  if not found then
    raise exception 'quote_not_sendable';
  end if;

  if v_previous_id is not null then
    update public.quotes
    set status = 'superseded',
        superseded_by_id = p_quote_id,
        superseded_at = p_sent_at,
        auto_follow_up = false,
        updated_at = p_sent_at
    where id = v_previous_id
      and status in ('sent','expired');
  end if;
end;
$$;

revoke all on function public.activate_quote_revision(uuid,timestamptz) from public, anon, authenticated;
grant execute on function public.activate_quote_revision(uuid,timestamptz) to service_role;

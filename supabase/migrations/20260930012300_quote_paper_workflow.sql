-- Papirutlevering og papirgodkjenning for tilbud.

alter table public.quotes
  add column if not exists issued_via text,
  add column if not exists paper_issued_at timestamptz,
  add column if not exists acceptance_method text,
  add column if not exists paper_signed_date date,
  add column if not exists accepted_recorded_by uuid;

alter table public.quotes
  drop constraint if exists quotes_issued_via_check;
alter table public.quotes
  add constraint quotes_issued_via_check
  check (issued_via is null or issued_via in ('email','paper'));

alter table public.quotes
  drop constraint if exists quotes_acceptance_method_check;
alter table public.quotes
  add constraint quotes_acceptance_method_check
  check (acceptance_method is null or acceptance_method in ('digital','paper'));

alter table public.quotes
  drop constraint if exists quotes_accepted_recorded_by_fkey;
alter table public.quotes
  add constraint quotes_accepted_recorded_by_fkey
  foreign key (accepted_recorded_by) references public.admin_users(id) on delete set null;

create index if not exists quotes_paper_issued_idx
  on public.quotes(paper_issued_at)
  where paper_issued_at is not null;

update public.quotes
set issued_via='email'
where sent_at is not null and issued_via is null;

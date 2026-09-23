-- Automatisk oppfølging av sendte tilbud etter ca. 2 døgn.
alter table public.quotes
 add column if not exists auto_follow_up boolean not null default true,
 add column if not exists follow_up_sent_at timestamptz;

create index if not exists quotes_follow_up_due_idx
on public.quotes(sent_at)
where status='sent'
  and archived_at is null
  and auto_follow_up=true
  and follow_up_sent_at is null;

-- Spor utsendt befaringbekreftelse og én automatisk påminnelse.
alter table public.orders
 add column if not exists survey_confirmation_sent_at timestamptz,
 add column if not exists survey_reminder_sent_at timestamptz;

create index if not exists orders_survey_reminder_due_idx
on public.orders(survey_date)
where order_type='custom'
  and status='confirmed'
  and survey_date is not null
  and survey_confirmation_sent_at is not null
  and survey_reminder_sent_at is null
  and archived_at is null;

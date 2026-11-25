set local lock_timeout='3s';
alter table public.service_cron_runs drop constraint service_cron_runs_job_key_check, add constraint service_cron_runs_job_key_check check (job_key in ('invoice-review-alerts','vat-deadline-reminders','survey-reminders','job-reminders','quote-followups','scheduled-invoices','service-order-confirmations','quote-response-confirmations','contact-image-cleanup'));

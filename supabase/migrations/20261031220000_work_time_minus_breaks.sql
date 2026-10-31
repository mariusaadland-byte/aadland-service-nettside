-- Separate deducted breaks from stamped work duration.
-- Existing time totals and original stamps are unchanged by this migration.
alter table public.work_time_entries
 add column if not exists deducted_minutes integer not null default 0;
alter table public.work_time_entries
 drop constraint if exists work_time_entries_deducted_minutes_range;
alter table public.work_time_entries
 add constraint work_time_entries_deducted_minutes_range
 check (deducted_minutes between 0 and 100000);
alter table public.work_time_entries
 add column if not exists lunch_days jsonb not null default '[]'::jsonb;
alter table public.work_time_entries
 drop constraint if exists work_time_entries_lunch_days_array;
alter table public.work_time_entries
 add constraint work_time_entries_lunch_days_array check(jsonb_typeof(lunch_days)='array');

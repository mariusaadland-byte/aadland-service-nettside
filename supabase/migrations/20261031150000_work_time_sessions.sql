-- Preserve individual clock-in/clock-out periods on each existing work entry.
-- Legacy accumulated time without exact stamps must remain as unassigned time.
alter table public.work_time_entries
 add column if not exists work_sessions jsonb not null default '[]'::jsonb;
alter table public.work_time_entries
 drop constraint if exists work_time_entries_work_sessions_array_check;
alter table public.work_time_entries
 add constraint work_time_entries_work_sessions_array_check
 check (jsonb_typeof(work_sessions)='array');

with snapshot as (
 select id, duration_minutes,started_at,ended_at,
  case when started_at is not null and ended_at is not null then
   least(duration_minutes,greatest(1,round(extract(epoch from (ended_at-started_at))/60)::integer))
   else 0 end as last_minutes
 from public.work_time_entries
 where work_sessions='[]'::jsonb and duration_minutes>0
)
update public.work_time_entries e
set work_sessions=(
 case when x.duration_minutes>x.last_minutes then jsonb_build_array(
  jsonb_build_object('startedAt',null,'endedAt',null,'minutes',x.duration_minutes-x.last_minutes,'historical',true))
 else '[]'::jsonb end
) || (
 case when x.last_minutes>0 then jsonb_build_array(
  jsonb_build_object('startedAt',x.started_at,'endedAt',x.ended_at,'minutes',x.last_minutes))
 else '[]'::jsonb end
)
from snapshot x where e.id=x.id;
-- Permissions and RLS stay unchanged: only the existing private service-role
-- work_time_entries access can read and edit the new history.

create schema if not exists private;

revoke all on schema private from public;
revoke all on schema private from anon;
revoke all on schema private from authenticated;

create table if not exists private.app_rate_limits (
  id bigserial primary key,
  bucket_key text not null,
  created_at timestamptz not null default now()
);

alter table private.app_rate_limits enable row level security;

create index if not exists app_rate_limits_bucket_created_idx
  on private.app_rate_limits (bucket_key, created_at desc);

create or replace function public.consume_app_rate_limit(
  bucket_key text,
  max_requests integer,
  window_seconds integer
)
returns jsonb
language plpgsql
security definer
set search_path to pg_catalog, private
as $$
declare
  recent_count integer;
  oldest_recent timestamptz;
  retry_after integer;
begin
  if bucket_key is null or length(bucket_key) < 8 or length(bucket_key) > 200 then
    raise exception 'INVALID_RATE_LIMIT_KEY';
  end if;

  if max_requests < 1 or max_requests > 1000 then
    raise exception 'INVALID_RATE_LIMIT_MAX';
  end if;

  if window_seconds < 1 or window_seconds > 86400 then
    raise exception 'INVALID_RATE_LIMIT_WINDOW';
  end if;

  perform pg_advisory_xact_lock(hashtext(bucket_key));

  select count(*), min(created_at)
    into recent_count, oldest_recent
  from private.app_rate_limits
  where app_rate_limits.bucket_key = consume_app_rate_limit.bucket_key
    and created_at > now() - make_interval(secs => window_seconds);

  if recent_count >= max_requests then
    retry_after := greatest(
      1,
      ceil(extract(epoch from (
        oldest_recent + make_interval(secs => window_seconds) - now()
      )))::integer
    );

    return jsonb_build_object(
      'allowed', false,
      'remaining', 0,
      'retry_after', retry_after
    );
  end if;

  insert into private.app_rate_limits(bucket_key) values (bucket_key);

  if random() < 0.02 then
    delete from private.app_rate_limits
    where created_at < now() - interval '2 days';
  end if;

  return jsonb_build_object(
    'allowed', true,
    'remaining', greatest(0, max_requests - recent_count - 1),
    'retry_after', 0
  );
end;
$$;

revoke all on function public.consume_app_rate_limit(text, integer, integer) from public;
revoke all on function public.consume_app_rate_limit(text, integer, integer) from anon;
revoke all on function public.consume_app_rate_limit(text, integer, integer) from authenticated;
grant execute on function public.consume_app_rate_limit(text, integer, integer) to service_role;

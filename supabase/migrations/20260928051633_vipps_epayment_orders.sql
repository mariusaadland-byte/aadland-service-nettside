create schema if not exists private;

alter table public.orders
  add column if not exists payment_provider text,
  add column if not exists payment_reference text,
  add column if not exists payment_psp_reference text,
  add column if not exists payment_reserved_ore integer not null default 0,
  add column if not exists payment_captured_ore integer not null default 0,
  add column if not exists payment_authorized_at timestamptz,
  add column if not exists payment_captured_at timestamptz,
  add column if not exists payment_cancelled_at timestamptz,
  add column if not exists payment_refunded_at timestamptz,
  add column if not exists payment_refunded_ore integer not null default 0,
  add column if not exists payment_capture_guaranteed_until timestamptz,
  add column if not exists vipps_checkout_started_at timestamptz;

create index if not exists orders_payment_provider_reference_idx
  on public.orders(payment_provider,payment_reference);
create index if not exists orders_payment_status_idx
  on public.orders(payment_status);

create table if not exists private.vipps_payment_events(
  psp_reference text primary key,
  payment_reference text not null,
  event_name text not null,
  amount_ore integer not null default 0,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace function public.record_vipps_payment_event_once(
  event_psp_reference text,
  event_payment_reference text,
  event_name text,
  event_amount_ore integer,
  event_payload jsonb
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, private
as $function$
begin
  insert into private.vipps_payment_events(
    psp_reference,payment_reference,event_name,amount_ore,payload
  ) values (
    event_psp_reference,event_payment_reference,event_name,
    greatest(coalesce(event_amount_ore,0),0),coalesce(event_payload,'{}'::jsonb)
  )
  on conflict (psp_reference) do nothing;
  return found;
end;
$function$;

revoke all on function public.record_vipps_payment_event_once(text,text,text,integer,jsonb) from public,anon,authenticated;
grant execute on function public.record_vipps_payment_event_once(text,text,text,integer,jsonb) to service_role;

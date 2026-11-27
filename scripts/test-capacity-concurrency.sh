#!/usr/bin/env bash
set -euo pipefail
export PGHOST=127.0.0.1 PGPORT=5432 PGDATABASE=aadland_signing_test PGUSER=postgres PGPASSWORD=local_fixture_only
[[ "${CI:-}" == true ]] || exit 1
psql -X -v ON_ERROR_STOP=1 -f scripts/sql/capacity-concurrency-fixture.sql
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
race(){
 local label="$1" kind1="$2" kind2="$3" expected="$4"
 local a="capacity-first-$label" b="capacity-second-$label"
 (PGAPPNAME="$a" psql -X -qAt -v ON_ERROR_STOP=1 -c "begin; select signing_ci.capacity_attempt('$label','a','$kind1'); select pg_sleep(4); commit;" >"$tmp/$label-a") &
 local p1=$! seen=0
 for i in $(seq 1 60); do
  if [[ "$(psql -X -qAt -c "select count(*) from pg_stat_activity where application_name='$a' and wait_event='PgSleep'")" == 1 ]]; then seen=1;break;fi
  sleep 0.05
 done
 if [[ "$seen" != 1 ]]; then wait "$p1";echo "FAIL: first transaction barrier missing";exit 1;fi
 (PGAPPNAME="$b" psql -X -qAt -v ON_ERROR_STOP=1 -c "select signing_ci.capacity_attempt('$label','b','$kind2');" >"$tmp/$label-b") &
 local p2=$! blocked=0
 for i in $(seq 1 40); do
  if [[ "$(psql -X -qAt -c "select count(*) from pg_stat_activity x where x.application_name='$b' and x.wait_event_type='Lock' and exists(select 1 from pg_stat_activity y where y.application_name='$a' and y.pid=any(pg_blocking_pids(x.pid)))")" == 1 ]]; then blocked=1;break;fi
  sleep 0.05
 done
 wait "$p1"
 wait "$p2"
 [[ "$blocked" == 1 ]] || { echo "FAIL: second transaction did not wait for first";exit 1; }
 [[ "$(sed '/^$/d' "$tmp/$label-a")" == "$expected" ]]
 [[ "$(sed '/^$/d' "$tmp/$label-b")" == unavailable ]]
 echo "PASS: $label, actual concurrent lock observed ($expected / unavailable)"
}
race group-group group group reserved
race group-legacy group legacy reserved
race legacy-group legacy group reserved
race maintenance-group fault group blocked
race block-group block group blocked
race closed-group close group blocked
psql -X -v ON_ERROR_STOP=1 <<'SQL'
select signing_ci.require((select count(*)=1 from public.rental_bookings where rental_item_id=signing_ci.uid('capacity:group-group')),'only one group booking');
select signing_ci.require((select count(*)=1 from public.rental_bookings where rental_item_id=signing_ci.uid('capacity:group-legacy')),'only one mixed booking');
select signing_ci.require((select count(*)=1 from public.rental_bookings where rental_item_id=signing_ci.uid('capacity:legacy-group')),'only one mixed booking reversed');
select signing_ci.require(not exists(select 1 from public.rental_bookings where rental_item_id=signing_ci.uid('capacity:maintenance-group')),'unsafe item never reserved');
select signing_ci.require(signing_ci.capacity_attempt('group-block','a','group')='reserved','group reserved before manual block');
select signing_ci.require(signing_ci.capacity_attempt('group-block','b','block')='unavailable','manual block rejected with confirmed capacity');
select signing_ci.require(signing_ci.capacity_attempt('group-reduce','a','group')='reserved','open group commitment');
select signing_ci.require(signing_ci.capacity_attempt('group-reduce','b','reduce')='unavailable','quantity decrease blocked with commitment');
select signing_ci.require((select quantity=2 from public.rental_items where id=signing_ci.uid('capacity:group-reduce')),'quantity unchanged');
select signing_ci.require((select free_units=0 from public.draft_rental_availability_days(signing_ci.uid('capacity:maintenance-group'),(clock_timestamp() at time zone 'Europe/Oslo')::date+2,(clock_timestamp() at time zone 'Europe/Oslo')::date+2)),'calendar sees maintenance lock');
SQL

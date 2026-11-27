#!/usr/bin/env bash
set -euo pipefail
export PGHOST=127.0.0.1 PGPORT=5432 PGDATABASE=aadland_signing_test PGUSER=postgres PGPASSWORD=local_fixture_only
[[ "$CI" == true ]] || exit 1
psql -X -v ON_ERROR_STOP=1 -f scripts/sql/signing-concurrency-fixture.sql
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
# Two independent psql processes. First holds xact lock during sleep;
# second calls while first is uncommitted and must wait on same account lock.
race(){
 local label="$1" first="$2" second="$3" expected1="$4" expected2="$5"
 (PGAPPNAME="signing-race-$label" psql -X -qAt -v ON_ERROR_STOP=1 -c "begin; select $first; select pg_sleep(2); commit;" >"$tmp/$label-first") &
 local pid=$!
 # Confirm first session is sleeping inside the transaction rather than
 # relying on a fixed startup delay. Fail if barrier never observed.
 local seen=0
 for i in $(seq 1 60); do
  if [[ "$(psql -X -qAt -c "select count(*) from pg_stat_activity where datname=current_database() and wait_event='PgSleep' and application_name='signing-race-$label'")" == 1 ]]; then seen=1; break; fi
  sleep 0.05
 done
 if [[ "$seen" != 1 ]]; then wait "$pid"; echo "FAIL: no race barrier $label"; exit 1; fi
 psql -X -qAt -v ON_ERROR_STOP=1 -c "select $second" >"$tmp/$label-second"
 wait "$pid"
 [[ "$(sed '/^$/d' "$tmp/$label-first")" == "$expected1" ]]
 [[ "$(sed '/^$/d' "$tmp/$label-second")" == "$expected2" ]]
 echo "PASS: $label ($expected1 / $expected2)"
}
race sign "signing_ci.commit('parallel-sign','parallel-sign-code',0,'consume_and_record')" "signing_ci.commit('parallel-sign','parallel-sign-code',0,'consume_and_record')" signed closed
race fail "signing_ci.commit('parallel-fail','parallel-fail-code',0,'record_failure')" "signing_ci.commit('parallel-fail','parallel-fail-code',0,'record_failure')" wrong_code stale
race issue "signing_ci.issue('parallel-issue','parallel-issue-1')" "signing_ci.issue('parallel-issue','parallel-issue-2')" reserved limited
psql -X -v ON_ERROR_STOP=1 <<'SQL'
select signing_ci.require((select count(*)=1 from public.aadland_signing_evidence where agreement_id=signing_ci.uid('parallel-sign:agreement')),'concurrent signature unique');
select signing_ci.require((select attempts=1 from public.aadland_signing_challenges where id=signing_ci.uid('parallel-fail-code')),'stale concurrent failure cannot overwrite attempts');
select signing_ci.require((select count(*)=1 from public.aadland_signing_challenges where agreement_id=signing_ci.uid('parallel-issue:agreement')),'concurrent issue unique');
SQL

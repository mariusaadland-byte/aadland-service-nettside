#!/usr/bin/env bash
set -euo pipefail
# Intentionally no DATABASE_URL or Supabase credentials. Only local CI service.
export PGHOST=127.0.0.1 PGPORT=5432 PGDATABASE=aadland_signing_test PGUSER=postgres PGPASSWORD=local_fixture_only
if [[ "${CI:-}" != true ]]; then echo "Run only in the dedicated disposable CI service."; exit 1; fi
# Remove transaction wrappers only from known design drafts and run together in
# a SINGLE transaction. On any error psql exits; database service is disposable.
{
 cat scripts/sql/signing-test-fixture.sql
 sed -e '/^begin;$/d' -e '/^rollback;$/d' docs/u38d-signing-transaction.draft.sql
 sed -e '/^begin;$/d' -e '/^rollback;$/d' docs/u38f-signing-download.draft.sql
 cat scripts/sql/signing-test-cases.sql
} | psql -X --set=ON_ERROR_STOP=1 --single-transaction --file=-

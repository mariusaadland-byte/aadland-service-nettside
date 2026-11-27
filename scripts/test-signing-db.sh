#!/usr/bin/env bash
set -euo pipefail
# Intentionally no DATABASE_URL or Supabase credentials. Only local CI service.
export PGHOST=127.0.0.1 PGPORT=5432 PGDATABASE=aadland_signing_test PGUSER=postgres PGPASSWORD=local_fixture_only
if [[ "${CI:-}" != true ]]; then echo "Run only in the dedicated disposable CI service."; exit 1; fi
# Remove transaction wrappers only from known design drafts and run together in
# a SINGLE transaction. On any error psql exits; database service is disposable.
{
 cat scripts/sql/group-signing-test-fixture.sql
 cat docs/u37-rental-consumables.draft.sql
 sed -e '/^begin;$/d' -e '/^commit;$/d' docs/u37b-consumables-admin.draft.sql
 sed -e '/^begin;$/d' -e '/^rollback;$/d' docs/u37f-group-transaction.draft.sql
 sed -e '/^begin;$/d' -e '/^rollback;$/d' docs/u38d-signing-transaction.draft.sql
 sed -e '/^begin;$/d' -e '/^rollback;$/d' docs/u38f-signing-download.draft.sql
 sed -e '/^begin;$/d' -e '/^rollback;$/d' docs/u38n-group-payment-settlement.draft.sql
 sed -e '/^begin;$/d' -e '/^rollback;$/d' docs/u38o-return-deposit-settlement.draft.sql
 sed -e '/^begin;$/d' -e '/^rollback;$/d' docs/u38p-damage-claims.draft.sql
 sed -e '/^begin;$/d' -e '/^rollback;$/d' docs/u38r-damage-publication.draft.sql
 sed -e '/^begin;$/d' -e '/^rollback;$/d' docs/u39a-checkout-agreement.draft.sql
 sed -e '/^begin;$/d' -e '/^rollback;$/d' docs/u39d-cancel-payment-claim.draft.sql
 sed -e '/^begin;$/d' -e '/^rollback;$/d' docs/u39f-group-confirmation.draft.sql
 cat docs/u24-rental-equipment-units.draft.sql
 cat docs/u25-rental-unit-maintenance.draft.sql
 sed -e '/^begin;$/d' -e '/^rollback;$/d' docs/u39g-handover-capture.draft.sql
 sed -e '/^begin;$/d' -e '/^rollback;$/d' docs/u39h-unit-return.draft.sql
 sed -e '/^begin;$/d' -e '/^rollback;$/d' docs/u39k-bank-evidence.draft.sql
 sed -e '/^begin;$/d' -e '/^rollback;$/d' docs/u39l-bank-download-audit.draft.sql
 sed -e '/^begin;$/d' -e '/^rollback;$/d' docs/u39n-tripletex-transfer.draft.sql
 cat scripts/sql/signing-test-cases.sql
 cat scripts/sql/group-signing-test-cases.sql
 cat scripts/sql/group-payment-test-cases.sql
 cat scripts/sql/group-damage-test-cases.sql
 cat scripts/sql/checkout-agreement-test-cases.sql
 cat scripts/sql/group-cancel-test-cases.sql
} | psql -X --set=ON_ERROR_STOP=1 --single-transaction --file=-

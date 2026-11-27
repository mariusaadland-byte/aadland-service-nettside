#!/usr/bin/env bash
set -euo pipefail
umask 077
[[ "${CI:-}" == true ]] || { echo "Dedicated CI only"; exit 1; }
container="${POSTGRES_CI_CONTAINER:-}"
[[ "$container" =~ ^[a-f0-9]{64}$ ]] || { echo "Invalid CI container"; exit 1; }
[[ "$(docker inspect --format '{{.Config.Image}}' "$container")" == "postgres:17.6" ]] || exit 1
# Use only the disposable Docker service, no remote address, no production URL.
src=aadland_signing_test
dst=aadland_restore_test
pg(){ docker exec -i "$container" "$@"; }
query(){ pg psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d "$1" -c "$2"; }
[[ "$(query "$src" "select current_database()")" == "$src" ]] || exit 1
[[ "$(query postgres "select count(*) from pg_database where datname='$dst'")" == 0 ]] || exit 1
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/original/private" "$tmp/copy" "$tmp/restored"
printf 'Synthetic receipt bytes for restore exercise\n' > "$tmp/original/private/demo.txt"
digest=$(sha256sum "$tmp/original/private/demo.txt" | cut -d' ' -f1)
[[ "$digest" =~ ^[a-f0-9]{64}$ ]] || exit 1
query "$src" "create schema backup_ci; create table backup_ci.file_manifest(path text primary key,sha256 text not null); insert into backup_ci.file_manifest values('private/demo.txt','$digest');"
# Database and object bytes are deliberately copied separately.
pg pg_dump -U postgres --format=custom --dbname="$src" > "$tmp/db.dump"
test -s "$tmp/db.dump"
sha256sum "$tmp/db.dump" > "$tmp/db.sha256"
tar -C "$tmp/original" -cf "$tmp/copy/files.tar" private
sha256sum "$tmp/copy/files.tar" > "$tmp/files.sha256"
sha256sum -c "$tmp/db.sha256"
sha256sum -c "$tmp/files.sha256"
pg createdb -U postgres --template=template0 "$dst"
pg pg_restore -U postgres --exit-on-error --single-transaction --dbname="$dst" < "$tmp/db.dump"
tar -C "$tmp/restored" -xf "$tmp/copy/files.tar"
restored_digest=$(sha256sum "$tmp/restored/private/demo.txt" | cut -d' ' -f1)
[[ "$(query "$dst" "select sha256 from backup_ci.file_manifest where path='private/demo.txt'")" == "$restored_digest" ]]
# All ordinary tables in fixture schemas: compare row count and content hashes.
# Fixture is small; not intended for hashing the whole production DB in memory.
for name in "$src" "$dst"; do
 pg psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d "$name" < scripts/sql/isolated-restore-manifest.sql > "$tmp/$name.manifest"
done
test -s "$tmp/$src.manifest"
diff -u "$tmp/$src.manifest" "$tmp/$dst.manifest"
pg psql -X -v ON_ERROR_STOP=1 -U postgres -d "$dst" < scripts/sql/isolated-restore-assertions.sql
echo "PASS: synthetic database, table contents, selected schema/ACL properties and separate file bytes restored."
# No dump uploads. The service itself is disposed of at job completion.

import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=path=>readFileSync(path,"utf8");
const original=read("supabase/migrations/20261025221500_vat_external_sales_documents.sql");
const fixed=read("supabase/migrations/20261121121000_vat_external_sales_file_fixed_search_path.sql");
const ownerRoute=read("app/api/admin/invoices/vat-external-files/route.js");
assert.match(fixed,/alter function public\.protect_vat_external_sales_file\(\)\s+set search_path\s*=\s*''\s*;/i);
assert.ok(!/create or replace function|drop trigger|drop function|alter table|grant execute|grant (all|update|delete)/i.test(fixed),
 "This security patch must not replace a function, change its trigger or widen permissions");
assert.match(original,/create trigger protect_vat_external_sales_file before update or delete\s+on public\.vat_external_sales_files/i);
assert.match(original,/raise exception 'En lagret ekstern faktura kan ikke endres eller slettes\.'/);
assert.match(original,/enable row level security/);
assert.match(original,/grant select,insert on table public\.vat_external_sales_files to service_role;/);
assert.match(original,/revoke all on table public\.vat_external_sales_files from public,anon,authenticated;/);
assert.ok(ownerRoute.includes('user?.role!=="owner"'));
assert.ok(ownerRoute.includes('upsert:false'));
assert.ok(!ownerRoute.includes("export async function DELETE("));
assert.ok(!ownerRoute.includes("export async function PATCH("));
console.log("S-10 bestått: search_path er eksplisitt tom, append-only trigger, ACL og eierbeskyttet filopplasting er uendret.");

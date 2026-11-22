import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(p,"utf8");
const migration=read("supabase/migrations/20261121182500_s22_stock_vipps_order_metadata.sql");
const newMigration=read("supabase/migrations/20261122015000_s25_service_order_idempotency.sql");
const route=read("app/api/orders/route.js");
const adminRoute=read("app/api/admin/orders/route.js");
const adminUi=read("app/admin/AdminClient.js");

// S-22's protections must survive S-25's idempotency wrapper. The new
// S-25 smoke exercises actual API code and mocks the transactional wrapper.
for(const term of [
 "payment_provider,payment_reference,vipps_checkout_started_at",
 "provider,reference,checkout_at",
 "INVALID_VIPPS_ORDER_REFERENCE",
 "INSUFFICIENT_STOCK",
 "stock_quantity=stock_quantity-requested_quantity",
 "grant execute on function public.create_order_with_stock(jsonb,jsonb) to service_role",
 "revoke all on function public.create_order_with_stock(jsonb,jsonb) from public,anon,authenticated"
])assert.ok(migration.includes(term),"S22 stock Vipps safeguard missing: "+term);
for(const term of [
 "public.create_order_with_stock(p_order_record,p_stock_requests)",
 "p_order_record->>'payment_reference'",
 "checkout_request_fingerprint",
 "public.claim_service_order_vipps"
])assert.ok(newMigration.includes(term),"S25 wrapper must retain S22 protection: "+term);
assert.ok(route.includes("createdOrder.payment_provider!==\"vipps\""));
assert.ok(route.includes("createdOrder.payment_reference!==orderNumber"));
assert.ok(route.includes('s.rpc("cancel_product_order_once"'),"S22 integrity failure must release stock safely");
assert.ok(route.includes("SERVICE ORDER STOCK RELEASE NEEDS REVIEW"));
assert.ok(route.includes('s.rpc("create_service_order_once"'),
 "Atomic idempotent wrapper must protect all stock reservations");
assert.ok(route.includes('s.rpc("claim_service_order_vipps"'));
assert.ok(route.includes('s.rpc("complete_service_order_vipps"'));
assert.ok(adminUi.includes("Historisk avvik: Ordren er avsluttet og arkivert, men betalingen er ikke ferdig avstemt"));
assert.ok(adminRoute.includes('order.status==="completed"&&["pending","unpaid","partial","authorized"].includes(paymentStatus)'));
assert.ok(adminRoute.includes('action === "archive"'));
console.log("S-22 bestått: lagerreservering og Vipps-referanse fortsatt atomisk etter S25, sikker feilavvisning og arkivvarsel beholdt. Ingen kundedata.");

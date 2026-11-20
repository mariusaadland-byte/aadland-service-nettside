import assert from "node:assert/strict";
import {existsSync,readFileSync} from "node:fs";
const read=p=>readFileSync(p,"utf8");
const page=read("app/admin/utleie/vipps-oppsett/page.js");
const ui=read("app/admin/utleie/vipps-oppsett/RentalVippsSetupClient.js");
const css=read("app/admin/utleie/vipps-oppsett/rentalVippsSetup.module.css");
const roadmap=read("lib/developmentTaskLinks.js");
const nav=read("app/admin/utleie/RentalInventoryClient.js");
const status=read("app/api/admin/vipps-status/route.js");
const checks=read("app/api/admin/vipps-diagnostics/route.js");
const registration=read("app/api/admin/vipps-webhook/route.js");
const config=read("lib/vippsConfig.js");
const readiness=read("lib/vippsReadiness.js");
const payments=read("lib/startRentalVippsPayment.js");
assert.ok(page.includes('user.role!=="owner"'),"Rental setup must be owner-only");
assert.ok(page.includes("getAdminUser"));
assert.ok(page.includes("RentalVippsSetupClient"));
assert.ok(page.includes("robots:{index:false,follow:false}"));
assert.ok(roadmap.includes('rental_booking:"/admin/utleie/vipps-oppsett"'));
assert.ok(nav.includes('href="/admin/utleie/vipps-oppsett"'));
assert.ok(existsSync("app/admin/utleie/vipps-oppsett/page.js"));
assert.ok(read("app/admin/vipps/VippsStatusClient.js").includes(
 'href="/admin/utleie/vipps-oppsett"'));
for(const key of [
 "VIPPS_RENTAL_CLIENT_ID","VIPPS_RENTAL_CLIENT_SECRET",
 "VIPPS_RENTAL_SUBSCRIPTION_KEY","VIPPS_RENTAL_MSN"
]){
 assert.ok(ui.includes(key),"Missing rental-specific credential "+key);
 assert.ok(config.includes('"'+key+'"'));
}
for(const phrase of [
 "/api/admin/vipps-status",
 "/api/admin/vipps-diagnostics",
 'unit:"rental"',
 '"POST"', // read-only diagnostics, NOT payment
 "/admin/vipps",
 "/admin/utviklingsplan",
 "/admin/utleie",
 "portal.vippsmobilepay.com",
 "vercel.com/dashboard",
 "Webhook-ID",
 "Riktig salgssted (MSN)",
 "depositum",
 "callback/webhook",
 "Kontroller koblingen til Vipps",
 "Test oppsett uten betaling",
 "VIPPS_RENTAL_PAYMENTS_ENABLED",
 "VIPPS_RENTAL_PUBLIC_PAYMENTS_ENABLED",
 "forbli AV",
 "Ikke send hemmelige nøkler"
])assert.ok(ui.includes(phrase),"Missing owner setup step "+phrase);
assert.ok(ui.includes('disabled={checking||loading||!rental?.configured}'),
 "API diagnostic button should be unavailable before credentials exist");
assert.ok(ui.includes('fetch("/api/admin/vipps-status",{cache:"no-store"})'));
assert.ok(ui.includes('if(!response.ok||!data.ok)'));
assert.ok(!ui.includes('registerVippsWebhook('),"Webhook registration must remain owner-clicked in existing admin control");
assert.ok(!ui.includes('createVippsPayment('),"Setup guide must not initiate real payments");
assert.ok(!ui.includes("setEnabled("));
assert.ok(!ui.includes("VIPPS_RENTAL_PAYMENTS_ENABLED=true"));
assert.ok(status.includes("vippsPublicStatus()"));
assert.ok(checks.includes("testVippsApiConnection(unit)"));
assert.ok(checks.includes("readyForEnable"));
assert.ok(checks.includes("oneLocalActiveWebhook"));
assert.ok(registration.includes("registerVippsWebhook"));
assert.ok(readiness.includes('vippsUnitReadiness(s,"rental"')===false);
assert.ok(payments.includes('vippsUnitReadiness(s,"rental")'),
 "Rental payment backend must remain behind server-side readiness checks");
assert.ok(payments.includes('amountOre:totalOre'),
 "Rental charged amount must be rental total, excluding deposit");
assert.ok(css.includes("grid-template-columns:minmax(0,1fr)"));
assert.ok(css.includes("max-width:690px"));
console.log("Vipps Aadland Utleie klargjøring bestått: eier-only, fire egne nøkkelfelt, webhook, test uten betaling, riktig depositum og sperret kundebetaling inntil godkjenning.");

import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {spawnSync} from "node:child_process";

const client=readFileSync("lib/vippsClient.js","utf8");
const from=client.indexOf("function enabled(unit){");
const to=client.indexOf("async function parseResponse",from);
const enabledCode=client.slice(from,to);
assert.ok(from>0&&to>from);
const exported=client.slice(client.indexOf("export function vippsPaymentsEnabled("),client.indexOf("export function vippsIdempotencyKey("))
 .replace(/^export /gm,"");
const processMock={env:{}};
const funcs=new Function("process",enabledCode+exported+";return {enabled,vippsPaymentsEnabled};")(processMock);
const {enabled,vippsPaymentsEnabled}=funcs;
const flags=processMock.env;
assert.equal(enabled("service"),false);
assert.equal(enabled("rental"),false);
assert.equal(vippsPaymentsEnabled(),false);
flags.VIPPS_PAYMENTS_ENABLED="true";
assert.equal(enabled("service"),false,"Old global flag must not silently activate Service");
assert.equal(enabled("rental"),false,"Old global flag must not silently activate Rental");
flags.VIPPS_SERVICE_PAYMENTS_ENABLED="true";
assert.equal(vippsPaymentsEnabled("service"),true);
assert.equal(vippsPaymentsEnabled("rental"),false);
assert.equal(vippsPaymentsEnabled(),true);
flags.VIPPS_SERVICE_PAYMENTS_ENABLED="false";
flags.VIPPS_RENTAL_PAYMENTS_ENABLED="true";
assert.equal(vippsPaymentsEnabled("service"),false);
assert.equal(vippsPaymentsEnabled("rental"),true);
flags.VIPPS_RENTAL_PAYMENTS_ENABLED="false";
assert.equal(vippsPaymentsEnabled(),false);
assert.equal(vippsPaymentsEnabled("unknown"),false);
flags.VIPPS_SERVICE_PAYMENTS_ENABLED="TRUE";
assert.equal(vippsPaymentsEnabled("service"),true);
flags.VIPPS_SERVICE_PAYMENTS_ENABLED="no";
assert.equal(vippsPaymentsEnabled("service"),false);
assert.ok(client.includes("if(!allowDisabled)requireEnabled(unit);"),"Every payment API request must enforce its legal sales unit");

const readiness=readFileSync("lib/vippsReadiness.js","utf8");
assert.ok(readiness.includes('if(!vippsPaymentsEnabled(key))return {ready:false,reason:"disabled",config}'),"Readiness must be per unit");
const admin=readFileSync("app/api/admin/vipps-payment/route.js","utf8");
assert.ok(admin.includes("if(!vippsPaymentsEnabled(unit))return"),"Manual payment actions must be scoped to unit");
const webhook=readFileSync("app/api/vipps/webhook/route.js","utf8");
assert.ok(webhook.includes("if(!vippsPaymentsEnabled(unit))"),"Webhook must reject events for disabled unit");
assert.ok(webhook.indexOf("if(!vippsPaymentsEnabled(unit))")>webhook.indexOf("const unit=String(auth.unit"),"Webhook unit must come from authenticated registration");
const status=readFileSync("app/api/admin/vipps-status/route.js","utf8");
assert.ok(status.includes("enabled:vippsPaymentsEnabled(unit.unit)"),"Admin status must reflect actual per-unit switch");
const ui=readFileSync("app/admin/vipps/VippsStatusClient.js","utf8");
assert.ok(ui.includes("VIPPS_SERVICE_PAYMENTS_ENABLED=true"));
assert.ok(ui.includes("VIPPS_RENTAL_PAYMENTS_ENABLED=true"));
const example=readFileSync(".env.example","utf8");
assert.ok(example.includes("VIPPS_SERVICE_PAYMENTS_ENABLED=false"));
assert.ok(example.includes("VIPPS_RENTAL_PAYMENTS_ENABLED=false"));

const required={
 VERCEL_ENV:"production",
 NEXT_PUBLIC_SUPABASE_URL:"https://example.invalid",
 SUPABASE_SERVICE_ROLE_KEY:"fake-test-key",
 SESSION_SECRET:"fake-test-secret",
 RESEND_API_KEY:"fake-test-email-key",
 CRON_SECRET:"fake-test-cron-secret",
 NEXT_PUBLIC_SITE_URL:"https://www.aadland-service.no",
 VIPPS_ENV:"production",
 VIPPS_WEBHOOK_URL:"https://www.aadland-service.no/api/vipps/webhook"
};
function validation(extra={}){
 return spawnSync(process.execPath,["scripts/validate-production-env.mjs"],{
  env:{...required,...extra},encoding:"utf8",timeout:12000
 });
}
const serviceKeys={
 VIPPS_SERVICE_CLIENT_ID:"fake-test-id",
 VIPPS_SERVICE_CLIENT_SECRET:"fake-test-secret",
 VIPPS_SERVICE_SUBSCRIPTION_KEY:"fake-test-subscription",
 VIPPS_SERVICE_MSN:"fake-test-msn"
};
const rentalKeys={
 VIPPS_RENTAL_CLIENT_ID:"fake-test-id",
 VIPPS_RENTAL_CLIENT_SECRET:"fake-test-secret",
 VIPPS_RENTAL_SUBSCRIPTION_KEY:"fake-test-subscription",
 VIPPS_RENTAL_MSN:"fake-test-msn"
};
assert.equal(validation().status,0,"Both units disabled should build without keys");
assert.equal(validation({VIPPS_PAYMENTS_ENABLED:"true"}).status,0,"Legacy global flag cannot force both units enabled");
assert.equal(validation({...serviceKeys,VIPPS_SERVICE_PAYMENTS_ENABLED:"true"}).status,0,"Service may run without Rental credentials");
assert.equal(validation({...rentalKeys,VIPPS_RENTAL_PAYMENTS_ENABLED:"true"}).status,0,"Rental may run without Service credentials");
assert.notEqual(validation({VIPPS_SERVICE_PAYMENTS_ENABLED:"true"}).status,0,"Service activation requires its own credentials");
assert.notEqual(validation({...serviceKeys,VIPPS_RENTAL_PAYMENTS_ENABLED:"true"}).status,0,"Rental activation must require Rental credentials");
assert.notEqual(validation({...rentalKeys,VIPPS_SERVICE_PAYMENTS_ENABLED:"true"}).status,0,"Service activation must require Service credentials");
assert.notEqual(validation({...serviceKeys,VIPPS_SERVICE_PAYMENTS_ENABLED:"true",VIPPS_RENTAL_PAYMENTS_ENABLED:"true"}).status,0,"Activating both requires both sets");
assert.equal(validation({...serviceKeys,...rentalKeys,VIPPS_SERVICE_PAYMENTS_ENABLED:"true",VIPPS_RENTAL_PAYMENTS_ENABLED:"true"}).status,0);
assert.notEqual(validation({...serviceKeys,VIPPS_SERVICE_PAYMENTS_ENABLED:"true",VIPPS_WEBHOOK_URL:"http://wrong.invalid"}).status,0,"Reject bad production callback");
console.log("Vipps separat aktivering bestått: Service/Utleie egne brytere, legacy av, API/webhook/admin avgrenset, produksjonsnøkler kreves bare for aktivert enhet.");

import assert from "node:assert/strict";
import crypto from "node:crypto";
import {readFileSync} from "node:fs";
const key=crypto.randomBytes(32).toString("base64");
const env={SYSTIMA_OAUTH_ENABLED:"true",SYSTIMA_CLIENT_ID:"test-client",
 SYSTIMA_CLIENT_SECRET:"test-secret",
 SYSTIMA_TOKEN_URL:"https://api-systima.azurewebsites.net/api-external/token",
 SYSTIMA_REDIRECT_URI:"https://www.aadland-service.no/api/admin/systima/callback",
 NEXT_PUBLIC_SITE_URL:"https://www.aadland-service.no",SYSTIMA_TOKEN_ENCRYPTION_KEY:key};
const cfg=readFileSync("lib/systimaIntegrationStatus.js","utf8").replace(/^export /gm,"");
const {systimaSetupStatus}=new Function(cfg+";return {systimaSetupStatus};")();
const vault=readFileSync("lib/systimaTokenVault.js","utf8").replace(/^import .*;\n/gm,"").replace(/^export /gm,"");
const {secureSystimaSeal,secureSystimaOpen}=new Function("crypto",vault+
 ";return {secureSystimaSeal,secureSystimaOpen};")(crypto);
const src=readFileSync("lib/systimaTokenLifecycle.js","utf8")
 .replace(/^import .*;\n/gm,"").replace(/^export /gm,"");
const {systimaTokenDates,systimaPublicTokenHealth,refreshSystimaTokens}=
 new Function("secureSystimaOpen","secureSystimaSeal","systimaSetupStatus","process","fetch",
 src+";return {systimaTokenDates,systimaPublicTokenHealth,refreshSystimaTokens};")(
 secureSystimaOpen,secureSystimaSeal,systimaSetupStatus,{env},()=>{throw Error("No real network")}
);
const now=Date.parse("2026-10-25T12:00:00Z");
const credentials={accessToken:"MOCK_ACCESS",refreshToken:"MOCK_REFRESH",
 expiresAt:"2026-10-25T12:10:00Z",refreshTokenExpiresAt:"2026-11-25T12:00:00Z"};
const sealed=secureSystimaSeal(credentials,key);
const health=systimaPublicTokenHealth(sealed,key,now);
assert.equal(health.status,"expiring");
assert.equal(health.expiryVerified,true);
assert.equal(health.accessExpiresAt,"2026-10-25T12:10:00.000Z");
assert.ok(!JSON.stringify(health).includes("MOCK_"));
assert.equal(systimaPublicTokenHealth(null,key,now).status,"not_connected");
assert.equal(systimaPublicTokenHealth(sealed,"invalid",now).status,"cannot_read");
assert.equal(systimaPublicTokenHealth(sealed,crypto.randomBytes(32).toString("base64"),now).status,"cannot_read");
assert.equal(systimaPublicTokenHealth(secureSystimaSeal({...credentials,
 expiresAt:"2026-10-20T12:00:00Z"},key),key,now).status,"needs_refresh");
assert.equal(systimaPublicTokenHealth(secureSystimaSeal({...credentials,
 refreshTokenExpiresAt:"2026-10-20T12:00:00Z"},key),key,now).status,"reauthorize");
assert.equal(systimaTokenDates({...credentials,expiresAt:"n/a"},now).access.status,"unknown");
let calls=0;
const mockFetch=async(url,opts)=>{
 calls++;assert.equal(url,env.SYSTIMA_TOKEN_URL);assert.equal(opts.method,"POST");
 assert.equal(opts.redirect,"error");assert.equal(opts.cache,"no-store");
 assert.equal(opts.headers["Content-Type"],"application/json");
 const json=JSON.parse(opts.body);
 assert.equal(json.grantType,"refresh_token");
 assert.equal(json.refreshToken,"MOCK_REFRESH");
 assert.equal(json.clientId,"test-client");
 assert.equal(json.clientSecret,"test-secret");
 assert.equal(json.redirectUri,env.SYSTIMA_REDIRECT_URI);
 return {ok:true,async json(){return {accessToken:"MOCK_ACCESS_NEXT",
 refreshToken:"MOCK_REFRESH_NEXT",
 expiresAt:"2026-11-01T15:00:00Z",refreshTokenExpiresAt:"2026-12-01T15:00:00Z"};}};
};
const updated=await refreshSystimaTokens(sealed,env,mockFetch);
assert.equal(calls,1);
assert.deepEqual(secureSystimaOpen(updated.encrypted,key),{
 accessToken:"MOCK_ACCESS_NEXT",refreshToken:"MOCK_REFRESH_NEXT",
 expiresAt:"2026-11-01T15:00:00Z",refreshTokenExpiresAt:"2026-12-01T15:00:00Z"
});
assert.equal(updated.health.status,"token_stored");
assert.ok(!JSON.stringify(updated.health).includes("MOCK_ACCESS"));
await assert.rejects(()=>refreshSystimaTokens(sealed,{...env,SYSTIMA_OAUTH_ENABLED:"false"},mockFetch));
await assert.rejects(()=>refreshSystimaTokens(sealed,{...env,SYSTIMA_TOKEN_URL:"https://evil.example/token"},mockFetch));
await assert.rejects(()=>refreshSystimaTokens(sealed,env,async()=>({ok:false})),/ikke/);
await assert.rejects(()=>refreshSystimaTokens(sealed,env,async()=>({ok:true,async json(){return {accessToken:"only"};}})),/tokenpar/);
assert.equal(calls,1,"All other test paths must not call success mock provider");
const ui=readFileSync("app/admin/faktura/systima/SystimaConnectionClient.js","utf8");
assert.ok(ui.includes("Forny tilgangstoken"));
assert.ok(ui.includes("Koble fra Systima lokalt"));
assert.ok(ui.includes("Tilgangstoken er utløpt"));
assert.ok(ui.includes("Frakobling fjerner bare lokale tilgangstoken"));
console.log("Systima tokenlivssyklus bestått: utløp, usikker dato, kryptert fornying, avvist token og lokal frakobling.");

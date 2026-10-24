import assert from "node:assert/strict";
import crypto from "node:crypto";
import {readFileSync} from "node:fs";
const configSource=readFileSync("lib/systimaIntegrationStatus.js","utf8").replace(/^export /gm,"");
const {systimaSetupStatus}=new Function(configSource+";return {systimaSetupStatus};")();
const key=crypto.randomBytes(32).toString("base64");
const validEnv={
 SYSTIMA_OAUTH_ENABLED:"true",SYSTIMA_CLIENT_ID:"fake-client",
 SYSTIMA_CLIENT_SECRET:"fake-client-secret",
 SYSTIMA_TOKEN_URL:"https://api-systima.azurewebsites.net/api-external/token",
 SYSTIMA_REDIRECT_URI:"https://www.aadland-service.no/api/admin/systima/callback",
 SYSTIMA_TOKEN_ENCRYPTION_KEY:key,
 NEXT_PUBLIC_SITE_URL:"https://www.aadland-service.no"
};
const config=systimaSetupStatus(validEnv);
assert.equal(config.enabled,true);
assert.equal(config.configurationComplete,true);
assert.equal(config.connectionAvailable,true);
assert.equal(config.invoiceEndpointVerified,false);
assert.equal(config.autoImportEnabled,false);
assert.equal(systimaSetupStatus({...validEnv,SYSTIMA_OAUTH_ENABLED:"false"}).connectionAvailable,false);
for(const value of ["http://api.systima.no/token","https://localhost/token",
 "https://api.systima.no/api-external/vouchers","https://api.systima.no/token?x=1",
 "https://api.systima.no@evil.example/token"]){
 const invalid=systimaSetupStatus({...validEnv,SYSTIMA_TOKEN_URL:value});
 assert.equal(invalid.connectionAvailable,false,"Must fail closed for "+value);
}
assert.equal(systimaSetupStatus({...validEnv,SYSTIMA_REDIRECT_URI:"https://evil.example/callback"}).connectionAvailable,false);
assert.equal(systimaSetupStatus({...validEnv,SYSTIMA_TOKEN_ENCRYPTION_KEY:"short"}).connectionAvailable,false);
assert.equal(systimaSetupStatus({}).connectionAvailable,false);
const vaultSource=readFileSync("lib/systimaTokenVault.js","utf8")
 .replace(/^import .*;\n/gm,"").replace(/^export /gm,"");
const {secureSystimaSeal,secureSystimaOpen}=new Function("crypto",vaultSource+
 ";return {secureSystimaSeal,secureSystimaOpen};")(crypto);
const tokens={accessToken:"not-real-access",refreshToken:"not-real-refresh",
 expiresAt:"2026-10-25T11:00:00Z"};
const sealed=secureSystimaSeal(tokens,key);
assert.ok(!sealed.includes(tokens.accessToken)&&!sealed.includes(tokens.refreshToken));
assert.deepEqual(secureSystimaOpen(sealed,key),tokens);
assert.notEqual(secureSystimaSeal(tokens,key),sealed,"Each encryption needs a fresh nonce");
const parts=sealed.split(".");
assert.equal(parts.length,3);
const tampered=[parts[0],parts[1].slice(0,-2)+"aa",parts[2]].join(".");
assert.throws(()=>secureSystimaOpen(tampered,key));
assert.throws(()=>secureSystimaOpen(sealed,crypto.randomBytes(32).toString("base64")));
assert.throws(()=>secureSystimaSeal(tokens,"invalid"));
const api=readFileSync("app/api/admin/systima/route.js","utf8");
const callback=readFileSync("app/api/admin/systima/callback/route.js","utf8");
const ui=readFileSync("app/admin/faktura/systima/SystimaConnectionClient.js","utf8");
const authPage=readFileSync("app/admin/faktura/systima/page.js","utf8");
const sql=readFileSync("supabase/migrations/20261025110000_systima_oauth_secret_storage.sql","utf8");
assert.ok(api.includes("sameOriginGuard(req)"));
assert.ok(api.includes('user?.role!=="owner"'));
assert.ok(api.includes('process.env.VERCEL_ENV!=="production"'));
assert.ok(api.includes("response.cookies.set"));
assert.ok(callback.includes("crypto.timingSafeEqual"));
assert.ok(callback.includes('redirect:"error"'));
assert.ok(callback.includes("secureSystimaSeal"));
assert.ok(callback.includes('connection_state:"token_obtained_no_read_endpoint"'));
assert.ok(ui.includes("Ingen")||ui.includes("ikke"),"UI must label integration as inactive");
assert.ok(authPage.includes('user.role!=="owner"'));
assert.ok(sql.includes("enable row level security")&&sql.includes("encrypted_credentials"));
assert.ok(!api.includes("encrypted_credentials:"),"Status API must never return secrets");
assert.ok(!ui.includes("clientSecret"));
console.log("Systima OAuth-grunnlag bestått: hostliste, tilbakeringing, kryptering, låst lesing og eierstatus.");

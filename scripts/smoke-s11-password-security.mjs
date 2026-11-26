import assert from "node:assert/strict";
import crypto from "node:crypto";
import {readFileSync} from "node:fs";
const source=readFileSync("lib/passwordSecurity.js","utf8").replace(/^import .*;\n/gm,"").replace("export async function","async function");
const password="synthetic-test-password";
const hash=crypto.createHash("sha1").update(password).digest("hex").toUpperCase();
let response={ok:true,text:async()=>hash.slice(5)+":123\n"};
let calls=0;
const mockedFetch=async(url,opts)=>{calls++;assert.equal(url,"https://api.pwnedpasswords.com/range/"+hash.slice(0,5));assert.equal(opts.headers["Add-Padding"],"true");assert.equal(opts.cache,"no-store");if(response instanceof Error)throw response;return response;};
const check=new Function("crypto","fetch","console",source+";return checkNewPassword;")(crypto,mockedFetch,{error(){}});
assert.equal((await check("short")).status,400);assert.equal(calls,0);
assert.equal((await check(password)).status,400);
response={ok:true,text:async()=>hash.slice(5)+":0\n"+"A".repeat(35)+":10"};
assert.equal((await check(password)).ok,true);
for(const body of ["","<html>error</html>",hash.slice(5)+":invalid",hash.slice(5)+":0\ninvalid"]){response={ok:true,text:async()=>body};assert.equal((await check(password)).status,503);}
response={ok:false,status:503};assert.equal((await check(password)).status,503);
response=Error("simulated network failure");assert.equal((await check(password)).status,503);
for(const route of ["app/api/customer/register/route.js","app/api/admin/users/route.js","app/api/auth/update-password/route.js","app/api/customer/update-password/route.js"]){const src=readFileSync(route,"utf8");assert.ok(src.includes("await checkNewPassword("));assert.ok(src.includes("if(!passwordCheck.ok)return"));}
console.log("S11: compromised, padded zero, empty/malformed responses, HTTP and network failures, all four application password paths checked with mocks.");

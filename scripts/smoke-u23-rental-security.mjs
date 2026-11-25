import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const writes=["app/api/rental-bookings/route.js","app/api/customer/rental-vipps/route.js","app/api/rental-payment-link/route.js","app/api/admin/rental-bookings/route.js","app/api/admin/rental/route.js","app/api/admin/rental/blocks/route.js","app/api/admin/rental/category/route.js","app/api/admin/rental/categories/route.js","app/api/admin/rental-deposits/route.js","app/api/admin/rental-condition-photos/route.js"];
for(const p of writes){
 const c=readFileSync(p,"utf8");
 const mutations=[...c.matchAll(/export async function (POST|PATCH|PUT|DELETE)\(req\)\{([^\n]*\n[^\n]*)/g)];
 assert.ok(mutations.length,p);
 for(const m of mutations)assert.ok(m[2].includes('process.env.VERCEL_ENV!=="production"'),p+" "+m[1]);
}
const admin=readFileSync("app/api/admin/vipps-payment/route.js","utf8");
assert.ok(admin.includes('unit==="rental"&&process.env.VERCEL_ENV!=="production"'));
const status=readFileSync("app/api/vipps/payment-status/route.js","utf8");
assert.ok(status.includes('const canRefresh=refresh&&!state.terminal&&process.env.VERCEL_ENV==="production"'));
assert.ok(status.includes('if(!service&&process.env.VERCEL_ENV==="production"&&state.status==="paid")'));
for(const p of ["app/api/customer/me/route.js","app/api/customer/login/route.js","app/api/customer/verify/route.js"]){
 assert.match(readFileSync(p,"utf8"),/process\.env\.VERCEL_ENV==="production"\?(s|serviceClient)\.from\("rental_bookings"\)\.update/);
}
console.log("U-23 rental mutation and payment environment guard source checks passed.");

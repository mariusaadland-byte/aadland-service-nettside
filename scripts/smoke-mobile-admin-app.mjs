import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const manifest=readFileSync("app/admin/manifest.js","utf8");
const layout=readFileSync("app/admin/layout.js","utf8");
const page=readFileSync("app/admin/mobil/page.js","utf8");
const camera=readFileSync("app/admin/faktura/mva/VatOriginalAttachment.js","utf8");
for(const part of ['name:"Aadland Service – Admin"','start_url:"/admin/mobil"',
  'scope:"/admin/"','display:"standalone"','icons:'])assert.ok(manifest.includes(part));
assert.ok(layout.includes('manifest:"/admin/manifest.webmanifest"'));
assert.ok(layout.includes('appleWebApp:{capable:true'));
assert.ok(layout.includes('robots:{index:false,follow:false}'));
assert.ok(page.includes("getAdminUser()"));
assert.ok(page.includes('redirect("/admin/login")'));
assert.ok(page.includes('item.access==="owner"?owner'));
assert.ok(page.includes("canViewOrders"));
assert.ok(page.includes("canManageProducts"));
assert.ok(page.includes('"/admin/tilbud"'));
assert.ok(page.includes('"/admin/faktura/arkiv"'));
assert.ok(page.includes('"/admin/faktura/mva"'));
assert.ok(page.includes('"/admin/vipps"'));
assert.ok(camera.includes('capture="environment"'));
assert.ok(camera.includes('accept="image/jpeg,image/png,image/webp"'));
assert.ok(camera.includes('Ta bilde av kvittering'));
assert.ok(camera.includes("originalbilag"));
for(const icon of ["app/admin/icon.js","app/admin/apple-icon.js"])
 assert.ok(readFileSync(icon,"utf8").includes('contentType="image/png"'));
console.log("Admin iPhone-app: manifest, innlogging, rollebaserte snarveier, ikoner og kamerafelt bestått.");

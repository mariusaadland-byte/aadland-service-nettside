import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import crypto from "node:crypto";

const read=p=>readFileSync(p,"utf8");
const helper=read("lib/contactImageReceipts.js")
 .replace(/^import .*;\n/gm,"").replace(/^export /gm,"");
const {privateContactImagePath,createContactImageReceipt,validateContactImageReceipts}=
 new Function("crypto",helper+";return {privateContactImagePath,createContactImageReceipt,validateContactImageReceipts};")(crypto);
const path="contact/2026-11-21/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0001.jpg";
const ref="private-image:contact-images:"+path;
const proof=createContactImageReceipt(path);
assert.equal(proof.ref,ref);
assert.match(proof.receipt,/^[0-9a-f]{64}$/);
assert.equal(proof.receiptHash,crypto.createHash("sha256").update(proof.receipt).digest("hex"));
assert.notEqual(proof.receipt,proof.receiptHash,"The browser must never receive the stored hash as a replacement for proof");
assert.notEqual(createContactImageReceipt(path).receipt,proof.receipt,"Unique random receipts");
assert.equal(privateContactImagePath(ref),path);
for(const invalid of [
 "private-image:contact-images:contact/../other.jpg",
 "private-image:contact-images:unrelated.png",
 "https://example.test/storage/v1/object/contact-images/"+path,
 "private-image:other:"+path,
 "private-image:contact-images:"+path+"?x=1"
])assert.equal(privateContactImagePath(invalid),null);
assert.deepEqual(validateContactImageReceipts([{ref,receipt:proof.receipt}]),[
 {path,receiptHash:proof.receiptHash}
]);
assert.throws(()=>validateContactImageReceipts([{ref,receipt:"made-up"}]),/Ugyldig/);
assert.throws(()=>validateContactImageReceipts([{ref,receipt:proof.receipt},{ref,receipt:proof.receipt}]),/Ugyldig/);
assert.throws(()=>validateContactImageReceipts(new Array(9).fill({ref,receipt:proof.receipt})),/For mange/);

const contactSource=read("app/api/contact-images/route.js")
 .replace(/^import .*;\n/gm,"").replace(/export async function (POST|DELETE)\(/g,"async function $1(");
const NextResponse={json:(body,{status=200,headers={}}={})=>({body,status,headers})};
let removed=[],uploaded=[],journals=[],badJournal=false,storageRequested=0;
const s={
 storage:{from(bucket){
  assert.equal(bucket,"contact-images");storageRequested++;
  return {
   async upload(key,bytes,options){uploaded.push({key,bytes,options});return {error:null}},
   async remove(paths){removed.push(...paths);return {error:null}}
  };
 }},
 from(table){
  assert.equal(table,"contact_image_uploads");
  return {async insert(row){journals.push(row);return {error:badJournal?{message:"test fail"}:null}}};
 }
};
const {POST,DELETE}=new Function("sameOriginGuard","rateLimitRequest","NextResponse","db",
 "crypto","createContactImageReceipt",contactSource+";return {POST,DELETE};")(
 ()=>null,async()=>null,NextResponse,()=>s,crypto,createContactImageReceipt
);
const unauthorizedDelete=await DELETE({json:async()=>({refs:[ref]})});
assert.equal(unauthorizedDelete.status,403);
assert.equal(removed.length,0,"Public DELETE cannot remove a known private file path");
assert.equal(storageRequested,0,"Public DELETE must not even access Storage");

const jpg=Uint8Array.from([0xff,0xd8,0xff,0x00,0x01]);
const fakeFile={
 name:"demo.jpg",type:"image/jpeg",size:jpg.length,
 arrayBuffer:async()=>jpg.buffer
};
const uploadRequest={formData:async()=>({getAll:key=>key==="images"?[fakeFile]:[]})};
let result=await POST(uploadRequest);
assert.equal(result.status,200);
assert.equal(result.body.receipts.length,1);
assert.equal(result.body.urls.length,1);
assert.equal(result.body.receipts[0].ref,result.body.urls[0]);
assert.match(result.body.receipts[0].receipt,/^[0-9a-f]{64}$/);
assert.equal(result.headers["Cache-Control"],"no-store");
assert.equal(journals.length,1);
assert.equal(journals[0].receipt_hash,
 crypto.createHash("sha256").update(result.body.receipts[0].receipt).digest("hex"));
assert.ok(!JSON.stringify(journals).includes(result.body.receipts[0].receipt));
assert.equal(removed.length,0);

const beforeStorage=uploaded.length;
const spoof={...fakeFile,async arrayBuffer(){return Uint8Array.of(0,1,2).buffer}};
result=await POST({formData:async()=>({getAll:()=>[spoof]})});
assert.equal(result.status,400);
assert.equal(uploaded.length,beforeStorage,"Rejected bytes never reach Storage");

badJournal=true;
result=await POST(uploadRequest);
assert.equal(result.status,500,"No receipt, no successful upload");
assert.equal(removed.length,1,"Only the newly uploaded failed-journal object is rolled back");
assert.equal(removed[0],uploaded.at(-1).key);

const form=read("app/HomeClient.js");
assert.ok(form.includes("imageReceipts"));
assert.ok(!form.includes("cleanupContactImageRefs"));
assert.ok(!form.includes('method:"DELETE"'),"Browser must never attempt contact photo deletion");
assert.ok(form.includes("Ubrukte opplastinger ryddes automatisk"));
const order=read("app/api/orders/route.js");
assert.ok(order.includes('create_custom_order_with_contact_images'));
assert.ok(order.includes("validateContactImageReceipts"));
assert.ok(order.includes("p_image_proofs:contactImageProofs"));
assert.ok(order.includes('includes("private-image:")'),"Reject user-typed private file pointers");
assert.ok(order.includes('body.orderType==="custom"'),"Atomic flow scoped to custom orders");

const migration=read("supabase/migrations/20261121180800_contact_image_receipts_s21.sql");
for(const term of [
 "create table public.contact_image_uploads",
 "alter table public.contact_image_uploads enable row level security",
 "revoke all on public.contact_image_uploads from public,anon,authenticated",
 "grant select,insert,update on public.contact_image_uploads to service_role",
 "create function public.create_custom_order_with_contact_images(",
 "revoke all on function public.create_custom_order_with_contact_images(jsonb,jsonb)",
 "for update",
 "token_row.receipt_hash<>p_hash",
 "token_row.state<>'pending'",
 "token_row.created_at<now()-interval '1 hour'",
 "insert into public.orders",
 "state='linked',order_id=created_order_id",
 "position('private-image:' in lower(request_body))>0"
])assert.ok(migration.includes(term),"Missing secure upload/atomic order rule: "+term);

const cron=read("app/api/cron/contact-image-cleanup/route.js");
for(const term of [
 'cronGuard(req)',
 'VERCEL_ENV!=="production"',
 '24*60*60*1000',
 '.eq("state","pending").lt("created_at",cutoff)',
 'state:"cleaning"',
 '.eq("order_type","custom").like("custom_request","%"+ref+"%")',
 'if(existing.error){await hold();continue;}',
 'if(existing.data?.id)',
 's.storage.from(bucket).remove([path])',
 'state:"cleanup_review"',
 'state:"removed"'
])assert.ok(cron.includes(term),"Missing private cleanup safeguard: "+term);
const cronList=JSON.parse(read("vercel.json")).crons;
assert.ok(cronList.some(x=>x.path==="/api/cron/contact-image-cleanup"&&x.schedule==="50 12 * * *"));
assert.ok(cronList.some(x=>x.path==="/api/cron/rental-reminders"),"Rental jobs untouched");
console.log("S-21 bestått: kun kvitteringsbevis knytter private kundebilder til forespørsel, ubekreftet offentlig sletting 403, trygg 24t opprydding og uendrede utleiejobber. Kun syntetiske filer.");

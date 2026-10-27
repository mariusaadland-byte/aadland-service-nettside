import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=path=>readFileSync(path,"utf8");
const today="2026-10-27";
const sampleSource=read("lib/invoiceSplitSelfTest.js").replace(/^export /gm,"");
const {makeSplitSelfTestDocs,splitSelfTestTotalOre,splitSelfTestEmail,SPLIT_SELFTEST_RECIPIENT}=
 new Function(sampleSource+";return {makeSplitSelfTestDocs,splitSelfTestTotalOre,splitSelfTestEmail,SPLIT_SELFTEST_RECIPIENT};")();
const docs=makeSplitSelfTestDocs(today);
assert.equal(docs.length,2);
assert.equal(docs[0].installment_percent,40);
assert.equal(docs[1].installment_percent,60);
assert.equal(splitSelfTestTotalOre(docs[0]),400000);
assert.equal(splitSelfTestTotalOre(docs[1]),600000);
assert.equal(splitSelfTestTotalOre(docs[0])+splitSelfTestTotalOre(docs[1]),1000000);
assert.equal(docs[0].due_date,"2026-11-03");
assert.equal(docs[1].planned_send_on,"2026-11-17");
assert.equal(docs[1].due_date,"2026-12-01");
assert.ok(docs.every(d=>d.demoDocument&&d.status==="draft"&&d.invoice_number===null));
assert.ok(docs.every(d=>d.customer.email.endsWith("@example.invalid")));
assert.equal(SPLIT_SELFTEST_RECIPIENT,"post@aadland-service.no");

const fakeSharp=()=>({
 resize(){return this},flatten(){return this},jpeg(){return this},
 async toBuffer(){return {data:Buffer.from("fake-logo-for-test"),
   info:{width:400,height:100}}}
});
const pdfSource=read("lib/invoiceDraftPdf.js")
 .replace(/^import .*;\n/gm,"").replace(/^export /gm,"");
const {buildInvoiceDraftPdf}=new Function("sharp","path",
 pdfSource+";return {buildInvoiceDraftPdf};")(fakeSharp,{join:()=>"/mock-logo.webp"});
const pdfs=await Promise.all(docs.map(d=>buildInvoiceDraftPdf(d)));
assert.ok(pdfs.every(pdf=>pdf.subarray(0,8).toString()==="%PDF-1.4"));
for(const pdf of pdfs){
 const src=pdf.toString("latin1");
 assert.ok(src.includes("TESTDOKUMENT - IKKE GYLDIG"));
 assert.ok(src.includes("DEMO - INGEN FAKTURA UTSTEDT"));
 assert.ok(src.includes("DEMO - IKKE BETAL"));
 assert.ok(src.includes("TESTDOKUMENT - IKKE GYLDIG FAKTURA"));
 assert.ok(src.includes("MVA 25 %"));
 assert.ok(!src.includes("Kontonummer: 8450"),"Demo must not include payable bank details");
}
assert.notDeepEqual(pdfs[0],pdfs[1]);
const files=pdfs.map((bytes,index)=>({
 filename:"TEST-Aadland-Service-Del-"+(index+1)+".pdf",content:bytes.toString("base64")
}));
const email=splitSelfTestEmail(docs,files);
assert.equal(email.to,"post@aadland-service.no");
assert.match(email.subject,/^TEST/);
assert.match(email.text,/IKKE BETAL NOE/);
assert.equal(email.attachments.length,2);
assert.ok(email.attachments.every(f=>Buffer.from(f.content,"base64").subarray(0,4).toString()==="%PDF"));
assert.throws(()=>splitSelfTestEmail([docs[0]],files),/nøyaktig to/);
assert.throws(()=>splitSelfTestEmail([{...docs[0],invoice_number:"REAL"},docs[1]],files),/ugyldige testdokumenter/);

const routeFile=read("app/api/admin/invoices/selftest/route.js");
assert.ok(!/\bdb\s*\(/.test(routeFile),"Selftest must never query database");
assert.ok(!routeFile.includes("issue_invoice_draft"),"No invoice issuance");
assert.ok(!routeFile.includes("invoice_drafts"),"No access to real invoices");
assert.ok(routeFile.includes("sameOriginGuard(req)"));
assert.ok(routeFile.includes('admin?.role!=="owner"'));
assert.ok(routeFile.includes('process.env.VERCEL_ENV!=="production"'));
assert.ok(routeFile.includes('idempotencyKey:"invoice-split-selftest/"+today'));
assert.ok(routeFile.includes("splitSelfTestEmail(docs,attachments)"));
assert.ok(!routeFile.includes("to:input"),"Recipient must never come from request input");
const page=read("app/admin/faktura/test/page.js");
const panel=read("app/admin/faktura/test/SplitInvoiceSelfTestClient.js");
const invoices=read("app/admin/faktura/InvoicesClient.js");
assert.ok(page.includes('admin.role!=="owner"'));
assert.ok(panel.includes("window.confirm("));
assert.ok(panel.includes('confirmed:true'));
assert.ok(invoices.includes('href="/admin/faktura/test"'));

let role="owner",preview=false,key="mock-token",blockOrigin=false,mailFails=false;
const deliveries=[];
class MockNextResponse extends Response{
 static json(body,init={}){return Response.json(body,init)}
}
class MockResend{
 constructor(apiKey){assert.equal(apiKey,"mock-token")}
 emails={send:async(message,opts)=>{
  deliveries.push({message,opts});
  return mailFails?{data:null,error:{message:"simulated failure"}}:
   {data:{id:"mock-provider-id"},error:null};
 }}
}
const source=routeFile.replace(/^import .*;\n/gm,"")
 .replace(/^export /gm,"")
 .replace('const {Resend}=await import("resend");','const Resend=MockResend;');
const env={get VERCEL_ENV(){return preview?"preview":"production"},
 get RESEND_API_KEY(){return key}};
const {GET,POST}=new Function("NextResponse","getAdminUser","sameOriginGuard",
 "buildInvoiceDraftPdf","osloDateKey","makeSplitSelfTestDocs",
 "splitSelfTestEmail","SPLIT_SELFTEST_RECIPIENT","MockResend","process",
 source+";return {GET,POST};")(
 MockNextResponse,async()=>({role}),
 ()=>blockOrigin?Response.json({error:"CSRF"},{status:403}):null,
 buildInvoiceDraftPdf,()=>today,makeSplitSelfTestDocs,splitSelfTestEmail,
 SPLIT_SELFTEST_RECIPIENT,MockResend,{env}
);
const previewPdf=part=>GET(new Request("https://example.invalid/api/admin/invoices/selftest?part="+part));
let res=await previewPdf(1);
assert.equal(res.status,200);
assert.match(res.headers.get("content-type"),/application\/pdf/);
assert.match(res.headers.get("cache-control"),/no-store/);
assert.equal(Buffer.from(await res.arrayBuffer()).subarray(0,4).toString(),"%PDF");
res=await previewPdf(2);assert.equal(res.status,200);
res=await previewPdf(3);assert.equal(res.status,400);
role="staff";res=await previewPdf(1);assert.equal(res.status,403);
role="owner";

const request=body=>new Request("https://example.invalid/api/admin/invoices/selftest",{
 method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)});
const action={action:"send-to-company",confirmed:true};
res=await POST(request({...action,confirmed:false}));assert.equal(res.status,400);
res=await POST(request({...action,action:"send-anywhere",to:"outsider@example.invalid"}));assert.equal(res.status,400);
role="staff";res=await POST(request(action));assert.equal(res.status,403);
role="owner";blockOrigin=true;res=await POST(request(action));assert.equal(res.status,403);
blockOrigin=false;preview=true;res=await POST(request(action));assert.equal(res.status,403);
preview=false;key="";res=await POST(request(action));assert.equal(res.status,503);
key="mock-token";assert.equal(deliveries.length,0,"Rejected attempts must not email");
res=await POST(request({...action,to:"outsider@example.invalid"}));
assert.equal(res.status,200);
let responseBody=await res.json();
assert.equal(responseBody.recipient,"post@aadland-service.no");
assert.equal(deliveries.length,1);
assert.equal(deliveries[0].message.to,"post@aadland-service.no");
assert.equal(deliveries[0].message.attachments.length,2);
assert.equal(deliveries[0].opts.idempotencyKey,"invoice-split-selftest/"+today);
res=await POST(request(action));assert.equal(res.status,200);
assert.equal(deliveries[1].opts.idempotencyKey,deliveries[0].opts.idempotencyKey);
mailFails=true;res=await POST(request(action));assert.equal(res.status,502);
assert.equal(deliveries[2].message.to,"post@aadland-service.no");
console.log("Faktura-deling selvtest bestått: ekte PDF-motor med to ugyldige demo-PDF-er, 40/60-summer og MVA, kun eier/CSRF/produksjon, låst intern mottaker og idempotent e-post-mock. Ingen ekte faktura eller e-post.");

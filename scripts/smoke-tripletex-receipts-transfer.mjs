import assert from "node:assert/strict";
import crypto from "node:crypto";
import {readFileSync} from "node:fs";
const read=path=>readFileSync(path,"utf8");
const source=read("lib/tripletexReceiptTransfer.js").replace(/^export /gm,"");
const {normalizeTripletexInbox,tripletexReceiptEmail,tripletexReceiptCsv,tripletexPendingReceipts,tripletexReceiptQueue,DEFAULT_TRIPLETEX_INBOX}=
 new Function(source+";return {normalizeTripletexInbox,tripletexReceiptEmail,tripletexReceiptCsv,tripletexPendingReceipts,tripletexReceiptQueue,DEFAULT_TRIPLETEX_INBOX};")();
assert.equal(DEFAULT_TRIPLETEX_INBOX,"aadlandservice@ebilag.com");
const id="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const file=Buffer.from("%PDF-1.4\nFake test-only invoice bytes\n%%EOF");
const sha=crypto.createHash("sha256").update(file).digest("hex");
const receipt={
 id,supplier_name:"Testbutikk AS",supplier_document_number:"2026-442",
 document_date:"2026-10-14",kind:"purchase",original_document_number:null,
 evidence_reference:"Privat bilagsarkiv",business_purpose:"Arbeidsmateriell",
 vat_groups:{"25":{baseOre:8000,vatOre:2000}},deduction_percent:100,
 base_ore:8000,vat_ore:2000,deductible_vat_ore:2000,voided_at:null
};
const attachment={id:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
 purchase_document_id:id,original_filename:"originalkvittering.pdf",
 mime_type:"application/pdf",file_size:file.length,sha256:sha,
 storage_path:"vat-purchases/"+id+"/test.pdf",uploaded_at:"2026-10-14T12:00:00Z"};
assert.equal(normalizeTripletexInbox("  FirMa+1@EBILAG.COM "),"firma+1@ebilag.com");
for(const invalid of ["", "user@gmail.com", "hello@ebilag.com.evil.com",
 "user@ebilag.com\nBcc:a@b.no","x@y@ebilag.com","other@fake-ebilag.com"])
 assert.equal(normalizeTripletexInbox(invalid),"","Never send to "+invalid);
const email=tripletexReceiptEmail(receipt,attachment,"firma@ebilag.com");
assert.equal(email.to,"firma@ebilag.com");
assert.match(email.subject,/Bilag til Tripletex/);
assert.match(email.text,/IKKE en automatisk bokføring/);
assert.match(email.text,/2026-442/);
assert.match(email.text,/100.00/);
assert.match(email.text,/Aadland bilags-ID/);
const csv=tripletexReceiptCsv([{document:receipt,attachment}]);
assert.ok(csv.startsWith("\uFEFF"));
assert.ok(csv.includes("Testbutikk AS"));
assert.ok(csv.includes("100,00"));
assert.ok(csv.includes("originalkvittering.pdf"));
assert.ok(csv.includes("Ikke overført"));
const hostile=tripletexReceiptCsv([{document:{...receipt,supplier_name:"=CMD('hacked')"},attachment}]);
assert.ok(hostile.includes("'=CMD"),"Prevent CSV formula injection");
const sql=read("supabase/migrations/20261116161500_vat_tripletex_receipt_transfers.sql");
assert.ok(sql.includes("purchase_document_id uuid not null unique"),"Prevent duplicate sends");
assert.ok(sql.includes("row level security"));
assert.ok(sql.includes("revoke all on public.vat_tripletex_receipt_transfers from public,anon,authenticated"));

const route=read("app/api/admin/invoices/tripletex/route.js");
assert.ok(route.includes("sameOriginGuard(req)"));
assert.ok(route.includes('user?.role!=="owner"'));
assert.ok(route.includes('process.env.VERCEL_ENV!=="production"'));
assert.ok(route.includes("crypto.createHash(\"sha256\")"));
assert.ok(route.includes('status:"sending"'));
assert.ok(route.includes('status:"needs_review"'));
assert.ok(route.includes('idempotencyKey:"aadland-tripletex-"'));
assert.ok(route.includes("One-time")||route.includes("unique constraint"));
assert.ok(!route.includes("issue_invoice_draft")&&!route.includes("ledger/voucher"),"Never book a voucher");

let role="owner",originOk=true,production=true,apiKey="fake-key",providerFail=false,providerCalls=0,filesDownloaded=0;
let documents=[{...receipt}],attachments=[{...attachment}],transfers=[];
const listed=table=>table==="vat_purchase_documents"?documents:
 table==="vat_purchase_document_files"?attachments:table==="vat_tripletex_receipt_transfers"?transfers:null;
function tableQuery(table,op="select",data=null){
 const eq=[],is=[];
 let start=0,end=Infinity;
 const q={
  select(){return q;},
  order(){return q;},
  range(a,b){start=a;end=b;return q;},
  eq(k,v){eq.push([k,v]);return q;},
  is(k,v){is.push([k,v]);return q;},
  update(next){return tableQuery(table,"update",next);},
  insert(next){return tableQuery(table,"insert",next);},
  async single(){
   if(op==="insert"){
    const list=listed(table);
    if(!list)return {data:null,error:{message:"bad table"}};
    if(list.some(x=>x.purchase_document_id===data.purchase_document_id))
     return {data:null,error:{code:"23505"}};
    const value={id:"cccccccc-cccc-4ccc-8ccc-cccccccccccc",...data};
    list.push(value);return {data:{id:value.id},error:null};
   }
   return q.maybeSingle();
  },
  async maybeSingle(){
   let list=listed(table);
   assert.ok(list);
   list=list.filter(row=>eq.every(([key,v])=>row[key]===v)&&
    is.every(([key,v])=>v===null?row[key]==null:row[key]===v));
   if(op==="update"){
    for(const row of list)Object.assign(row,data);
    return {data:list[0]?{id:list[0].id}:null,error:null};
   }
   return {data:list[0]||null,error:null};
  },
  then(success,failure){
   let list=listed(table);
   assert.ok(list);
   list=list.filter(row=>eq.every(([key,v])=>row[key]===v)&&
    is.every(([key,v])=>v===null?row[key]==null:row[key]===v));
   if(op==="update")for(const row of list)Object.assign(row,data);
   return Promise.resolve({data:list.slice(start,end+1),error:null}).then(success,failure);
  }
 };
 return q;
}
const database={
 from:table=>tableQuery(table),
 storage:{from:()=>({download:async()=>{filesDownloaded++;return {data:new Blob([file]),error:null}}})}
};
const NextResponse=class extends Response{
 static json(value,init={}){return Response.json(value,init)}
};
class MockResend{
 constructor(key){assert.equal(key,"fake-key")}
 emails={send:async(msg,opts)=>{
  providerCalls++;
  assert.equal(msg.to,"firma@ebilag.com");
  assert.equal(msg.attachments.length,1);
  assert.equal(Buffer.from(msg.attachments[0].content,"base64").toString(),file.toString());
  assert.ok(opts.idempotencyKey.includes(id));
  return providerFail?{data:null,error:{message:"simulated timeout"}}:
   {data:{id:"mock-msg-id"},error:null};
 }};
}
const raw=route.replace(/^import .*;\n/gm,"").replace(/^export const .*;\n/gm,"")
 .replace(/^export async function /gm,"async function ");
const {GET,POST}=new Function("NextResponse","crypto","Resend","getAdminUser","db",
 "sameOriginGuard","vatAttachmentBucket","MAX_VAT_FILE_SIZE",
 "normalizeTripletexInbox","tripletexReceiptEmail","tripletexReceiptCsv","process",
 raw+";return {GET,POST};")(
 NextResponse,crypto,MockResend,async()=>({role}),()=>database,
 ()=>originOk?null:Response.json({error:"Origin mismatch"},{status:403}),
 "aadland-vat-documents",4*1024*1024,
 normalizeTripletexInbox,tripletexReceiptEmail,tripletexReceiptCsv,
 {env:{get VERCEL_ENV(){return production?"production":"preview"},
 get RESEND_API_KEY(){return apiKey}}}
);
const reqGet=(suffix="")=>new Request("https://test.example/api/admin/invoices/tripletex"+suffix);
const reqPost=body=>new Request("https://test.example/api/admin/invoices/tripletex",{
 method:"POST",headers:{origin:"https://test.example","content-type":"application/json"},
 body:JSON.stringify(body)});
const command={action:"send-document",documentId:id,confirmed:true,
 recipient:"firma@ebilag.com",recipientConfirmation:"firma@ebilag.com"};
let response=await GET(reqGet());
assert.equal(response.status,200);
let overview=await response.json();
assert.equal(overview.summary.total,1);
assert.equal(overview.summary.withOriginal,1);
assert.equal(overview.summary.notSent,1);
assert.equal(overview.rows[0].attachment.original_filename,"originalkvittering.pdf");
assert.ok(!JSON.stringify(overview.rows).includes("storage_path"),"Do not expose private storage path");
response=await GET(reqGet("?format=csv"));
assert.equal(response.status,200);
assert.match(response.headers.get("content-type"),/text\/csv/);
assert.match(await response.text(),/Testbutikk AS/);

role="staff";response=await GET(reqGet());assert.equal(response.status,403);
role="owner";originOk=false;response=await POST(reqPost(command));assert.equal(response.status,403);
originOk=true;production=false;response=await POST(reqPost(command));assert.equal(response.status,403);
production=true;apiKey="";response=await POST(reqPost(command));assert.equal(response.status,503);
apiKey="fake-key";
response=await POST(reqPost({...command,confirmed:false}));assert.equal(response.status,400);
response=await POST(reqPost({...command,recipient:"other@gmail.com"}));assert.equal(response.status,400);
response=await POST(reqPost({...command,recipientConfirmation:"wrong@ebilag.com"}));assert.equal(response.status,400);
assert.equal(providerCalls,0,"No send after denied cases");
response=await POST(reqPost(command));
assert.equal(response.status,200);
assert.equal((await response.json()).status,"accepted");
assert.equal(providerCalls,1);assert.equal(filesDownloaded,1);
assert.equal(transfers[0].status,"accepted");
response=await POST(reqPost(command));assert.equal(response.status,409);
assert.equal(providerCalls,1,"Duplicate requests never resend");
overview=await (await GET(reqGet())).json();
assert.equal(overview.summary.acceptedByEmailProvider,1);
assert.equal(overview.preferredRecipient,"firma@ebilag.com");
transfers=[{id:"dddddddd-dddd-4ddd-8ddd-dddddddddddd",purchase_document_id:"eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
 recipient:"other@ebilag.com",status:"accepted"}];
const providerBeforeWrongRecipient=providerCalls;
response=await POST(reqPost(command));
assert.equal(response.status,409,"Block sending to a different destination after the first transfer");
assert.equal(providerCalls,providerBeforeWrongRecipient);
transfers=[];providerFail=true;
response=await POST(reqPost(command));assert.equal(response.status,502);
assert.equal(transfers[0].status,"needs_review");
response=await POST(reqPost(command));assert.equal(response.status,409);
assert.equal(providerCalls,2,"Never retry after ambiguous send");
transfers=[];providerFail=false;
attachments[0]={...attachment,sha256:"a".repeat(64)};
response=await POST(reqPost(command));assert.equal(response.status,409);
assert.equal(transfers.length,0,"Invalid original must not claim or send");
attachments[0]=attachment;
const page=read("app/admin/faktura/mva/tripletex/page.js");
const ui=read("app/admin/faktura/mva/tripletex/TripletexReceiptsClient.js");
const nav=read("app/admin/faktura/mva/InvoiceVatTermClient.js");
assert.ok(page.includes('admin.role!=="owner"'));
assert.ok(ui.includes("window.confirm("));
assert.ok(ui.includes("Start med én kvittering"),"Ask owner to verify first receipt");
assert.ok(ui.includes("Overfør til Tripletex"),"Every pending receipt gets one-click transfer");
assert.ok(ui.includes("confirmedFirstInTripletex"),"Require explicit inbox confirmation");
assert.ok(ui.includes("acceptedByEmailProvider"),"Bulk is gated behind a successful single submission");
assert.ok(ui.includes("tripletexPendingReceipts(rows,firstOnly)"),"Send loop limited to first receipt in trial mode");
assert.ok(ui.includes("summary?.acceptedByEmailProvider>0&&confirmedFirstInTripletex"),
 "Server-success alone must not permit mass send");
assert.ok(ui.includes("recipientConfirmation:recipient,confirmed:true"));
assert.ok(ui.includes("stop.current=true"));
const selected=[{document:receipt,attachment,transfer:null},
 {document:{...receipt,id:"second"},attachment:{...attachment,mime_type:"image/jpeg"},transfer:null},
 {document:{...receipt,id:"sent"},attachment,transfer:{status:"accepted"}},
 {document:{...receipt,id:"pdf-error"},attachment:{...attachment,mime_type:"image/webp"},transfer:null},
 {document:{...receipt,id:"missing"},attachment:null,transfer:null}];
assert.equal(tripletexPendingReceipts(selected).length,2);
assert.equal(tripletexPendingReceipts(selected,true).length,1);
assert.equal(tripletexPendingReceipts(selected,true)[0].document.id,receipt.id);
const classified=tripletexReceiptQueue([...selected,
 {document:{...receipt,id:"unknown"},attachment,
 transfer:{status:"needs_review",recipient:"firma@ebilag.com"}}]);
assert.equal(classified.remaining.length,4,"Only never-attempted receipts appear in pending list");
assert.equal(classified.eligible.length,2,"Only allowed attachments can be sent");
assert.equal(classified.sent.length,1,"Email-accepted receipt is hidden from pending");
assert.equal(classified.needsReview.length,1,"Uncertain sends must be visible but never resent");
assert.ok(!classified.remaining.some(x=>x.document.id==="sent"));
assert.ok(!classified.remaining.some(x=>x.document.id==="unknown"));
assert.ok(ui.includes("remaining.map(row=>"),"Visible queue excludes completed receipts");
assert.ok(ui.includes("needsReview.map(row=>"),"Separate review section for ambiguous sends");
assert.ok(ui.includes("sent.map(row=>"),"History preserves accepted receipts");
assert.ok(ui.includes("documentId:row.document.id"),"Single receipt action sends only selected ID");
assert.ok(ui.includes('recipientConfirmation:recipient,confirmed:true'));
assert.ok(ui.includes("window.confirm("),"Explicit confirmation for real sending");
assert.ok(!ui.includes("setConfirmed("),"No repeated confirmation checkbox");
const accounting=read("app/admin/regnskap/AccountingOverviewClient.js");
assert.ok(accounting.includes("<TripletexReceiptsClient/>"),
 "Regnskap transfer list must expose working send buttons directly");
const quick=read("app/admin/faktura/InvoiceQuickActions.js");
assert.ok(quick.includes('href="/admin/faktura/mva/tripletex#tripletex-fakturaer"'),
 "Outgoing invoice has direct shortcut to separate invoice import");
const tripletexPage=read("app/admin/faktura/mva/tripletex/page.js");
assert.ok(tripletexPage.indexOf("<TripletexReceiptsClient/>")<
 tripletexPage.indexOf("<TripletexSalesClient/>"),
 "Simple receipt transfer must be shown before complex outgoing invoice CSV import");

assert.ok(source.includes("!row.transfer"),"Only new receipts may be selected");
assert.ok(ui.includes('window.localStorage.setItem(addressKey,recipient)'),"Remember non-secret destination");
assert.ok(ui.includes('setLockedRecipient(remembered)'),"Lock previously used company inbox");
assert.ok(route.includes("existingRecipients.data.some(row=>row.recipient!==recipient)"),
 "Do not allow silent change of accounting company");

assert.ok(nav.includes('href="/admin/faktura/mva/tripletex"'));
console.log("Tripletex overføring bestått: 18-bilag-vennlig CSV, eier/CSRF/test-sperre, ekte original-kontrollsum, ingen duplikat, usikker sending låst, status og brukerbekreftelse. Ingen e-post sendt.");

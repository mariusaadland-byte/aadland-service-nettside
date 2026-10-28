import assert from "node:assert/strict";
import crypto from "node:crypto";
import {readFileSync} from "node:fs";

// All storage and database operations below are in-memory mocks. No real attachments.
const helperRaw=readFileSync("lib/vatPurchaseAttachments.js","utf8")
 .replace(/^import .*;\n/gm,"").replace(/^export /gm,"");
const utils=new Function("crypto",helperRaw+
 ";return {vatAttachmentBucket,MAX_VAT_FILE_SIZE,inspectVatAttachment,safeVatAttachmentFilename,vatAttachmentDownloadName};")(crypto);
const bytes=Buffer.from("%PDF-1.7\n1 0 obj << /Type /Catalog >> endobj\n%%EOF\n");
const file={size:bytes.length,type:"application/pdf",name:"testbilag.pdf",
 async arrayBuffer(){return bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.length)}};
assert.equal(utils.vatAttachmentBucket,"aadland-vat-documents");
assert.equal(utils.MAX_VAT_FILE_SIZE,4*1024*1024);
const inspected=utils.inspectVatAttachment(bytes,"application/pdf","testbilag.pdf");
assert.equal(inspected.fileSize,bytes.length);
assert.equal(inspected.filename,"testbilag.pdf");
assert.equal(inspected.sha256,crypto.createHash("sha256").update(bytes).digest("hex"));
assert.throws(()=>utils.inspectVatAttachment(bytes,"image/png","testbilag.png"),/stemmer ikke/);
assert.throws(()=>utils.inspectVatAttachment(bytes,"application/pdf","testbilag.jpg"),/filendelse/);
assert.throws(()=>utils.inspectVatAttachment(Buffer.from("NOT REAL PDF!"),"application/pdf","testbilag.pdf"),/stemmer ikke/);
assert.throws(()=>utils.inspectVatAttachment(Buffer.alloc(utils.MAX_VAT_FILE_SIZE+1), "application/pdf","big.pdf"),/4 MB/);
assert.throws(()=>utils.inspectVatAttachment(bytes,"image/svg+xml","hack.svg"),/Kun PDF/);
assert.equal(utils.safeVatAttachmentFilename("../../original\\bilag.pdf"),"original_bilag.pdf");
assert.equal(utils.vatAttachmentDownloadName('Bilag "faktura".pdf'),"Bilag__faktura_.pdf");
const jpeg=Buffer.from("ffd8ffdb0000000000000000","hex");
assert.equal(utils.inspectVatAttachment(jpeg,"image/jpeg","photo.jpeg").ext,"jpg");
const png=Buffer.from("89504e470d0a1a0a00000000","hex");
assert.equal(utils.inspectVatAttachment(png,"image/png","photo.png").ext,"png");
const webp=Buffer.concat([Buffer.from("RIFF","ascii"),Buffer.alloc(4),Buffer.from("WEBP","ascii"),Buffer.alloc(4)]);
assert.equal(utils.inspectVatAttachment(webp,"image/webp","photo.webp").ext,"webp");

const documentId="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0551";
let role="owner",preview=false,guarded=false,voided=false,record=null;
let uploadError=false,writeError=false,downloadTampered=false,raceRecord=null;
let uploadCount=0,deleteCount=0,insertCount=0;
const objects=new Map();
const db=()=>({
 from(table){
  assert.ok(["vat_purchase_documents","vat_purchase_document_files"].includes(table));
  const q={operation:null,data:null,
   select(){return q;},eq(){return q;},insert(payload){insertCount++;q.operation="insert";q.data=payload;return q;},
   async maybeSingle(){
    if(table==="vat_purchase_documents")return {data:{id:documentId,voided_at:voided?"2026-10-26T10:00:00Z":null},error:null};
    return {data:record,error:null};
   },
   async single(){
    if(writeError)return {data:null,error:{message:"metadata failure"}};
    if(raceRecord){
     // Simulate another upload winning the unique constraint after our
     // initial no-record check, but before our insert.
     record=raceRecord;raceRecord=null;
     return {data:null,error:{code:"23505",message:"already exists"}};
    }
    record={id:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb0551",...q.data,uploaded_at:"2026-10-25T10:00:00Z"};
    return {data:record,error:null};
   }
  };return q;
 },
 storage:{from(bucket){
  assert.equal(bucket,"aadland-vat-documents");
  return {
   async upload(path,content,opts){
    uploadCount++;
    assert.equal(opts.contentType,"application/pdf");assert.equal(opts.upsert,false);
    if(uploadError)return {error:{message:"upload refused"}};
    objects.set(path,Buffer.from(content));return {data:{path},error:null};
   },
   async download(path){
    const content=objects.get(path);if(!content)return {data:null,error:{message:"not found"}};
    const value=downloadTampered?Buffer.concat([content,Buffer.from("malicious")]):content;
    return {data:new Blob([value]),error:null};
   },
   async remove(paths){deleteCount+=paths.length;paths.forEach(x=>objects.delete(x));return {error:null}}
  };
 }}
});
class Response{
 constructor(data,{status=200,headers={}}={}){this.status=status;this.body=data;this.headers=headers;}
 static json(data,{status=200,headers={}}={}){return {status,body:data,headers};}
}
const raw=readFileSync("app/api/admin/invoices/vat-attachments/route.js","utf8")
 .replace(/^import .*;\n/gm,"").replace(/^export const .*;\n/gm,"")
 .replace(/^export async function /gm,"async function ");
const api=new Function("NextResponse","crypto","getAdminUser","db","sameOriginGuard",
 "vatAttachmentBucket","MAX_VAT_FILE_SIZE","inspectVatAttachment",
 "vatAttachmentDownloadName","process",raw+";return {GET,POST};")(
 Response,crypto,async()=>({role,id:"test-owner"}),db,
 ()=>guarded?{status:403}:null,utils.vatAttachmentBucket,utils.MAX_VAT_FILE_SIZE,
 utils.inspectVatAttachment,utils.vatAttachmentDownloadName,
 {env:{get VERCEL_ENV(){return preview?"preview":"production";}}}
);
const url="https://localhost/api/admin/invoices/vat-attachments?documentId="+documentId;
const get=(extra="")=>api.GET({url:url+extra});
const post=(theFile=file)=>api.POST({
 headers:{get:key=>key==="content-length"?String(bytes.length+200):"same-origin"},
 async formData(){return {get:key=>key==="documentId"?documentId:key==="file"?theFile:null}},
 url:"https://localhost/api/admin/invoices/vat-attachments"
});
let result=await get();
assert.equal(result.status,200);assert.equal(result.body.attachment,null);
role="staff";
result=await get();assert.equal(result.status,403);
result=await post();assert.equal(result.status,403);
role="owner";guarded=true;
result=await post();assert.equal(result.status,403);
guarded=false;preview=true;
result=await post();assert.equal(result.status,403);
preview=false;voided=true;
result=await post();assert.equal(result.status,409);
voided=false;uploadError=true;
result=await post();assert.equal(result.status,503);
uploadError=false;writeError=true;
result=await post();assert.equal(result.status,503);
assert.equal(deleteCount,1,"Only failed new upload may be cleaned up");
assert.equal(objects.size,0);
writeError=false;
result=await post();
assert.equal(result.status,201);assert.equal(uploadCount,3);
assert.equal(result.body.attachment.filename,"testbilag.pdf");
assert.equal(record.sha256,inspected.sha256);
result=await post();assert.equal(result.status,200,"Retry of the exact stored file must succeed");
assert.equal(result.body.alreadyUploaded,true);
assert.equal(result.body.attachment.filename,"testbilag.pdf");
assert.equal(uploadCount,3,"Do not store a second copy of the same original");
const differentBytes=Buffer.from("%PDF-1.7\n2 0 obj << /Type /Catalog >> endobj\n%%EOF\n");
const differentFile={size:differentBytes.length,type:"application/pdf",name:"other.pdf",
 async arrayBuffer(){return differentBytes.buffer.slice(differentBytes.byteOffset,differentBytes.byteOffset+differentBytes.length)}};
result=await post(differentFile);
assert.equal(result.status,409,"Do not overwrite an original with a different attachment");
assert.equal(uploadCount,3,"A different file must be rejected before storage");
result=await get();
assert.equal(result.body.attachment.filename,"testbilag.pdf");
assert.equal(JSON.stringify(result.body).includes("storage_path"),false);
result=await get("&download=1");
assert.equal(result.status,200);
assert.equal(result.body.toString("ascii"),bytes.toString("ascii"));
assert.match(result.headers["Content-Disposition"],/attachment;/);
assert.equal(result.headers["X-Content-Type-Options"],"nosniff");
assert.equal(result.headers["Cache-Control"],"private, no-store");
downloadTampered=true;
result=await get("&download=1");
assert.equal(result.status,409,"Modified original cannot be served");
downloadTampered=false;
assert.equal(objects.size,1,"Preserve original object despite rejected or tampered download");
const sql=readFileSync("supabase/migrations/20261025100000_private_vat_purchase_attachments.sql","utf8");
const ui=readFileSync("app/admin/faktura/mva/InputVatRegisterClient.js","utf8");
const attachmentUI=readFileSync("app/admin/faktura/mva/VatOriginalAttachment.js","utf8");
assert.match(sql,/public=false/);
assert.match(sql,/enable row level security/);
assert.match(sql,/protect_vat_purchase_document_file/);
assert.match(sql,/unique references public\.vat_purchase_documents/);
assert.ok(ui.includes("<VatOriginalAttachment"));
assert.ok(attachmentUI.includes("Lagre originalbilag"));
assert.ok(attachmentUI.includes("Last ned originalbilaget sikkert"));
const prior=record;
const priorDelete=deleteCount,priorUploads=uploadCount;
record=null;raceRecord=prior;
result=await post();
assert.equal(result.status,200,"Concurrent identical upload must return the verified stored attachment");
assert.equal(result.body.alreadyUploaded,true);
assert.equal(uploadCount,priorUploads+1,"Concurrent uploads may transiently store a second object");
assert.equal(deleteCount,priorDelete+1,"Discard only the losing uploaded object");
assert.equal(objects.size,1,"Concurrent retry must never leave a second stored original");
record=null;raceRecord={...prior,sha256:"f".repeat(64)};
result=await post();
assert.equal(result.status,409,"A different already-stored original must not be treated as same file");
assert.equal(objects.size,1,"Conflicting concurrent upload must be cleaned up");
record=prior;
console.log("Originalbilag bestått: privat PDF/bilde, filsignatur, 4 MB-grense, SHA-256, eiertilgang, dublettsperre og sikker nedlasting.");

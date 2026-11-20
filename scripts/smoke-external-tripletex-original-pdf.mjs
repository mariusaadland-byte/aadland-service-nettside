import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=path=>readFileSync(path,"utf8");
const api=read("lib/tripletexApi.js").replace(/^import "server-only";\s*/,"").replace(/^export /gm,"");
const {tripletexUploadVoucherAttachment}=new Function(api+
 ";return {tripletexUploadVoucherAttachment};")();
const bytes=Buffer.from("%PDF-1.4\nmock-original-only");
const seen=[];
const fetcher=async(url,options)=>{
 seen.push({url,options});
 return {ok:true,status:201,json:async()=>({value:{id:21}})};
};
const returned=await tripletexUploadVoucherAttachment(333,bytes,"originalfaktura-10035.pdf",
 "test-session","test",{fetcher});
assert.equal(returned.accepted,true);
assert.equal(seen.length,1);
assert.ok(seen[0].url.endsWith("/ledger/voucher/333/attachment"));
assert.equal(seen[0].options.method,"POST");
assert.equal(seen[0].options.headers["Content-Type"],undefined,
 "Browser/Node must supply correct multipart boundary");
const file=seen[0].options.body.get("file");
assert.equal(file.name,"originalfaktura-10035.pdf");
assert.equal(file.type,"application/pdf");
assert.equal(await file.text(),bytes.toString());
await assert.rejects(()=>tripletexUploadVoucherAttachment(0,bytes,
 "originalfaktura-10035.pdf","test-session","test",{fetcher}));
await assert.rejects(()=>tripletexUploadVoucherAttachment(333,Buffer.from("not pdf"),
 "originalfaktura-10035.pdf","test-session","test",{fetcher}));
await assert.rejects(()=>tripletexUploadVoucherAttachment(333,bytes,
 "../../unsafe.pdf","test-session","test",{fetcher}));
assert.equal(seen.length,1,"Invalid input must never reach the network");
const route=read("app/api/admin/invoices/external-register/tripletex/attachment/route.js");
assert.ok(route.includes('user?.role!=="owner"'));
assert.ok(route.includes("sameOriginGuard(req)"));
assert.ok(route.includes('process.env.VERCEL_ENV!=="production"'));
assert.ok(route.includes('body.confirmed!==true||body.checkedTripletex!==true'));
assert.ok(route.includes("crypto.createHash(\"sha256\")"));
assert.ok(route.includes("verifyRemoteInvoice(remote?.value,invoice,imported)"));
assert.ok(route.includes("voucherBefore.attachment?.id"));
assert.ok(route.indexOf('status:"uploading"')<route.indexOf('await tripletexUploadVoucherAttachment('));
assert.ok(route.includes('status:"needs_review"')&&route.includes('status:"confirmed"'));
assert.ok(!route.includes("tripletexCreateUnsentedInvoice"));
assert.ok(!route.includes("tripletexRecordInvoicePayment"));
const ui=read("app/admin/faktura/eksterne/ExternalInvoicePdfAttachmentPanel.js");
const parent=read("app/admin/faktura/eksterne/ExternalInvoiceTripletexPanel.js");
assert.ok(ui.includes('window.confirm('));
assert.ok(ui.includes('checkedTripletex:true'));
assert.ok(ui.includes('data.state!=="not_uploaded"'));
assert.ok(parent.includes('record.status==="confirmed"&&<ExternalInvoicePdfAttachmentPanel'));
const migration=read("supabase/migrations/20261121005000_external_invoice_tripletex_pdf_attachments.sql");
assert.ok(migration.includes("primary key"));
assert.ok(migration.includes("enable row level security"));
assert.ok(migration.includes("revoke all"));
assert.ok(migration.includes("grant select,insert,update")&&migration.includes("service_role"));
console.log("Tripletex original-PDF smoke: kun eier, privat SHA-256-kontroll, riktig eksisterende bilag, multipart, lås før opplasting og ingen duplikatfaktura eller ny betaling.");

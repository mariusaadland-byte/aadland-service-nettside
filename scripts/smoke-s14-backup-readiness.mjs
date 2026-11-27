import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const doc=readFileSync("docs/s14-backup-og-gjenoppretting.md","utf8");
const sql=readFileSync("scripts/s14-backup-inventory.sql","utf8");
for(const s of [
 "RISIKO ÅPEN","Free","IKKE","Storage","databasebackup",
 "20/20","krypter","auth","restore","testprosjekt",
 "Resend","Vipps","Tripletex","gjenopprett","SHA-256"
])assert.ok(doc.includes(s),"S-14-dokumentasjon mangler: "+s);
assert.ok(doc.includes("IKKE kjørt")||doc.includes("IKKE kjørt".toLowerCase())||doc.includes("IKKE kjørt".toUpperCase())||doc.includes("IKKE kjørt".replace("kjørt","utført"))||doc.includes("IKKE en utført databasebackup"));
assert.ok(!/backup (er )?ferdig|gjenoppretting er testet|automatisk backup er aktivert/i.test(doc));
assert.match(sql,/storage\.objects/);
assert.match(sql,/vat_purchase_document_files/);
assert.match(sql,/external_customer_invoices/);
assert.match(sql,/invoice_drafts/);
assert.doesNotMatch(sql,/\b(drop|truncate|delete|insert|update|alter|create|grant|revoke|copy|do)\b/i);
assert.doesNotMatch(sql,/select\s+\*/i);
console.log("S-14 bestått: read-only SQL, sikkerhetskopi er IKKE påstått utført, restoreplan og Storage er eksplisitt.");

import {verifyBackup} from "./s14-verify-backup.mjs";
import {mkdtemp,mkdir,writeFile,rm,symlink} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {createHash} from "node:crypto";
const root=await mkdtemp(join(tmpdir(),"s14-synthetic-"));
try{
 const entries=[];
 for(const name of ["roles.sql","schema.sql","data.sql","storage/aadland-vat-documents/sample.pdf"]){
  const data=Buffer.from("synthetic test "+name);
  if(name.startsWith("storage/"))await mkdir(join(root,"storage/aadland-vat-documents"),{recursive:true});
  await writeFile(join(root,name),data);
  entries.push({path:name,bytes:data.length,sha256:createHash("sha256").update(data).digest("hex")});
 }
 const manifest={version:1,projectRef:"codaywjmjmtvvnzzaaas",snapshotAt:"2026-11-27T10:00:00Z",files:entries,storageCounts:{"aadland-vat-documents":1,"contact-images":0,"product-images":0}};
 const result=await verifyBackup(root,manifest);
 assert.equal(result.verifiedFiles,4);assert.equal(result.restoreVerified,false);
 await assert.rejects(()=>verifyBackup(root,{...manifest,files:entries.slice(1)}));
 await assert.rejects(()=>verifyBackup(root,{...manifest,files:[...entries,entries[0]]}));
 await assert.rejects(()=>verifyBackup(root,{...manifest,files:[...entries,{...entries[0],path:"../outside"}]}));
 await assert.rejects(()=>verifyBackup(root,{...manifest,storageCounts:{...manifest.storageCounts,"aadland-vat-documents":2}}));
 await writeFile(join(root,"data.sql"),Buffer.alloc(entries[2].bytes,0));
 await assert.rejects(()=>verifyBackup(root,manifest),/SHA-256/);
 await rm(join(root,"data.sql"));
 await assert.rejects(()=>verifyBackup(root,manifest),/mangler/);
 await symlink(join(root,"schema.sql"),join(root,"data.sql"));
 await assert.rejects(()=>verifyBackup(root,manifest),/symbolsk/);
 console.log("S14 byte verification: synthetic valid, missing, duplicate, traversal, count, corruption and symlink tests.");
}finally{await rm(root,{recursive:true,force:true});}

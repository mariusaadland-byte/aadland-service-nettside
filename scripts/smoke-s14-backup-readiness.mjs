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

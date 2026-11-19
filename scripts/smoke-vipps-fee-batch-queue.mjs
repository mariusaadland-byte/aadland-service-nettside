import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=path=>readFileSync(path,"utf8");
const src=read("lib/vippsFeeQueue.js").replace(/^export /gm,"");
const {MAX_VIPPS_FEE_BATCH,vippsFeeQueue,feeQueueKey,validVippsFeePreview}=
 new Function(src+";return {MAX_VIPPS_FEE_BATCH,vippsFeeQueue,feeQueueKey,validVippsFeePreview};")();
const row=(date,id,status="not_transferred")=>({
 date,pspReference:id,kind:"trukket",amountOre:103,
 tripletexStatus:status,transferMismatch:false
});
const rows=[
 row("2026-10-23","1711207-20261023","confirmed"),
 row("2026-10-24","1711207-20261024","confirmed"),
 row("2026-11-10","fee-101"),
 row("2026-11-11","fee-102")
];
const ready=vippsFeeQueue({unit:"service",rows,complete:true});
assert.equal(ready.confirmedCount,2);
assert.equal(ready.eligible.length,2);
assert.equal(ready.eligible[0].date,"2026-11-10");
assert.equal(MAX_VIPPS_FEE_BATCH,10);
assert.equal(feeQueueKey(rows[2]),"2026-11-10|fee-101");
assert.equal(vippsFeeQueue({unit:"rental",rows,complete:true}).eligible.length,0);
assert.equal(vippsFeeQueue({unit:"service",rows,complete:false}).eligible.length,0);
assert.equal(vippsFeeQueue({unit:"service",rows,complete:true,unknownEntryTypes:1}).eligible.length,0);
assert.equal(vippsFeeQueue({unit:"service",rows:[
 row("2026-11-10","fee-101"),row("2026-11-10","fee-101")
],complete:true}).eligible.length,0,"duplicates must not enter batch");
assert.equal(vippsFeeQueue({unit:"service",rows:[
 {...row("2026-11-11","fee-102"),transferMismatch:true},
 row("2026-11-12","fee-103","needs_review"),
 {...row("2026-11-13","fee-104"),kind:"korrigering"},
 {...row("2026-11-14","fee-105"),amountOre:-1},
 {...row("2026-11-15","fee-106"),pspReference:""}
],complete:true}).eligible.length,0,"mismatches/corrections/invalid rows are blocked");
const preview={ok:true,ready:true,plan:{amountOre:103},digest:"a".repeat(64),
 customer:{number:10009,name:"Vipps Oppgjørskunde"},
 feeAccounts:[{id:777,number:"7770",name:"Vipps-gebyr"}]};
assert.equal(validVippsFeePreview(rows[2],preview),true);
assert.equal(validVippsFeePreview(rows[2],{...preview,ready:false}),false);
assert.equal(validVippsFeePreview(rows[2],{...preview,previous:{status:"confirmed"}}),false);
assert.equal(validVippsFeePreview(rows[2],{...preview,plan:{amountOre:104}}),false);
assert.equal(validVippsFeePreview(rows[2],{...preview,customer:{number:10008,name:"Other"}}),false);
assert.equal(validVippsFeePreview(rows[2],{...preview,feeAccounts:[
 preview.feeAccounts[0],{id:778,number:7770}]}),false);
const panel=read("app/admin/faktura/mva/tripletex/VippsFeeQueuePanel.js");
assert.ok(panel.includes('action:"record-retained-fee"'));
assert.ok(panel.includes('method:"POST"'));
assert.ok(panel.includes("notImportedPreviously:true"));
assert.ok(panel.includes("window.confirm"));
assert.ok(panel.includes("checked={accepted}"));
assert.ok(panel.includes("if(busy||!prepared?.entries?.length||!accepted)return;"));
assert.ok(panel.includes("for(let i=0;i<list.length;i++)"));
assert.ok(panel.includes("No automatic")||panel.includes("Ingen automatisk"));
assert.ok(!panel.includes("Promise.all(list.map"),"no simultaneous accounting writes");
const page=read("app/admin/faktura/mva/tripletex/VippsSettlementClient.js");
assert.ok(page.includes("<VippsFeeQueuePanel"));
assert.ok(page.includes("feeBatchBusy"));
const api=read("app/api/admin/tripletex/vipps-fees/route.js");
assert.ok(api.includes("acquireVippsAccountingLock"));
assert.ok(api.includes("if(x.old)return"));
assert.ok(api.includes("if(x.digest!==expectedDigest)"));
assert.ok(api.includes('status:"needs_review"'));
assert.ok(api.includes("notImportedPreviously!==true"));
console.log("Vipps gebyrkø: bare nye og sikre poster, maks 10, forhåndssjekk, kontosperre, eksplisitt samtykke, sekvensiell bokføring, stopp ved usikkert utfall.");

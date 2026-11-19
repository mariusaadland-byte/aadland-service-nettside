import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=path=>readFileSync(path,"utf8");
const source=read("lib/vippsPayoutQueue.js").replace(/^export /gm,"");
const {MAX_VIPPS_PAYOUT_BATCH,payoutQueueKey,vippsPayoutQueue,validVippsPayoutPreview}=
 new Function(source+";return {MAX_VIPPS_PAYOUT_BATCH,payoutQueueKey,vippsPayoutQueue,validVippsPayoutPreview};")();
const row=(day,id,status="not_transferred")=>({
 date:day,pspReference:id,amountOre:9800,tripletexStatus:status,
 transferMismatch:false
});
const rows=[
 row("2026-11-13","old-transfer","confirmed"),
 row("2026-11-14","pay-0001"),
 row("2026-11-18","pay-0002"),
 row("2026-11-19","uncertain-1","needs_review")
];
const queue=vippsPayoutQueue({unit:"service",rows,complete:true});
assert.equal(queue.eligible.length,2);
assert.equal(queue.confirmedCount,1);
assert.equal(queue.reviewCount,1);
assert.equal(queue.eligible[0].pspReference,"pay-0001");
assert.equal(payoutQueueKey(rows[1]),"2026-11-14|pay-0001");
assert.equal(MAX_VIPPS_PAYOUT_BATCH,5);
assert.equal(vippsPayoutQueue({unit:"service",rows,complete:false}).eligible.length,0);
assert.equal(vippsPayoutQueue({unit:"rental",rows,complete:true}).eligible.length,0);
assert.equal(vippsPayoutQueue({unit:"service",rows,complete:true,
 unknownEntryTypes:1}).eligible.length,0);
assert.equal(vippsPayoutQueue({unit:"service",rows:[
 row("2026-11-14","pay-0001"),row("2026-11-14","pay-0001")
],complete:true}).eligible.length,0);
assert.equal(vippsPayoutQueue({unit:"service",rows:[
 {...row("2026-11-14","pay-0001"),transferMismatch:true},
 {...row("2026-11-14","pay-0002"),amountOre:0},
 {...row("2026-11-14","pay-0003"),date:"2026-02-30"},
 {...row("2026-11-14","pay-0004"),pspReference:""}
],complete:true}).eligible.length,0);
const preview={
 ok:true,ready:true,digest:"a".repeat(64),
 previous:null,
 customer:{number:10009,name:"Vipps Oppgjørskunde"},
 plan:{payoutId:"pay-0001",payoutDate:"2026-11-14",payoutOre:9800,
  grossOre:10000,feeOre:200,previouslyBookedFeeOre:100,paymentCount:2},
 bankAccounts:[{id:192,number:1920,name:"Bankkonto 1"}],
 feeAccounts:[{id:777,number:7770,name:"Vipps-gebyr"}]
};
assert.equal(validVippsPayoutPreview(rows[1],preview),true);
const invalid=[
 {...preview,previous:{status:"confirmed"}},
 {...preview,ready:false},
 {...preview,plan:{...preview.plan,payoutOre:9801}},
 {...preview,plan:{...preview.plan,grossOre:9999}},
 {...preview,plan:{...preview.plan,previouslyBookedFeeOre:201}},
 {...preview,plan:{...preview.plan,paymentCount:0}},
 {...preview,plan:{...preview.plan,payoutId:"wrong"}},
 {...preview,plan:{...preview.plan,payoutDate:"2026-11-15"}},
 {...preview,customer:{number:10009,name:"Wrong customer"}},
 {...preview,bankAccounts:[]},
 {...preview,bankAccounts:[{id:1,number:1500}]},
 {...preview,feeAccounts:[]},
 {...preview,feeAccounts:[...preview.feeAccounts,{id:778,number:7770}]},
 {...preview,digest:"invalid"}
];
for(const bad of invalid)assert.equal(validVippsPayoutPreview(rows[1],bad),false);
const ui=read("app/admin/faktura/mva/tripletex/VippsPayoutQueuePanel.js");
assert.ok(ui.includes("window.confirm("),"requires final approval");
assert.ok(ui.includes("checked={Boolean(choice.received)}"));
assert.ok(ui.includes("checked={Boolean(choice.notImported)}"));
assert.ok(ui.includes("checked.received&&checked.notImported"));
assert.ok(ui.includes("checked?.bankId")||ui.includes("checked.bankId"));
assert.ok(ui.includes("bankReceived:true,notImportedPreviously:true"));
assert.ok(ui.includes("method:\"POST\""));
assert.ok(ui.includes("for(let i=0;i<confirmation.length;i++)"),"sequential accounting writes only");
assert.ok(!ui.includes("Promise.all(confirmation"),"no parallel accounting writes");
const parent=read("app/admin/faktura/mva/tripletex/VippsSettlementClient.js");
assert.ok(parent.includes("<VippsPayoutQueuePanel"));
assert.ok(parent.includes("payoutBatchBusy"));
assert.ok(parent.includes("externallyDisabled={loading||loadingSaved||feeBatchBusy}"));
const api=read("app/api/admin/tripletex/vipps-transfer/route.js");
assert.ok(api.includes("body.bankReceived!==true"));
assert.ok(api.includes("body.notImportedPreviously!==true"));
assert.ok(api.includes("if(expectedDigest!==x.digest)"));
assert.ok(api.includes("acquireVippsAccountingLock"));
assert.ok(api.includes("reviewVoucherDuplicate"));
assert.ok(api.includes('status:"needs_review"'));
assert.ok(api.includes("tripletex_vipps_settlement_transfers"));
console.log("Vipps bankoppgjørskø: separate bankvalg og mottaksbekreftelser, 5 oppgjør, trygg forhåndskontroll, sekvensiell bokføring og stopp ved usikkert utfall.");

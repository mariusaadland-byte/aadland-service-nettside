import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(p,"utf8");
const api=read("app/api/admin/customers/route.js");
assert.ok(api.includes("sent_at,accepted_at,declined_at,archived_at"));
assert.ok(api.includes("archivedAt:row.archived_at||null"));
const dashboard=read("app/admin/AdminClient.js");
assert.ok(dashboard.includes('quote.status === "sent" && !quote.archivedAt'));
assert.ok(dashboard.includes('.filter((quote) => quote.status === "accepted" && !quote.archivedAt)'));
assert.ok(dashboard.includes('quote.status==="sent"&&!quote.archivedAt'));
const examples=[
 {status:"accepted",archivedAt:"2026-11-20T15:25:55Z",totalOre:10250000},
 {status:"accepted",archivedAt:"2026-11-20T15:26:04Z",totalOre:20687500},
 {status:"sent",archivedAt:"2026-11-20T10:00:00Z",totalOre:120000},
 {status:"accepted",archivedAt:null,totalOre:200000}
];
const approved=examples.filter(q=>q.status==="accepted"&&!q.archivedAt)
 .reduce((sum,q)=>sum+Number(q.totalOre||0),0);
assert.equal(approved,200000,"archived quotes must not pollute dashboard");
assert.equal(examples.filter(q=>q.status==="sent"&&!q.archivedAt).length,0);
assert.equal(examples.filter(q=>q.status==="accepted"&&q.archivedAt)
 .reduce((s,q)=>s+q.totalOre,0),30937500);
console.log("Adminoversikt: arkiverte testtilbud gir ikke feil tilbudsverdi eller varsel; historikk beholdes.");

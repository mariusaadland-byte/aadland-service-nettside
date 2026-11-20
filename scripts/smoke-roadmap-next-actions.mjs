import assert from "node:assert/strict";
import {existsSync,readFileSync} from "node:fs";
const read=path=>readFileSync(path,"utf8");
const source=read("lib/developmentTaskLinks.js").replace(/^export /gm,"");
const {developmentTaskLink,developmentNextTasks}=new Function(source+
 ";return {developmentTaskLink,developmentNextTasks};")();
const tests=[
 ["drawing_builder","/admin/tegning"],
 ["quote_pdf","/admin/tilbud"],
 ["suppliers","/admin/prisliste"],
 ["rental_booking","/admin/utleie/vipps-oppsett"],
 ["vipps","/admin/vipps-oppgjor"],
 ["custom-external-tripletex-paid-20261120","/admin/faktura/eksterne"],
 ["custom-external-ledger-review-20261120","/admin/regnskap"],
 ["custom-tripletex-original-pdf-20261120","/admin/faktura/eksterne"],
 ["custom-external-vat-double-count-20261120","/admin/faktura/mva"],
 ["custom-invoice-issue-email-20261021","/admin/faktura/arkiv"]
];
for(const [id,path] of tests){
 assert.equal(developmentTaskLink(id),path);
 assert.ok(existsSync("app"+path+"/page.js"),"Roadmap must link a real page: "+path);
}
assert.equal(developmentTaskLink("random-unknown-task"),null);
const tasks=[
 {id:"finished",title:"Already done",status:"done",priority:"high",sortOrder:1},
 {id:"low",status:"test",priority:"low",sortOrder:2},
 {id:"a",status:"todo",priority:"high",sortOrder:2},
 {id:"b",status:"test",priority:"high",sortOrder:10},
 {id:"c",status:"progress",priority:"high",sortOrder:50},
 {id:"d",status:"test",priority:"high",sortOrder:30},
 {id:"e",status:"todo",priority:"high",sortOrder:15}
];
assert.deepEqual(developmentNextTasks(tasks,3).map(x=>x.id),["c","b","d"]);
assert.deepEqual(developmentNextTasks(tasks).map(x=>x.id),["c","b","d","a","e"]);
assert.deepEqual(developmentNextTasks([]),[]);
assert.deepEqual(developmentNextTasks(null),[]);
const ui=read("app/admin/utviklingsplan/RoadmapClient.js");
assert.ok(ui.includes("developmentNextTasks(tasks,6)"));
assert.ok(ui.includes("Neste punkter å fullføre"));
assert.ok(ui.includes('aria-label="Neste utviklingsoppgaver"'));
assert.ok(ui.includes("developmentTaskLink(task)"));
assert.ok(ui.includes('id={"roadmap-"+task.id}'));
assert.ok(ui.includes('setFilter("all");setSearch("");setOpenGroup("all")'));
assert.ok(ui.includes("Åpne funksjonen"));
assert.ok(ui.includes("checked={task.status===\"done\"}"));
assert.ok(ui.includes("onChange={e=>updateTask(task,{status:e.target.checked?\"done\":\"test\"})}"),
 "Never auto-complete manual tests by opening a feature link");
const stylesheet=read("app/admin/utviklingsplan/roadmap.module.css");
assert.ok(stylesheet.includes(".nextWork"));
assert.ok(stylesheet.includes(".nextItem"));
assert.ok(stylesheet.includes(".featureLink"));
const api=read("app/api/admin/utviklingsplan/route.js");
assert.ok(api.includes("admin_development_tasks"));
assert.ok(api.includes('user?.role==="owner"'));
assert.ok(api.includes("sameOriginGuard(request)"));
console.log("Utviklingsplan bestått: prioritering, ekte adminlenker, teststatusbevaring, eierbeskyttelse og PC-/mobilsnarveier.");

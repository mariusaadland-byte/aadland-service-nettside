import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=path=>readFileSync(path,"utf8");
const helpers=read("lib/workTimeDeduction.js").replace(/^export /gm,"");
const {parseDeductionHours,formatDeductionHours,netWorkMinutes}=new Function(helpers+
 ";return {parseDeductionHours,formatDeductionHours,netWorkMinutes};")();
const sample=[
 ["0",0],["0,5",30],["1,5",90],["1.5",90],["15",900],
 ["1,25",75],["2",120],["0,25",15],["0,02",1],["",null],
 ["1,5,0",null],["1:30",null],["1,555",null],["-1",null],
 ["not a number",null],["1667",null]
];
for(const [entered,expected] of sample)assert.equal(parseDeductionHours(entered),expected,
 "Wrong deducted minutes for "+entered);
assert.equal(formatDeductionHours(90),"1,5");
assert.equal(formatDeductionHours(900),"15");
assert.equal(formatDeductionHours(30),"0,5");
assert.equal(formatDeductionHours(75),"1,25");
assert.equal(netWorkMinutes(180,parseDeductionHours("1,5")),90);
assert.equal(netWorkMinutes(960,parseDeductionHours("15")),60);
for(const x of [0,1,15,30,60,75,90,120,900,99999]){
 assert.equal(parseDeductionHours(formatDeductionHours(x)),x,
 "Stored minute amounts should roundtrip correctly through hours input: "+x);
}
const ui=read("app/admin/arbeidsklokke/WorkClockClient.js");
assert.ok(ui.includes('deductedHours:"0"'),"New drafts use hours, not minutes");
assert.ok(ui.includes("deductedHours:formatDeductionHours(entry.deductedMinutes||0)"));
assert.ok(ui.includes("parseDeductionHours(manual.deductedHours)"));
assert.ok(ui.includes("parseDeductionHours(editing.deductedHours)"));
assert.ok((ui.match(/Minustid \(timer,/g)||[]).length===2,
 "Both manual creation and old registration editing need a decimal-hours label");
assert.ok((ui.match(/inputMode="decimal"/g)||[]).length>2,
 "iPhone inputs should show the numeric keyboard supporting comma decimals");
assert.ok(ui.includes('deductedMinutes,'),
 "The API must continue to receive stored whole minutes for accounting");
assert.ok(!ui.includes('Minustid (minutter)'));
assert.ok(ui.includes('"Lunsj/minustid (timer)"'),
 "Excel export must declare the updated unit");
assert.ok(ui.includes('((Number(entry.deductedMinutes)||0)/60).toFixed(2)'),
 "Excel export should contain fractional hours rather than minutes");
assert.ok(ui.includes("formatDeductionHours(active.deductedMinutes||0)"),
 "Show running minus total in the same unit as edits");
assert.ok(ui.includes("formatDeductionHours(entry.deductedMinutes)"),
 "Existing time entries display minus time in hours");
assert.ok(ui.includes('onClick={()=>lunch(30)}'),
 "One-click 30-minute lunch must remain unchanged");
const route=read("app/api/admin/work-time/route.js");
assert.ok(route.includes("validDeductedMinutes(body.deductedMinutes"),
 "Server still validates whole-minute deductible amounts");
assert.ok(route.includes('delta!==30&&delta!==-30'),
 "Automatic lunch deduction stays a 30-minute operation");
console.log("Minustid i desimaltimer bestått: 1,5=90 min, 15=900 min, 0,5=30 min, iPhone, redigering, oversikt, Excel og lunsjknapp.");

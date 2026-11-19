import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=path=>readFileSync(path,"utf8");
const source=read("lib/vippsReportCache.js").replace(/^export /gm,"");
const {dayBefore,cacheDaysToSync,chunkVippsDays,cacheDailyComparison}=
 new Function(source+";return {dayBefore,cacheDaysToSync,chunkVippsDays,cacheDailyComparison};")();

const dayList=["2026-10-20","2026-11-01","2026-11-05",
 "2026-11-10","2026-11-11","2026-11-17","2026-11-18"];
const now="2026-11-19T19:00:00.000Z",yesterday="2026-11-18";
const saved=[
 {report_date:"2026-10-20",checked_at:"2026-10-21T08:00:00.000Z",fingerprint:"old"},
 {report_date:"2026-11-01",checked_at:"2026-11-02T08:00:00.000Z",fingerprint:"old"},
 {report_date:"2026-11-05",checked_at:"2026-11-18T08:00:00.000Z",fingerprint:"start-window"},
 {report_date:"2026-11-11",checked_at:"2026-11-19T18:58:00.000Z",fingerprint:"fresh"},
 {report_date:"2026-11-17",checked_at:"2026-11-19T18:00:00.000Z",fingerprint:"stale"},
 {report_date:"2026-11-18",checked_at:"2026-11-19T18:59:00.000Z",fingerprint:"fresh"}
];
assert.equal(dayBefore("2026-11-18",13),"2026-11-05");
assert.equal(dayBefore("2024-03-01",1),"2024-02-29");
assert.deepEqual(cacheDaysToSync(dayList,saved,yesterday,now),[
 "2026-11-05","2026-11-10","2026-11-17"
],"Only recently stale or missing days should be requested");
assert.deepEqual(cacheDaysToSync(["2026-10-20","2026-11-01"],saved,yesterday,now),[],
 "Historical cache should be reused without new Vipps API calls");
assert.deepEqual(cacheDaysToSync(["2026-10-19"],saved,yesterday,now),["2026-10-19"],
 "A missing old day must still be fetched");
assert.deepEqual(cacheDaysToSync(["2026-11-18"],saved,yesterday,now),[],
 "Recently verified day must not be fetched again immediately");
assert.throws(()=>cacheDaysToSync(["2026-11-20"],saved,yesterday,now),/fremtidig/);
assert.throws(()=>cacheDaysToSync(["2026-11-18"],[saved[5],saved[5]],yesterday,now),
 /ikke entydige/);
assert.deepEqual(chunkVippsDays([
 "2026-11-01","2026-11-02","2026-11-03","2026-11-04",
 "2026-11-05","2026-11-06","2026-11-07","2026-11-08"
]),[
 ["2026-11-01","2026-11-02","2026-11-03","2026-11-04","2026-11-05","2026-11-06","2026-11-07"],
 ["2026-11-08"]
]);
assert.throws(()=>chunkVippsDays(["2026-11-05","2026-11-03"]),/Ugyldig/);
assert.deepEqual(cacheDailyComparison(saved,[
 {report_date:"2026-11-01",fingerprint:"old"},
 {report_date:"2026-11-05",fingerprint:"corrected"},
 {report_date:"2026-11-12",fingerprint:"new"}
]),{newDays:1,changedDays:1,unchangedDays:1});
const route=read("app/api/admin/tripletex/vipps-settlement/cache/route.js");
assert.ok(route.includes('user?.role!=="owner"'),"Both routes must restrict owner access");
assert.ok(route.includes("sameOriginGuard(req)"),"Writes must use CSRF origin guard");
assert.ok(route.includes("vippsRange(from,to,maxStoredDays)"),"Full year is read from the DB");
assert.ok(route.includes("cacheDaysToSync(days,existing,localDay(),stamp())"),
 "Only missing / recent dates are fetched");
assert.ok(route.includes('vippsSettlementEntries(unit,match.ledgerId,"funds",day)'));
assert.ok(route.includes('vippsSettlementEntries(unit,match.ledgerId,"fees",day)'));
assert.ok(route.includes('upsert(fetched,{onConflict:"unit,ledger_id,report_date"})'),
 "Daily snapshots must replace an old day, not add its amounts again");
assert.ok(route.includes("cacheDailyComparison(existing,fetched)"));
assert.ok(route.includes("newDays:0,changedDays:0"),"No-op sync must report zero changed days");
assert.ok(route.includes("transferStatuses(s,unit,from,to)"),
 "Read existing Tripletex transfer claims for badges");
assert.ok(!route.includes("tripletexCreateVippsSettlementVoucher")&&
 !route.includes("tripletexRecordInvoicePayment"),
 "Fetching reports must never post accounting entries");
const migration=read("supabase/migrations/20261119205100_vipps_report_daily_cache.sql");
assert.ok(migration.includes("primary key (unit,ledger_id,report_date)"));
assert.ok(migration.includes("enable row level security"));
assert.ok(migration.includes("revoke all on public.vipps_report_daily_cache from anon,authenticated"));
const ui=read("app/admin/faktura/mva/tripletex/VippsSettlementClient.js");
assert.ok(ui.includes('Sjekk hva som er nytt fra Vipps'));
assert.ok(ui.includes('Vis lagrede rapporter'));
assert.ok(ui.includes('chunkVippsDays(before.checkDays||[])'));
assert.ok(ui.includes('setCacheInfo(after);setResult(asReport(after));'));
assert.ok(ui.includes('Overføring må kontrolleres – ikke prøv på nytt'));
assert.ok(ui.includes('row.tripletexStatus==="not_transferred"'));
assert.ok(ui.includes('Dager som allerede er lagret'));
console.log("Vipps inkrementell lagring bestått: gamle dager gjenbrukes, manglende/nylige sjekkes, korrigering erstatter dagsrapporten, status fra Tripletex skilles fra hentestatus og ingen bilag sendes.");

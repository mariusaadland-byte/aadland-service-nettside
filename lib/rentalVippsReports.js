import "server-only";
import {db} from "./supabase";
import {vippsUnitConfig} from "./vippsConfig";
import {vippsSettlementLedgers,vippsSettlementEntries} from "./vippsClient";
import {vippsRange,normalizeReportEntries} from "./vippsSettlementReconcile";
import {cacheDaysToSync,dayBefore} from "./vippsReportCache";
import {rentalReportLedger,rentalReportDay,rentalReportPeriod} from "./rentalVippsReports.mjs";
export const rentalReportsEnabled=()=>process.env.VERCEL_ENV==="production"&&process.env.AADLAND_RENTAL_REPORT_CACHE_ENABLED==="true";
export const reportToday=()=>new Intl.DateTimeFormat("sv-SE",{timeZone:"Europe/Oslo",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
function config(){const r=vippsUnitConfig("rental"),s=vippsUnitConfig("service");if(!r.configured||r.environment!=="production"||!r.values.msn||r.values.msn===s.values.msn)throw Error("CONFIG");return {msn:r.values.msn,serviceMsn:s.values.msn};}
async function cached(s,days,columns){
 const r=await s.from("rental_vipps_report_days").select(columns,{count:"exact"}).gte("report_date",days[0]).lte("report_date",days.at(-1)).order("report_date").limit(days.length+1);
 if(r.error||!Array.isArray(r.data)||r.count!==r.data.length||r.data.length>days.length)throw Error("CACHE");return r.data;
}
export async function readRentalReports(from,to){
 if(!rentalReportsEnabled())return {status:"disabled"};
 const days=vippsRange(from,to,31);if(!days||to>=reportToday())return {status:"invalid"};
 const s=db();if(!s)return {status:"unconfirmed"};
 const {msn}=config(),rows=await cached(s,days,"report_date,msn,ledger_id,funds,fees,fingerprint,checked_at");
 const result=rentalReportPeriod(days,rows,msn);return result?{status:"ok",from,to,...result}:{status:"unconfirmed"};
}
export async function syncRentalReports(from,to){
 if(!rentalReportsEnabled())return {status:"disabled"};
 const days=vippsRange(from,to,7),today=reportToday();if(!days||to>=today)return {status:"invalid"};
 const s=db();if(!s)return {status:"unconfirmed"};
 const {msn,serviceMsn}=config(),ledger=rentalReportLedger(await vippsSettlementLedgers("rental"),msn,serviceMsn);
 if(!ledger)return {status:"review"};
 const rows=await cached(s,days,"report_date,msn,ledger_id,checked_at");
 if(rows.some(r=>r.msn!==msn||r.ledger_id!==ledger))return {status:"review"};
 const pending=cacheDaysToSync(days,rows,dayBefore(today),new Date().toISOString()),results=[];
 for(const day of pending){
  const started=new Date().toISOString();
  try{
   const [funds,fees]=await Promise.all([vippsSettlementEntries("rental",ledger,"funds",day),vippsSettlementEntries("rental",ledger,"fees",day)]);
   const d=rentalReportDay(day,normalizeReportEntries(funds,"funds"),normalizeReportEntries(fees,"fees"));if(!d)throw Error("REPORT");
   const r=await s.rpc("draft_rental_report_store",{p_msn:msn,p_ledger:ledger,p_day:day,p_funds:d.funds,p_fees:d.fees,p_digest:d.fingerprint,p_started:started});
   if(r.error||!["stored","existing"].includes(r.data))throw Error("STORE");results.push({day,status:r.data});
  }catch{results.push({day,status:"unconfirmed"});}
 }
 return {status:results.some(x=>x.status==="unconfirmed")?"partial":"ok",results,skipped:days.length-pending.length};
}

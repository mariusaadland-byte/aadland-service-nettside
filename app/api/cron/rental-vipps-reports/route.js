import {NextResponse} from "next/server";
import {cronGuard} from "../../../../lib/cronAuth";
import {syncRentalReports,reportToday,rentalReportsEnabled} from "../../../../lib/rentalVippsReports";
import {dayBefore} from "../../../../lib/vippsReportCache";
export const runtime="nodejs";
export const maxDuration=60;
// Not scheduled in vercel.json yet. Requires explicit rollout approval.
export async function GET(req){
 const guard=cronGuard(req);if(guard)return guard;
 if(!rentalReportsEnabled()||process.env.AADLAND_RENTAL_REPORT_CRON_ENABLED!=="true")return NextResponse.json({status:"disabled"},{headers:{"Cache-Control":"no-store"}});
 try{const today=reportToday(),r=await syncRentalReports(dayBefore(today,3),dayBefore(today,1));return NextResponse.json(r,{status:r.status==="ok"?200:503,headers:{"Cache-Control":"no-store"}});}catch{return NextResponse.json({status:"unconfirmed"},{status:503,headers:{"Cache-Control":"no-store"}});}
}

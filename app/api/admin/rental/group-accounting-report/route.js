import {NextResponse} from "next/server";
import {getAdminUser} from "../../../../../lib/auth";
import {sameOriginGuard} from "../../../../../lib/requestGuard";
import {rateLimitValue} from "../../../../../lib/rateLimit";
import {ownerGroupArchive,groupArchiveEnabled} from "../../../../../lib/groupOrderArchive";
import {vippsUnitConfig} from "../../../../../lib/vippsConfig";
import {vippsSettlementLedgers,vippsSettlementEntries} from "../../../../../lib/vippsClient";
import {vippsRange,matchingLedger,normalizeReportEntries} from "../../../../../lib/vippsSettlementReconcile";
import {rentalReportReview} from "../../../../../lib/rentalGroupAccounting.mjs";
import {rentalUnitId} from "../../../../../lib/rentalUnitQr.mjs";
export const runtime="nodejs";
export const maxDuration=60;
const reply=(body,status=200)=>NextResponse.json(body,{status,headers:{"Cache-Control":"private, no-store"}});
export async function POST(req){
 if(!groupArchiveEnabled()||process.env.AADLAND_GROUP_ACCOUNTING_REPORT_ENABLED!=="true")return reply({status:"disabled"},503);
 const origin=sameOriginGuard(req);if(origin)return origin;
 const user=await getAdminUser();if(user?.role!=="owner")return reply({status:"forbidden"},403);
 const limited=await rateLimitValue(user.id,{scope:"rental-group-accounting-report",max:5,windowSeconds:300,requireExplicitAllowance:true});if(limited)return limited;
 const len=Number(req.headers.get("content-length"));if(!Number.isFinite(len)||len<=0||len>4096)return reply({status:"invalid"},400);
 try{
 const body=await req.json(),days=vippsRange(body?.from,body?.to,7);
 const today=new Intl.DateTimeFormat("sv-SE",{timeZone:"Europe/Oslo",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
 if(!rentalUnitId(body?.groupId)||!days||days.some(d=>d>=today))return reply({status:"invalid"},400);
 const data=await ownerGroupArchive(body.groupId),invoice=data?.invoice;
 if(!data?.accounting.captureRecorded||!invoice?.paymentReference||!invoice?.pspReference)return reply({status:"review"},409);
 const config=vippsUnitConfig("rental");if(!config.configured||config.environment!=="production")return reply({status:"disabled"},503);
 const ledger=matchingLedger(await vippsSettlementLedgers("rental"),config.values.msn);if(!ledger.ok)return reply({status:"unconfirmed"},409);
 const funds=[],fees=[];
 for(const day of days){
 const [a,b]=await Promise.all([vippsSettlementEntries("rental",ledger.ledgerId,"funds",day),vippsSettlementEntries("rental",ledger.ledgerId,"fees",day)]);
 funds.push(...normalizeReportEntries(a,"funds"));fees.push(...normalizeReportEntries(b,"fees"));
 }
 const review=rentalReportReview({reference:invoice.paymentReference,pspReference:invoice.pspReference,expectedOre:invoice.grossOre,funds,fees});
 return review?reply({...review,from:body.from,to:body.to}):reply({status:"review"},409);
 }catch{return reply({status:"unconfirmed"},503);}
}

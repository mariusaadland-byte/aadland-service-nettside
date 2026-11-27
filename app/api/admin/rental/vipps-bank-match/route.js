import {NextResponse} from "next/server";
import sharp from "sharp";
import {getAdminUser} from "../../../../../lib/auth";
import {sameOriginGuard} from "../../../../../lib/requestGuard";
import {rateLimitValue} from "../../../../../lib/rateLimit";
import {db} from "../../../../../lib/supabase";
import {vippsUnitConfig} from "../../../../../lib/vippsConfig";
import {rentalReportsEnabled,reportToday} from "../../../../../lib/rentalVippsReports";
import {bankMatchInput,payoutFromReport} from "../../../../../lib/rentalBankReview.mjs";
import {bankImageDigest} from "../../../../../lib/groupBankEvidence.mjs";
export const runtime="nodejs";
const reply=(body,status=200)=>NextResponse.json(body,{status,headers:{"Cache-Control":"private, no-store"}});
export async function POST(req){
 if(!rentalReportsEnabled()||process.env.AADLAND_RENTAL_BANK_MATCH_ENABLED!=="true")return reply({status:"disabled"},503);
 const guard=sameOriginGuard(req);if(guard)return guard;
 const user=await getAdminUser();if(user?.role!=="owner")return reply({status:"forbidden"},403);
 const limited=await rateLimitValue(user.id,{scope:"rental-bank-match",max:10,windowSeconds:300,requireExplicitAllowance:true});if(limited)return limited;
 const len=Number(req.headers.get("content-length"));if(!Number.isFinite(len)||len<=0||len>3*1024*1024+65536)return reply({status:"invalid"},400);
 try{
 const form=await req.formData(),file=form.get("file"),b=bankMatchInput({reportDate:form.get("reportDate"),reportDigest:form.get("reportDigest"),pspReference:form.get("pspReference"),bankDate:form.get("bankDate"),bankReference:form.get("bankReference"),amountOre:Number(form.get("amountOre")),confirmed:form.get("confirmed")==="true"},reportToday());
 if(!b||!file||typeof file.arrayBuffer!=="function"||file.size>3*1024*1024||!["image/jpeg","image/png","image/webp"].includes(file.type))return reply({status:"invalid"},400);
 const s=db(),config=vippsUnitConfig("rental");if(!s||!config.configured||config.environment!=="production"||config.values.msn===vippsUnitConfig("service").values.msn)return reply({status:"disabled"},503);
 const r=await s.from("rental_vipps_report_days").select("*").eq("report_date",b.reportDate).maybeSingle(),q=payoutFromReport(r.data,b.pspReference);
 if(r.error||!q||r.data.msn!==config.values.msn||q.reportDigest!==b.reportDigest||q.amountOre!==b.amountOre)return reply({status:"review"},409);
 const image=sharp(Buffer.from(await file.arrayBuffer()),{limitInputPixels:20000000,failOn:"warning",animated:false}),meta=await image.metadata();
 if(!["jpeg","png","webp"].includes(meta.format)||meta.pages>1||file.type!=="image/"+meta.format)return reply({status:"invalid"},400);
 const clean=await image.rotate().resize({width:2400,height:2400,fit:"inside",withoutEnlargement:true}).flatten({background:"#ffffff"}).jpeg({quality:92}).toBuffer(),proof=bankImageDigest(clean);
 if(!proof)return reply({status:"invalid"},400);
 const out=await s.rpc("draft_rental_bank_match",{p_day:b.reportDate,p_digest:b.reportDigest,p_msn:r.data.msn,p_ledger:r.data.ledger_id,p_psp:b.pspReference,p_amount:b.amountOre,p_bank_day:b.bankDate,p_bank_ref:b.bankReference,p_proof:proof,p_bytes:"\\x"+clean.toString("hex"),p_actor:user.id});
 return out.error?reply({status:"unconfirmed"},503):reply({status:out.data});
 }catch{return reply({status:"unconfirmed"},503);}
}

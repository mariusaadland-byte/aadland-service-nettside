import {NextResponse} from "next/server";
import sharp from "sharp";
import {getAdminUser} from "../../../../../lib/auth";
import {sameOriginGuard} from "../../../../../lib/requestGuard";
import {rateLimitValue} from "../../../../../lib/rateLimit";
import {db} from "../../../../../lib/supabase";
import {bankEvidenceInput,bankImageDigest,BANK_IMAGE_MAX} from "../../../../../lib/groupBankEvidence.mjs";
export const runtime="nodejs";
const reply=(body,status=200)=>NextResponse.json(body,{status,headers:{"Cache-Control":"private, no-store"}});
export async function POST(req){
 if(process.env.VERCEL_ENV!=="production"||process.env.AADLAND_GROUP_BANK_EVIDENCE_ENABLED!=="true")return reply({status:"disabled"},503);
 const origin=sameOriginGuard(req);if(origin)return origin;
 const user=await getAdminUser();if(user?.role!=="owner")return reply({status:"forbidden"},403);
 const limited=await rateLimitValue(user.id,{scope:"group-bank-evidence",max:10,windowSeconds:300,requireExplicitAllowance:true});if(limited)return limited;
 const len=Number(req.headers.get("content-length"));if(!Number.isFinite(len)||len<=0||len>3*1024*1024+65536)return reply({status:"invalid"},400);
 try{
 const form=await req.formData(),file=form.get("file"),input=bankEvidenceInput({groupId:form.get("groupId"),kind:form.get("kind"),reference:form.get("reference"),amountOre:Number(form.get("amountOre")),requestId:form.get("requestId")});
 if(!input||!file||typeof file.arrayBuffer!=="function"||file.size>3*1024*1024||!["image/jpeg","image/png","image/webp"].includes(file.type))return reply({status:"invalid"},400);
 const bytes=Buffer.from(await file.arrayBuffer()),image=sharp(bytes,{limitInputPixels:20000000,failOn:"warning",animated:false}),meta=await image.metadata();
 if(!["jpeg","png","webp"].includes(meta.format)||meta.pages>1||file.type!=="image/"+meta.format)return reply({status:"invalid"},400);
 const clean=await image.rotate().resize({width:2400,height:2400,fit:"inside",withoutEnlargement:true}).flatten({background:"#ffffff"}).jpeg({quality:92}).toBuffer(),digest=bankImageDigest(clean);
 if(!digest)return reply({status:"invalid"},400);
 const s=db();if(!s)return reply({status:"unconfirmed"},503);
 const r=await s.rpc("draft_group_bank_evidence_store",{p_group:input.groupId,p_kind:input.kind,p_digest:digest,p_reference:input.reference,p_amount:input.amountOre,p_request:input.requestId,p_actor:user.id,p_bytes:"\\x"+clean.toString("hex")});
 if(r.error||!["stored","existing"].includes(r.data))return reply({status:"unconfirmed"},409);
 return reply({status:r.data,digest,size:clean.length});
 }catch{return reply({status:"unconfirmed"},503);}
}

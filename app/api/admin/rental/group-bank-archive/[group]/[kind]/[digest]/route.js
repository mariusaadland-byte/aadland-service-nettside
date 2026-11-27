import {getAdminUser} from "../../../../../../../../lib/auth";
import {db} from "../../../../../../../../lib/supabase";
import {rateLimitValue} from "../../../../../../../../lib/rateLimit";
import {rentalUnitId} from "../../../../../../../../lib/rentalUnitQr.mjs";
import {groupArchiveEnabled} from "../../../../../../../../lib/groupOrderArchive";
import {bankArchiveBytes} from "../../../../../../../../lib/groupOrderArchive.mjs";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const headers={"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff","Content-Security-Policy":"default-src 'none'; sandbox"};
const fail=(status=404)=>new Response(null,{status,headers});
export async function GET(_req,{params}){
 if(!groupArchiveEnabled())return fail();
 const {group,kind,digest}=await params;
 if(!rentalUnitId(group)||!["deposit","record_refund"].includes(kind)||! /^[a-f0-9]{64}$/.test(digest))return fail();
 try{
 const user=await getAdminUser();if(user?.role!=="owner")return fail();
 const limited=await rateLimitValue(user.id,{scope:"group-bank-archive",max:30,windowSeconds:300,requireExplicitAllowance:true});if(limited)return fail(limited.status===429?429:503);
 const s=db();if(!s)return fail(503);
 const r=await s.from("rental_group_bank_evidence").select("group_id,kind,digest,image_bytes").eq("group_id",group).eq("kind",kind).eq("digest",digest).maybeSingle();
 if(r.error)return fail(503);if(!r.data)return fail();
 const bytes=bankArchiveBytes(r.data,group,kind,digest);if(!bytes)return fail(503);
 const audit=await s.from("rental_group_bank_download_audit").insert({group_id:group,kind,digest,actor_id:user.id});if(audit.error)return fail(503);
 return new Response(bytes,{status:200,headers:{...headers,"Content-Type":"image/jpeg","Content-Disposition":'attachment; filename="Aadland-'+kind+'-'+digest.slice(0,16)+'.jpg"'}});
 }catch{return fail(503);}
}

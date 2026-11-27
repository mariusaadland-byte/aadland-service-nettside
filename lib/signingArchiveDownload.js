import "server-only";
import {evidenceKey,signingArchiveEnabled} from "./signingArchiveConfig";
import {db} from "./supabase";
import {getAdminUser} from "./auth";
import {getCustomerUserId} from "./customer-auth";
import {rateLimitValue} from "./rateLimit";
import {rentalUnitId} from "./rentalUnitQr.mjs";
import {archiveAccess,archiveDocument,checkedEvidence,buildEvidencePdf,archiveHeaders} from "./signingArchiveDownload.mjs";
const fail=(status=404)=>new Response(null,{status,headers:{"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}});
export async function signingArchiveDownload({mode,id,kind}){
 // Deliberate double gate: archive grants and integration tests are not complete.
 if(!signingArchiveEnabled())return fail();
 if(!rentalUnitId(id)||!["avtale","bevis"].includes(kind))return fail();
 try{
  let actor;
  if(mode==="owner"){const user=await getAdminUser();if(user?.role!=="owner")return fail();actor={kind:"owner",id:user.id};}
  else if(mode==="customer"){const customerId=await getCustomerUserId();if(!customerId)return fail();actor={kind:"customer",id:customerId};}
  else return fail();
  const rate=await rateLimitValue(actor.kind+":"+actor.id,{scope:"aadland-signing-download",max:30,windowSeconds:300,requireExplicitAllowance:true});
  if(rate)return fail(rate.status===429?429:503);
  const s=db();if(!s)return fail(503);
  let q=s.from("aadland_agreements").select("id,group_id,customer_user_id,revision,document_bytes,document_digest,quote_digest,terms_version").eq("id",id);
  if(mode==="customer")q=q.eq("customer_user_id",actor.id);
  const {data:a,error}=await q.maybeSingle();if(error)return fail(503);if(!a)return fail();
  const g=await s.from("rental_order_groups").select("id,customer_user_id").eq("id",a.group_id).maybeSingle();
  if(g.error)return fail(503);if(!archiveAccess({actor,agreement:a,group:g.data}))return fail();
  const bytes=archiveDocument(a);if(!bytes)return fail(503);
  let output=bytes;
  if(kind==="bevis"){
   const e=await s.from("aadland_signing_evidence").select("agreement_id,challenge_id,evidence_text,evidence_seal,key_id,signed_at").eq("agreement_id",a.id).maybeSingle();
   if(e.error)return fail(503);if(!e.data)return fail();
   const key=evidenceKey(e.data.key_id);
   const evidence=checkedEvidence({agreement:a,record:e.data,key});if(!evidence)return fail(503);
   output=buildEvidencePdf({agreement:a,evidence});
  }
  // Log release authorization, not proof that browser saved the file.
  const audit=await s.from("aadland_signing_download_audit").insert({agreement_id:a.id,actor_id:actor.id,actor_kind:actor.kind,document_kind:kind});
  if(audit.error)return fail(503);
  return new Response(output,{status:200,headers:archiveHeaders(a.id,kind)});
 }catch{return fail(503);}
}

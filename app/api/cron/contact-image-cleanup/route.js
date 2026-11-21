import {NextResponse} from "next/server";
import {cronGuard} from "../../../../lib/cronAuth";
import {db} from "../../../../lib/supabase";

export const runtime="nodejs";
export const maxDuration=60;
const bucket="contact-images";
const prefix="private-image:contact-images:";
const pathPattern=/^contact\/[0-9]{4}-[0-9]{2}-[0-9]{2}\/[0-9a-f-]{36}\.(?:jpg|png|webp)$/i;
const json=(data,status=200)=>NextResponse.json(data,{status,headers:{"Cache-Control":"no-store"}});

// Anonymous clients cannot remove anything. This server-only job deletes
// only photos that were never bound to a submitted contact request, and only
// after the proof could no longer be valid for order submission (1h vs 24h).
export async function GET(req){
 const denied=cronGuard(req);if(denied)return denied;
 if(process.env.VERCEL_ENV!=="production")return json({error:"Opprydding bare i produksjon."},403);
 const s=db();if(!s)return json({error:"Databasen mangler."},503);
 const cutoff=new Date(Date.now()-24*60*60*1000).toISOString();
 const {data,error}=await s.from("contact_image_uploads")
  .select("storage_path,created_at,state")
  .eq("state","pending").lt("created_at",cutoff)
  .order("created_at",{ascending:true}).limit(15);
 if(error||!Array.isArray(data))return json({error:"Kunne ikke kontrollere foreldreløse bilder."},503);
 let removed=0,review=0,linked=0,skipped=0;
 for(const row of data){
  const path=String(row.storage_path||"");
  if(!pathPattern.test(path)){skipped++;continue;}
  const claimed=await s.from("contact_image_uploads")
   .update({state:"cleaning",claimed_for_cleanup_at:new Date().toISOString(),
    updated_at:new Date().toISOString()})
   .eq("storage_path",path).eq("state","pending").lt("created_at",cutoff)
   .select("storage_path").maybeSingle();
  if(claimed.error){review++;console.error("CONTACT CLEANUP CLAIM ERROR");continue;}
  if(!claimed.data){skipped++;continue;}
  const hold=async()=>{
   const result=await s.from("contact_image_uploads")
    .update({state:"cleanup_review",updated_at:new Date().toISOString()})
    .eq("storage_path",path).eq("state","cleaning");
   if(result.error)console.error("CONTACT CLEANUP STATUS HOLD ERROR");
   review++;
  };
  // Defense in depth: never delete a file if a submitted order refers to it,
  // including unexpected legacy/manual order records. Fail closed on errors.
  const ref=prefix+path;
  const existing=await s.from("orders").select("id")
   .eq("order_type","custom").like("custom_request","%"+ref+"%")
   .limit(1).maybeSingle();
  if(existing.error){await hold();continue;}
  if(existing.data?.id){
   const updated=await s.from("contact_image_uploads")
    .update({state:"linked",order_id:existing.data.id,
     linked_at:new Date().toISOString(),updated_at:new Date().toISOString()})
    .eq("storage_path",path).eq("state","cleaning");
   if(updated.error){review++;console.error("CONTACT CLEANUP LINK RECONCILIATION ERROR");}
   else linked++;
   continue;
  }
  try{
   const out=await s.storage.from(bucket).remove([path]);
   if(out.error){await hold();continue;}
   const done=await s.from("contact_image_uploads").update({
    state:"removed",removed_at:new Date().toISOString(),
    updated_at:new Date().toISOString()
   }).eq("storage_path",path).eq("state","cleaning");
   if(done.error){review++;console.error("CONTACT CLEANUP DELETE ACK ERROR");}
   else removed++;
  }catch{
   await hold();
  }
 }
 return json({ok:review===0,checked:data.length,removed,linked,review,skipped},review?207:200);
}

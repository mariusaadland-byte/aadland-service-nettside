import "server-only";
import {db} from "./supabase";
import {evidenceKey,signingArchiveEnabled} from "./signingArchiveConfig";
import {signingArchiveRow} from "./signingConfirmation.mjs";
import {rentalUnitId} from "./rentalUnitQr.mjs";
export async function customerSigningArchive(customerId){
 if(!signingArchiveEnabled()||!rentalUnitId(customerId))return {ok:false};
 const s=db();if(!s)return {ok:false};
 try{
  // Bound full-PDF reads; refuse a truncated list instead of showing a false empty archive.
  const a=await s.from("aadland_agreements").select("id,group_id,customer_user_id,revision,created_at,document_bytes,document_digest,quote_digest,terms_version",{count:"exact"}).eq("customer_user_id",customerId).order("created_at",{ascending:false}).limit(30);
  if(a.error||!Array.isArray(a.data)||a.count!==a.data.length)return {ok:false};
  if(!a.data.length)return {ok:true,rows:[]};
  const groupIds=[...new Set(a.data.map(x=>x.group_id))],ids=a.data.map(x=>x.id);
  const [g,c,e]=await Promise.all([
   s.from("rental_order_groups").select("id,customer_user_id,order_number").eq("customer_user_id",customerId).in("id",groupIds),
   s.from("aadland_agreement_current").select("group_id,agreement_id").in("group_id",groupIds),
   s.from("aadland_signing_evidence").select("agreement_id,challenge_id,evidence_text,evidence_seal,key_id,signed_at").in("agreement_id",ids)
  ]);
  if([g,c,e].some(x=>x.error||!Array.isArray(x.data)))return {ok:false};
  const rows=[];
  for(const agreement of a.data){
   const group=g.data.find(x=>x.id===agreement.group_id),pointer=c.data.find(x=>x.group_id===agreement.group_id),record=e.data.find(x=>x.agreement_id===agreement.id);
   if(!pointer||!ids.includes(pointer.agreement_id))return {ok:false};
   const row=signingArchiveRow({actor:{kind:"customer",id:customerId},agreement,group,current:pointer.agreement_id===agreement.id,record,key:record?evidenceKey(record.key_id):null});
   if(!row)return {ok:false};
   rows.push(row);
  }
  return {ok:true,rows};
 }catch{return {ok:false};}
}

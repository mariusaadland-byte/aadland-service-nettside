import "server-only";
import {db} from "./supabase";
import {rentalUnitId} from "./rentalUnitQr.mjs";
import {rentalInvoiceCandidate} from "./rentalGroupAccounting.mjs";
import {bankArchiveRows,groupAccountingReview} from "./groupOrderArchive.mjs";
import {verifiedCurrentRentalAgreement} from "./rentalAgreementGate.mjs";
import {evidenceKey} from "./signingArchiveConfig";
export const groupArchiveEnabled=()=>process.env.VERCEL_ENV==="production"&&process.env.AADLAND_GROUP_ADMIN_ENABLED==="true"&&process.env.AADLAND_GROUP_BANK_ARCHIVE_ENABLED==="true";
export async function ownerGroupArchive(id){
 if(!groupArchiveEnabled()||!rentalUnitId(id))return null;
 const s=db();if(!s)return null;
 const val=r=>{if(r.error)throw Error("ARCHIVE_UNCONFIRMED");return r.data;};
 try{
 const group=val(await s.from("rental_order_groups").select("*").eq("id",id).maybeSingle());if(!group)return null;
 const [d,c,t,p,docs]=await Promise.all([
 s.from("rental_group_deposit_receipts").select("*").eq("group_id",id).maybeSingle(),
 s.from("rental_group_payment_claims").select("*").eq("group_id",id).maybeSingle(),
 s.from("rental_group_return_settlements").select("*").eq("group_id",id).maybeSingle(),
 s.from("aadland_agreement_current").select("*").eq("group_id",id).maybeSingle(),
 s.from("rental_group_bank_evidence").select("group_id,kind,digest,reference,amount_ore,request_id,created_at",{count:"exact"}).eq("group_id",id).order("created_at").limit(10)]);
 const deposit=val(d),claim=val(c),settlement=val(t),pointer=val(p),raw=val(docs);
 if(docs.count!==raw.length)return null;
 const documents=bankArchiveRows({group,documents:raw,deposit,settlement});if(!documents)return null;
 let agreementId=null,signed=false;
 if(pointer){
 const [a,e]=await Promise.all([s.from("aadland_agreements").select("*").eq("id",pointer.agreement_id).eq("group_id",id).eq("customer_user_id",group.customer_user_id).single(),s.from("aadland_signing_evidence").select("*").eq("agreement_id",pointer.agreement_id).maybeSingle()]);
 const agreement=val(a),record=val(e);agreementId=agreement.id;
 if(record){signed=!!verifiedCurrentRentalAgreement({group,agreement,pointer,record,key:evidenceKey(record.key_id),now:new Date().toISOString()});if(!signed)return null;}
 }
 const accounting=groupAccountingReview({group,claim,signed,deposit,settlement,documents});if(!accounting)return null;
 const invoice=rentalInvoiceCandidate({accounting,groupStatus:group.status,paidAt:claim?.captured_at,reference:claim?.reference,pspReference:claim?.psp_reference});if(!invoice)return null;
 return {id,orderNumber:String(group.order_number),agreementId,signed,documents,accounting,invoice};
 }catch{return null;}
}

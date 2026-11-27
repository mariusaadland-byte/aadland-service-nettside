import "server-only";
import {db} from "./supabase";
import {groupCheckoutEnabled} from "./rentalCheckoutAgreement";
import {evidenceKey} from "./signingArchiveConfig";
import {signingDraftStore} from "./signingDraftStore.mjs";
import {checkoutSigningContext,signingRequestInput,issueCheckoutSigningCode,verifyCheckoutSigningCode} from "./checkoutSigning.mjs";
import {sendRentalSigningCode} from "./rentalSigningCodeEmail";
import {rentalUnitId} from "./rentalUnitQr.mjs";
export const checkoutSigningEnabled=()=>groupCheckoutEnabled()&&process.env.AADLAND_CHECKOUT_SIGNING_ENABLED==="true";
function value(r){if(r.error)throw Error("SIGNING_UNCONFIRMED");return r.data;}
async function load(customerId,agreementId){
 const s=db();if(!s)return null;
 const agreement=value(await s.from("aadland_agreements").select("*").eq("id",agreementId).eq("customer_user_id",customerId).maybeSingle());
 if(!agreement)return null;
 const [g,p,a]=await Promise.all([s.from("rental_order_groups").select("*").eq("id",agreement.group_id).eq("customer_user_id",customerId).maybeSingle(),s.from("aadland_agreement_current").select("agreement_id").eq("group_id",agreement.group_id).maybeSingle(),s.auth.admin.getUserById(customerId)]);
 if(a.error||a.data?.user?.id!==customerId)return null;
 const context=checkoutSigningContext({agreement,group:value(g),account:a.data.user,currentId:value(p)?.agreement_id,now:new Date().toISOString()});
 return context?{s,agreement,context,store:signingDraftStore(s)}:null;
}
export async function checkoutSigningAction(customerId,body,verify){
 if(!checkoutSigningEnabled()||!rentalUnitId(customerId))return {status:"unavailable"};
 const input=signingRequestInput(body,verify);if(!input)return {status:"invalid"};
 const x=await load(customerId,input.agreementId);if(!x)return {status:"unavailable"};
 if(!verify){
  const keyId=process.env.AADLAND_SIGNING_ACTIVE_KEY_ID,key=evidenceKey(keyId);
  return issueCheckoutSigningCode({context:x.context,input,key,keyId,now:new Date().toISOString(),store:x.store,send:sendRentalSigningCode});
 }
 return verifyCheckoutSigningCode({...x,input,keyFor:evidenceKey,clock:()=>new Date().toISOString(),
 readChallenge:async id=>value(await x.s.from("aadland_signing_challenges").select("*").eq("id",id).eq("agreement_id",input.agreementId).eq("customer_user_id",customerId).maybeSingle()),
 readEvidence:async()=>value(await x.s.from("aadland_signing_evidence").select("*").eq("agreement_id",input.agreementId).maybeSingle())});
}

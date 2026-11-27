import "server-only";
import {tripletexRead,tripletexCreateUnsentedInvoice,tripletexRecordInvoicePayment} from "./tripletexApi";
// Private adapter, NO live route invokes it. Company and payment-type checks
// must be provided by a future trusted server integration, not request flags.
export function rentalTripletexAdapter({session,companyMatches,paymentTypeMatches,searchPath}){
 if(process.env.VERCEL_ENV!=="production"||process.env.AADLAND_GROUP_TRIPLETEX_WRITE_ENABLED!=="true"||typeof companyMatches!=="function"||typeof paymentTypeMatches!=="function"||typeof searchPath!=="function")throw Error("RENTAL_TRIPLETEX_DISABLED");
 return {companyMatches,paymentTypeMatches,search:p=>tripletexRead(searchPath(p),session,"production"),read:async id=>(await tripletexRead("/invoice/"+id,session,"production")).value,create:body=>tripletexCreateUnsentedInvoice(body,session,"production"),pay:(id,date,type,ore)=>tripletexRecordInvoicePayment(id,date,type,ore,session,"production")};
}
export function rentalTripletexDraftStore(s,actorId){
 const call=async(name,args)=>{const r=await s.rpc(name,args);if(r.error)throw Error("TRIPLETEX_UNCONFIRMED");return r.data;};
 return {claimInvoice:p=>call("draft_group_tripletex_claim",{p_group:p.groupId,p_company:p.companyId,p_customer:p.customerId,p_vat:p.vatTypeId,p_gross:p.grossOre,p_digest:p.digest,p_actor:actorId}),
 finishInvoice:(p,id)=>call("draft_group_tripletex_finish",{p_group:p.groupId,p_digest:p.digest,p_company:p.companyId,p_customer:p.customerId,p_gross:p.grossOre,p_marker:p.marker,p_invoice:id}),
 claimPayment:(p,id)=>call("draft_group_tripletex_payment_claim",{p_group:p.groupId,p_company:p.companyId,p_invoice:id,p_type:p.paymentTypeId,p_date:p.paidDay,p_amount:p.grossOre,p_source:p.digest,p_digest:p.paymentDigest,p_actor:actorId}),
 finishPayment:(p,id,confirmed)=>call("draft_group_tripletex_payment_finish",{p_group:p.groupId,p_invoice:id,p_digest:p.paymentDigest,p_confirmed:confirmed})};
}

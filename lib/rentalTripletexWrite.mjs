import {transferFingerprint} from "./rentalTripletexPreview.mjs";
import {groupVippsReconcile} from "./rentalGroupVipps.mjs";
import {createHash} from "node:crypto";
const positive=n=>Number.isSafeInteger(n)&&n>0;
const day=s=>typeof s==="string"&&/^20\d{2}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s+"T00:00:00Z"))&&new Date(s+"T00:00:00Z").toISOString().slice(0,10)===s;
const ore=n=>typeof n==="number"&&Number.isFinite(n)&&n>=0&&Math.abs(Math.round(n*100)/100-n)<1e-7?Math.round(n*100):null;
// All arguments must come from trusted server reads, not the browser.
// Require a verified company, explicitly checked mapping and real capture date.
export function rentalTransferPlan({group,signature,claim,payment,invoice,companyId,customerId,vatTypeId,paymentTypeId,invoiceDay,deliveryDay,paidDay,today,approved}){
 if(approved!==true||group?.status!=="fulfilled"||!signature||signature.agreementId!==claim?.agreement_id||signature.documentDigest!==claim.document_digest||signature.quoteDigest!==group.quote_digest||claim.group_id!==group.id||claim.reference!==group.payment_reference||!claim.captured_at||!claim.psp_reference||claim.amount_ore!==group.payable_ore||!invoice?.lines?.length||invoice.grossOre!==group.payable_ore||!positive(paymentTypeId)||![invoiceDay,deliveryDay,paidDay,today].every(day)||invoiceDay>today||deliveryDay>today||paidDay>today)return null;
 const facts=groupVippsReconcile({group:{...group,payment_psp_reference:claim.psp_reference},payment,unit:"rental"});
 if(facts.action!=="no_change"||facts.capturedOre!==group.payable_ore||facts.refundedOre!==0||facts.pspReference!==claim.psp_reference)return null;
 const digest=transferFingerprint({groupId:group.id,quoteDigest:group.quote_digest,agreementId:signature.agreementId,documentDigest:signature.documentDigest,paymentReference:claim.reference,pspReference:claim.psp_reference,customerId,vatTypeId,grossOre:invoice.grossOre,invoiceDay,deliveryDay,companyId});
 if(!digest)return null;
 const marker="AU-GROUP-"+group.id;
 // One line per original quote line; only exact integer-øre unit prices accepted.
 // Never silently change totals to accommodate Tripletex rounding.
 const lines=[];
 for(const l of invoice.lines){
  if(!["rental","goods"].includes(l.kind)||!positive(l.quantity)||!positive(l.grossOre)||!positive(l.netOre)||l.grossOre!==l.netOre+l.vatOre||l.netOre%l.quantity!==0||Math.round(l.netOre*1.25)!==l.grossOre||typeof l.description!=="string"||!l.description.trim())return null;
  lines.push({description:l.description,count:l.quantity,unitPriceExcludingVatCurrency:l.netOre/l.quantity/100,vatType:{id:vatTypeId}});
 }
 if(invoice.lines.reduce((s,l)=>s+l.grossOre,0)!==group.payable_ore)return null;
 const paymentDigest=createHash("sha256").update(JSON.stringify(["aadland-rental-payment-v1",digest,paidDay,paymentTypeId,claim.reference,claim.psp_reference,invoice.grossOre])).digest("hex");
 return {groupId:group.id,companyId,customerId,vatTypeId,paymentTypeId,invoiceDay,paidDay,deliveryDay,grossOre:invoice.grossOre,digest,paymentDigest,marker,body:{invoiceNumber:0,invoiceDate:invoiceDay,invoiceDueDate:invoiceDay,comment:marker,orders:[{orderDate:invoiceDay,deliveryDate:deliveryDay,customer:{id:customerId},isPrioritizeAmountsIncludingVat:false,orderLines:lines}]}};
}
export function verifyRentalRemote(remote,p,expectedId=null){
 if(!positive(remote?.id)||expectedId!==null&&remote.id!==expectedId||!positive(remote.invoiceNumber)||remote.customer?.id!==p.customerId||remote.invoiceDate!==p.invoiceDay||remote.comment!==p.marker||remote.currency?.code!=="NOK"||remote.isCreditNote!==false||remote.isCredited!==false||ore(remote.amount)!==p.grossOre)return null;
 const outstandingOre=ore(remote.amountOutstanding);return outstandingOre!==null&&outstandingOre<=p.grossOre?{id:remote.id,outstandingOre}:null;
}
export function duplicateRentalSearch(result,p){
 if(!Array.isArray(result?.values)||result.values.length>=1000||result.fullResultSize!==result.values.length)return false;
 return result.values.every(x=>positive(x?.id)&&positive(x?.customer?.id)&&ore(x.amount)!==null&&typeof x.comment==="string"&&x.comment!==p.marker&&!(x.customer.id===p.customerId&&ore(x.amount)===p.grossOre));
}
// Separate durable claims. Any ambiguous outcome stays locked; never replay POST/PUT.
export async function createRentalInvoice({plan:p,store,provider}){
 if(!p)return {status:"review"};
 if(!await provider.companyMatches(p.companyId)||!duplicateRentalSearch(await provider.search(p),p))return {status:"review"};
 const r=await store.claimInvoice(p);if(r!=="claimed")return {status:"review_existing"};
 try{
  if(!await provider.companyMatches(p.companyId)||!duplicateRentalSearch(await provider.search(p),p))throw Error("preflight");
  const created=await provider.create(p.body),remoteId=created?.value?.id;
  if(!positive(remoteId))throw Error("unknown");
  const remote=verifyRentalRemote(await provider.read(remoteId),p,remoteId);
  if(!remote||remote.outstandingOre!==p.grossOre)throw Error("readback");
  const saved=await store.finishInvoice(p,remoteId);return {status:saved==="confirmed"?"invoice_confirmed":"review",invoiceId:remoteId};
 }catch{try{await store.finishInvoice(p,null);}catch{}return {status:"review"};}
}
export async function recordRentalPayment({plan:p,invoiceId,store,provider}){
 if(!p||!positive(invoiceId)||!await provider.companyMatches(p.companyId)||!await provider.paymentTypeMatches(p.paymentTypeId))return {status:"review"};
 const before=verifyRentalRemote(await provider.read(invoiceId),p,invoiceId);
 if(!before||before.outstandingOre!==p.grossOre)return {status:"review"};
 if(await store.claimPayment(p,invoiceId)!=="claimed")return {status:"review_existing"};
 try{
  if(!await provider.companyMatches(p.companyId)||!await provider.paymentTypeMatches(p.paymentTypeId)||verifyRentalRemote(await provider.read(invoiceId),p,invoiceId)?.outstandingOre!==p.grossOre)throw Error("preflight");
  const accepted=await provider.pay(invoiceId,p.paidDay,p.paymentTypeId,p.grossOre);
  if(accepted?.accepted!==true)throw Error("unknown");
  const after=verifyRentalRemote(await provider.read(invoiceId),p,invoiceId);
  if(!after||after.outstandingOre!==0)throw Error("balance");
  const saved=await store.finishPayment(p,invoiceId,true);
  return {status:saved==="confirmed"?"payment_confirmed":"review"};
 }catch{try{await store.finishPayment(p,invoiceId,false);}catch{}return {status:"review"};}
}

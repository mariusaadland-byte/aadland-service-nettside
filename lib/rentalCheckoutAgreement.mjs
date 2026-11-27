import {randomUUID} from "node:crypto";
import {groupReservationInput,groupReservationPlan} from "./rentalGroupReservation.mjs";
import {checkFrozenGroupQuote} from "./rentalFrozenQuote.mjs";
import {buildRentalAgreementPdf} from "./rentalAgreementPdf.mjs";
import {archiveDocument,archiveAccess} from "./signingArchiveDownload.mjs";
import {rentalUnitId} from "./rentalUnitQr.mjs";
// Store methods are private server methods, never browser-supplied.
// Two recoverable steps: reserve then attach immutable PDF. Same request ID
// recovers a hold if PDF generation/transport failed; never reserves twice.
export async function checkoutAgreement({body,account,customerName,today,now,store,price}){
 const input=groupReservationInput(body,today);
 if(!input||!rentalUnitId(account?.id)||!account.email_confirmed_at||typeof account.email!=="string"||! /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(account.email)||typeof customerName!=="string"||!customerName.trim()||!Number.isFinite(Date.parse(now)))return {status:"invalid"};
 const customerId=account.id,email=account.email.trim().toLowerCase();
 let group=await store.find(customerId,input.requestId);
 if(!group){
  const fresh=await price(input);
  const plan=groupReservationPlan({input,serverRentals:fresh?.rentals,serverGoods:fresh?.goods,today});
  if(!plan)return {status:"quote_changed"};
  // Preflight names/PDF encoding before creating a hold.
  try{buildRentalAgreementPdf({agreementId:randomUUID(),customerId,customerName,email,orderNumber:"Preflight",revision:1,quote:{digest:plan.quoteDigest,snapshot:plan.snapshot},today});}catch{return {status:"invalid_document"};}
  const groupId=await store.reserve(customerId,plan);
  if(!rentalUnitId(groupId))throw Error("RESERVE_UNCONFIRMED");
  group=await store.find(customerId,input.requestId);
  if(group?.id!==groupId)throw Error("RESERVE_UNCONFIRMED");
 }
 const quote=checkFrozenGroupQuote(group);
 const plan=quote&&groupReservationPlan({input,serverRentals:quote.snapshot.rentals.map(x=>({...x,available:true})),serverGoods:quote.snapshot.goods,today});
 if(!plan||group.customer_user_id!==customerId||group.request_id!==input.requestId||!rentalUnitId(group.id)||group.status!=="held"||Date.parse(group.expires_at)<=Date.parse(now)||!Number.isFinite(Date.parse(group.expires_at)))return {status:"unavailable"};
 let agreement=await store.current(group.id,customerId);
 if(!agreement){
  const agreementId=randomUUID();
  const pdf=buildRentalAgreementPdf({agreementId,customerId,customerName,email,orderNumber:String(group.order_number),revision:1,quote,today});
  const id=await store.attach({group,customerId,email,agreementId,pdf});
  if(!rentalUnitId(id))return {status:"unavailable"};
  agreement=await store.current(group.id,customerId);
  if(agreement?.id!==id)throw Error("AGREEMENT_UNCONFIRMED");
 }
 if(!archiveAccess({actor:{kind:"customer",id:customerId},agreement,group})||agreement.signing_email!==email||agreement.quote_digest!==group.quote_digest||agreement.terms_version!==group.terms_version||!archiveDocument(agreement))return {status:"unavailable"};
 return {status:"agreement_ready",groupId:group.id,orderNumber:String(group.order_number),agreementId:agreement.id,documentDigest:agreement.document_digest,quoteDigest:group.quote_digest,termsVersion:group.terms_version,expiresAt:group.expires_at,payableOre:group.payable_ore,depositOre:group.deposit_ore,documentUrl:"/api/customer/signing/"+agreement.id+"/avtale"};
}

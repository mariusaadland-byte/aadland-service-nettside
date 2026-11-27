import {createHash} from "node:crypto";
import {rentalUnitId} from "./rentalUnitQr.mjs";
const normal=s=>typeof s==="string"?s.trim().replace(/\s+/g," ").toLocaleLowerCase("nb-NO"):"";
const id=n=>Number.isSafeInteger(n)&&n>0;
export function rentalCustomerMatch(customer,rows,link){
 if(!normal(customer?.name)||!normal(customer?.email)||!Array.isArray(rows)||rows.length>=100)return {status:"review"};
 const matches=rows.filter(x=>id(x.id)&&normal(x.name)===normal(customer.name)&&[x.email,x.invoiceEmail].some(e=>normal(e)===normal(customer.email)));
 if(matches.length!==1)return {status:matches.length===0&&rows.length===0&&!link?"missing":"review"};
 if(link&&(link.status!=="linked"||Number(link.tripletex_customer_id)!==matches[0].id))return {status:"review"};
 return {status:"matched",customerId:matches[0].id};
}
export function rentalTripletexPreview({groupId,invoice,customerMatch,vatTypes,prior}){
 if(!rentalUnitId(groupId)||invoice?.reference!=="rental-group:"+groupId||!Number.isSafeInteger(invoice.grossOre)||invoice.grossOre<=0)return null;
 const marker="AU-GROUP-"+groupId;
 const vat=Array.isArray(vatTypes)?vatTypes.filter(x=>String(x.number)==="3"&&x.typeOfVat==="OUTGOING"&&id(x.id)):[];
 const matched=customerMatch?.status==="matched"&&id(customerMatch.customerId);
 const blockers=[...invoice.blockers];
 if(!matched)blockers.push("Entydig kundekobling mangler");
 if(vat.length!==1)blockers.push("Utgående mva-type er ikke entydig");
 if(prior)blockers.push("Tidligere overføringsforsøk finnes – ikke opprett ny faktura");
 return {marker,customerStatus:matched?"matched":customerMatch?.status||"review",customerId:matched?customerMatch.customerId:null,vatTypeId:vat.length===1?vat[0].id:null,grossOre:invoice.grossOre,transferStatus:prior?.state||"not_started",remoteInvoiceId:prior?.remote_invoice_id||null,blockers,readyToPost:false};
}
export function transferFingerprint({groupId,quoteDigest,agreementId,documentDigest,paymentReference,pspReference,customerId,vatTypeId,grossOre,invoiceDay,deliveryDay,companyId}){
 const hash=v=>typeof v==="string"&&/^[a-f0-9]{64}$/.test(v),day=v=>typeof v==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v+"T00:00:00Z"))&&new Date(v+"T00:00:00Z").toISOString().slice(0,10)===v;
 if(!rentalUnitId(groupId)||!rentalUnitId(agreementId)||!hash(quoteDigest)||!hash(documentDigest)||paymentReference!=="AUG-"+groupId||typeof pspReference!=="string"||!pspReference||![customerId,vatTypeId,grossOre,companyId].every(id)||!day(invoiceDay)||!day(deliveryDay))return null;
 return createHash("sha256").update(JSON.stringify(["aadland-rental-invoice-v1",groupId,quoteDigest,agreementId,documentDigest,paymentReference,pspReference,customerId,vatTypeId,grossOre,invoiceDay,deliveryDay,companyId])).digest("hex");
}

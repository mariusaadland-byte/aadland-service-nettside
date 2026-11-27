import {renderAgreementSections} from "./rentalAgreementPdf.mjs";
import {rentalReceiptDraft} from "./rentalReceiptDraft.mjs";
const clean=(v,max=120)=>typeof v==="string"&&v.trim().length>0&&v.length<=max&&!/[\x00-\x1f\x7f]/.test(v);
const kr=n=>new Intl.NumberFormat("nb-NO",{style:"currency",currency:"NOK"}).format(n/100);
export function buildRentalReceiptPdfDraft({group,event,issuer,customer,documentNumber}={}){
 const r=rentalReceiptDraft({group,event});
 if(!r||!clean(documentNumber,80)||!clean(String(group.order_number??""),80)||!clean(issuer?.name)||!/^\d{9}$/.test(issuer?.orgNumber??"")||!clean(customer?.name)||!clean(event.method,40))return null;
 const title={payment:"Betalingsbekreftelse",deposit:"Depositumskvittering",deposit_refund:"Tilbakebetaling av depositum"}[r.kind];
 const sections=[{heading:true,text:title},{text:"Dokumentnummer: "+documentNumber+"\nOrdrenummer: "+group.order_number},{text:"Utsteder: "+issuer.name+"\nOrg.nr.: "+issuer.orgNumber+"\nKunde: "+customer.name},{heading:true,text:"Bekreftet transaksjon"},{text:"Beløp: "+kr(r.amountOre)+"\nBetalingsmåte: "+event.method+"\nReferanse: "+r.reference+"\nDato: "+new Date(r.confirmedAt).toLocaleString("nb-NO",{timeZone:"Europe/Oslo"})}];
 if(r.kind==="deposit_refund")sections.push({text:"Gjenstående depositum etter tilbakebetaling: "+kr(event.originalDepositOre-event.previousRefundOre-r.amountOre)});
 sections.push({text:r.kind==="payment"?"Betalingsbekreftelse. Erstatter ikke faktura eller salgsdokument.":"Depositum håndteres separat fra leieinntekt. Eventuelt skadeoppgjør dokumenteres separat."});
 return renderAgreementSections(sections,"AADLAND UTLEIE | KVITTERING");
}

import {invoicePaymentState} from "./invoicePaymentStatus";

const money=ore=>new Intl.NumberFormat("nb-NO",{style:"currency",currency:"NOK"}).format(Number(ore)/100);
const date=value=>{const parts=String(value||"").split("-");return parts.length===3?parts.reverse().join("."):String(value||"");};

export function friendlyReminderEligible(invoice,today){
 if(!invoice||!["issued","sent"].includes(invoice.status)||!invoice.invoice_number||!invoice.due_date)return false;
 return invoicePaymentState(invoice,today).outstanding>0;
}

export function friendlyReminderText(invoice,outstandingOre){
 if(!invoice?.invoice_number||!invoice?.due_date)throw Error("Fakturaen mangler nummer eller opprinnelig forfallsdato.");
 return {
  subject:"Vennlig betalingspåminnelse – faktura "+invoice.invoice_number+" – Aadland Service",
  body:[
   "Hei "+String(invoice.customer?.name||"")+"!","",
   "Vi vil bare minne om at vi fortsatt har et utestående beløp på faktura "+invoice.invoice_number+".",
   "Vi legger ved den opprinnelige fakturaen på nytt for enkelhets skyld.","",
   "Fakturanummer: "+invoice.invoice_number,
   "Gjenstående beløp: "+money(outstandingOre),
   "Opprinnelig forfallsdato: "+date(invoice.due_date),
   "Kontonummer: 8450 46 22699",
   "Merk betalingen med fakturanummer "+invoice.invoice_number+".","",
   "Dette er kun en vennlig påminnelse. Opprinnelig forfallsdato gjelder fortsatt; ingen ny betalingsfrist, gebyr eller rente legges til.",
   "Har du allerede betalt, kan du se bort fra denne meldingen. Ta gjerne kontakt dersom noe er uklart.","",
   "Med vennlig hilsen","Aadland Service",
   "Telefon: 471 54 898","E-post: post@aadland-service.no"
  ].join("\n")
 };
}

import {withVippsDeliveryDate} from "./invoiceVippsDate";
export function invoiceDueDate(day,days){
 const value=new Date(day+"T12:00:00Z");value.setUTCDate(value.getUTCDate()+days);return value.toISOString().slice(0,10);
}
export function withInvoicePaymentTerms(invoice,contacts,today){
 if(invoice.status!=="draft")return invoice;
 const customer=invoice.customer||{};
 const contact=contacts.find(x=>String(x.id)===customer.contactId)||contacts.find(x=>customer.email&&String(x.email||"").toLowerCase()===String(customer.email).toLowerCase());
 const days=contact?.payment_terms_days??14;
 return withVippsDeliveryDate({...invoice,customer:{...customer,paymentTermsDays:days},due_date:invoice.due_date_mode==="manual"?invoice.due_date:invoiceDueDate(today,days)},today);
}

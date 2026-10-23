import {invoiceDueDate} from "./invoicePaymentTerms";

// Deliberately copy only stable customer-card fields into the invoice.
// Job-specific details stay with the invoice and must never be overwritten
// by switching customers.
export function invoiceWithSelectedCustomer(invoice,contact,today){
 if(!invoice||invoice.status!=="draft")throw Error("Bare fakturakladder kan bytte kunde.");
 if(!contact?.id||!contact?.name)throw Error("Velg en lagret kunde fra kunderegisteret.");
 const customer={
  ...(invoice.customer||{}),
  contactId:contact.id,
  name:contact.name,
  email:contact.email||"",
  phone:contact.phone||"",
  address:contact.address||"",
  paymentTermsDays:Number(contact.paymentTermsDays??14),
  customerType:contact.customerType||"private",
  organizationNumber:contact.organizationNumber||"",
  paymentMethod:invoice.customer?.paymentMethod||contact.preferredPaymentMethod||"bank"
 };
 const automatic=(invoice.due_date_mode||"auto")==="auto";
 return {...invoice,customer,due_date:automatic?invoiceDueDate(today,customer.paymentTermsDays):invoice.due_date};
}

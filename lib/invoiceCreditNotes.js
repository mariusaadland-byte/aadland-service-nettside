import "server-only";
import {buildInvoiceDraftPdf} from "./invoiceDraftPdf";

// Freeze an issued credit note as its own PDF; original invoice PDF is untouched.
export async function freezeInvoiceCreditPdf(s,note){
 if(!note?.id||!note?.credit_number||!Array.isArray(note.lines)||!note.lines.length)
  throw Error("Kreditnotaen mangler gyldige dokumentopplysninger.");
 if(note.pdf_base64)return note;
 const customer={...note.customer,workDescription:"",workDate:note.work_date||"",workAddress:note.work_address||""};
 const pdf=await buildInvoiceDraftPdf({
  invoice_number:note.credit_number,issued_date:note.credit_date,due_date:null,
  title:"Korrigering av "+note.original_invoice_number,customer,
  creditNote:{reason:note.reason,originalInvoiceNumber:note.original_invoice_number,
   originalInvoiceDate:note.original_invoice_date},
  line_items:note.lines.map(line=>({
   description:line.description,unit:line.unit||"stk",
   quantity:Number(line.quantity),unitPriceOre:Number(line.unitPriceOre),vatRate:Number(line.vatRate)
  }))
 });
 const signed=pdf.toString("base64");
 const update=await s.from("invoice_credit_notes").update({pdf_base64:signed}).eq("id",note.id).is("pdf_base64",null);
 if(update.error)throw Error("Kreditnotaen er utstedt, men PDF-lagringen feilet. Åpne dokumentet på nytt.");
 const fresh=await s.from("invoice_credit_notes").select("*").eq("id",note.id).single();
 if(fresh.error||!fresh.data?.pdf_base64)throw Error("Kreditnotaen er utstedt, men PDF-en kan ikke hentes ennå.");
 return fresh.data;
}

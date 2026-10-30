// Match purchases across ALL MVA terms; do not depend on the selected term.
// Exact supplier+invoice+kind is a duplicate. Reused invoice number at a
// different supplier or on a credit note needs the owner's explicit review.
export const vatDuplicateIdentity=value=>String(value??"")
 .normalize("NFKC").replace(/\s+/g," ").trim().toLocaleLowerCase("nb-NO");
export const vatDuplicateKey=(input)=>[
 vatDuplicateIdentity(input?.supplierName),vatDuplicateIdentity(input?.documentNumber),
 input?.kind==="credit"?"credit":"purchase"
].join("\u001f");
export function checkVatPurchaseDuplicate(input,previous){
 const supplier=vatDuplicateIdentity(input?.supplierName),number=vatDuplicateIdentity(input?.documentNumber);
 if(supplier.length<2||!number)return {status:"idle",match:null};
 const matches=(previous||[]).filter(x=>!x.voided_at&&
  vatDuplicateIdentity(x.supplier_document_number)===number);
 const shape=row=>({
  id:row.id,supplierName:row.supplier_name,documentNumber:row.supplier_document_number,
  documentDate:row.document_date,kind:row.kind
 });
 const duplicate=matches.find(row=>vatDuplicateIdentity(row.supplier_name)===supplier&&row.kind===input.kind);
 if(duplicate)return {status:"duplicate",match:shape(duplicate)};
 const possible=matches.find(row=>vatDuplicateIdentity(row.supplier_name)===supplier)||
  matches.find(row=>row.kind===input.kind)||matches[0];
 return possible?{status:"possible",match:shape(possible)}:{status:"clear",match:null};
}

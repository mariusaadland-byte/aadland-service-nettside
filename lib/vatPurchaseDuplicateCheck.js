// Match purchase documents in ALL MVA terms, not only the chosen period.
// Exact legal supplier + invoice number + kind is a definite duplicate.
// Similar numbers (punctuation from OCR, alternate supplier names, etc.)
// require human review; they must never be silently assumed distinct.
export const vatDuplicateIdentity=value=>String(value??"")
 .normalize("NFKC").replace(/\s+/g," ").trim().toLocaleLowerCase("nb-NO");
export const vatInvoiceNumberFingerprint=value=>vatDuplicateIdentity(value)
 .replace(/[\s.\-_/]/g,"");
export const vatDuplicateKey=input=>[
 vatDuplicateIdentity(input?.supplierName),vatDuplicateIdentity(input?.documentNumber),
 input?.kind==="credit"?"credit":"purchase"
].join("\u001f");
export function checkVatPurchaseDuplicate(input,previous){
 const supplier=vatDuplicateIdentity(input?.supplierName);
 const number=vatDuplicateIdentity(input?.documentNumber);
 if(supplier.length<2||!number)return {status:"idle",match:null};
 const fingerprint=vatInvoiceNumberFingerprint(number);
 const shape=row=>{
  const base=Number(row.base_ore),vat=Number(row.vat_ore);
  const grossOre=Number.isSafeInteger(base)&&Number.isSafeInteger(vat)&&base>=0&&vat>=0
   ?base+vat:null;
  return {
   id:row.id,supplierName:row.supplier_name,documentNumber:row.supplier_document_number,
   documentDate:row.document_date,kind:row.kind,
   ...(grossOre!==null?{grossOre}:{})
  };
 };
 const active=(previous||[]).filter(row=>!row.voided_at);
 const exact=active.filter(row=>vatDuplicateIdentity(row.supplier_document_number)===number);
 const duplicate=exact.find(row=>vatDuplicateIdentity(row.supplier_name)===supplier&&row.kind===input.kind);
 if(duplicate)return {status:"duplicate",match:shape(duplicate),reason:"exact"};
 // A different punctuation style, e.g. 260-262-706 vs 260262706
 // or OCR-derived INV 123 vs INV-123, is a probable duplicate.
 // For very short numbers, stripping separators creates too many
 // false positives, so use the exact-number comparison only.
 const nearby=fingerprint.length>=5?active.filter(row=>
  vatInvoiceNumberFingerprint(row.supplier_document_number)===fingerprint):[];
 const similar=nearby.find(row=>vatDuplicateIdentity(row.supplier_name)===supplier&&
  row.kind===input.kind&&vatDuplicateIdentity(row.supplier_document_number)!==number);
 if(similar)return {status:"possible",match:shape(similar),reason:"number-format"};
 const possible=exact.find(row=>vatDuplicateIdentity(row.supplier_name)===supplier)||
  exact.find(row=>row.kind===input.kind)||exact[0]||
  nearby.find(row=>vatDuplicateIdentity(row.supplier_name)===supplier)||
  nearby.find(row=>row.kind===input.kind)||nearby[0];
 if(possible)return {status:"possible",match:shape(possible),
  reason:vatDuplicateIdentity(possible.supplier_document_number)===number?"shared-number":"number-format"};
 return {status:"clear",match:null};
}

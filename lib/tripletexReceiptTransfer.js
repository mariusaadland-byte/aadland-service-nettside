// Official Tripletex e-bilags inbox accepts PDF/JPG/PNG attachments.
// This sends documents for REVIEW, not posted vouchers / tax submissions.
export function normalizeTripletexInbox(value){
 const address=String(value||"").trim().toLowerCase();
 if(address.length<7||address.length>254||
  !/^[a-z0-9._%+-]+@ebilag\.com$/.test(address))return "";
 return address;
}
export function tripletexReceiptEmail(document,attachment,recipient){
 const to=normalizeTripletexInbox(recipient);
 if(!to)throw Error("Bruk e-bilagsadressen fra Tripletex (slutter på @ebilag.com).");
 if(!document?.id||!attachment?.original_filename||!attachment?.sha256)
  throw Error("Bilag eller originalvedlegg mangler.");
 const printable=v=>String(v||"").replace(/[\r\n\t]+/g," ").trim().slice(0,140);
 const supplier=printable(document.supplier_name);
 const number=printable(document.supplier_document_number);
 const date=printable(document.document_date);
 const credit=document.kind==="credit";
 if(!supplier||!number||!/^\d{4}-\d{2}-\d{2}$/.test(date))
  throw Error("Bilaget mangler leverandør, dato eller nummer.");
 const lines=[
  "Bilagskopi fra Aadland Service – for kontroll og regnskapsføring i Tripletex.",
  "Dette er en opplasting til bilagsmottaket, IKKE en automatisk bokføring.",
  "",
  "Leverandør: "+supplier,
  "Leverandørens bilagsnummer: "+number,
  "Dokumentdato: "+date,
  "Type: "+(credit?"Kreditnota":"Kjøpsbilag/kvittering"),
  "Beskrivelse: "+printable(document.business_purpose),
  "Bruttobeløp inkl. MVA (kr): "+((Number(document.base_ore)+Number(document.vat_ore))/100).toFixed(2),
  "MVA fra bilaget (kr): "+(Number(document.vat_ore)/100).toFixed(2),
  "Foreslått fradragsandel i Aadland Service: "+document.deduction_percent+" %",
  "Aadland bilags-ID: "+document.id,
  "Originalfil SHA-256: "+attachment.sha256,
  "",
  "Kontroller kontotype, MVA-kode, fradragsrett, betaling og eventuelle",
  "tidligere bokførte bilag i Tripletex før godkjenning."
 ];
 return {to,subject:"Bilag til Tripletex – "+(credit?"Kreditnota ":"")+supplier+" – "+number,
  text:lines.join("\n")};
}
const csvSafe=v=>{
 const value=String(v??"").replace(/\r\n?/g,"\n");
 // Do not let spreadsheet programs execute values supplied by invoices.
 return /^[\s]*[=+\-@]/.test(value)?"'"+value:value;
};
const field=v=>'"'+csvSafe(v).replace(/"/g,'""')+'"';
export const tripletexArchiveHeaders=[
 "Aadland bilags-ID","Dato","Leverandør","Bilagsnummer","Type",
 "Beskrivelse","Grunnlag eks. MVA (kr)","MVA (kr)","Sum inkl. MVA (kr)",
 "Fradragsandel (%)","Fradragsberettiget MVA (kr)","MVA-fordeling",
 "Originalfil","Original SHA-256","Overføringsstatus","E-bilagsadresse"
];
export function tripletexReceiptCsv(rows){
 const number=n=>(Number(n||0)/100).toFixed(2).replace(".",",");
 const lines=[tripletexArchiveHeaders.map(field).join(";")];
 for(const row of rows){
  const d=row.document||row,a=row.attachment||{},t=row.transfer||{};
  const groups=Object.entries(d.vat_groups||{}).map(([rate,v])=>
   rate+"%: grunnlag "+number(v.baseOre)+", MVA "+number(v.vatOre)).join(" | ");
  lines.push([
   d.id,d.document_date,d.supplier_name,d.supplier_document_number,
   d.kind==="credit"?"Kreditnota":"Kjøpsbilag",d.business_purpose,
   number(d.base_ore),number(d.vat_ore),number(Number(d.base_ore)+Number(d.vat_ore)),
   d.deduction_percent,number(d.deductible_vat_ore),groups,
   a.original_filename||"MANGLER",a.sha256||"",t.status||"Ikke overført",t.recipient||""
  ].map(field).join(";"));
 }
 // Metadata is a review/archive CSV, NOT a ready-to-book Tripletex journal import.
 return "\uFEFF"+lines.join("\r\n")+"\r\n";
}

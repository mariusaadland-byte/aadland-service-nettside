import {vatDocumentPeriod} from "./vatDocumentPeriod";
import {vatPeriodKey} from "./vatReportingControl";
export function retroCandidateCutoff(registrationDate){
 const period=vatDocumentPeriod(registrationDate);
 if(!period)return null;
 const date=new Date(registrationDate+"T00:00:00Z");
 date.setUTCFullYear(date.getUTCFullYear()-3);
 return date.toISOString().slice(0,10);
}
export function summarizeRetroCandidates(profile,period,documents){
 const isFirst=Boolean(profile)&&vatPeriodKey(period?.year,period?.term)===
  vatPeriodKey(profile.first_term_year,profile.first_term);
 if(!isFirst)return {firstTerm:false,rows:[],count:0,netPotentialOre:0,
  warning:"Bare tilgjengelig for oppgitt første registreringstermin."};
 const cutoff=retroCandidateCutoff(profile.registration_date);
 if(!cutoff||!Array.isArray(documents)||!period.from)
  throw Error("Manglende dokumentasjon for tidligere kjøp.");
 const rows=[];let netPotentialOre=0;
 for(const d of documents){
  if(d.voided_at)continue;
  if(!vatDocumentPeriod(d.document_date)||d.document_date<cutoff||
     d.document_date>=period.from||!d.id||
     !["purchase","credit"].includes(d.kind)||
     !Number.isSafeInteger(Number(d.deductible_vat_ore))||
     Number(d.deductible_vat_ore)<0)
   throw Error("Eldre leverandørbilag har ugyldig registreringsperiode eller MVA-beløp.");
  const vatOre=Number(d.deductible_vat_ore)*(d.kind==="credit"?-1:1);
  netPotentialOre+=vatOre;
  if(!Number.isSafeInteger(netPotentialOre))throw Error("For store historiske MVA-beløp.");
  rows.push({id:d.id,documentDate:d.document_date,supplier:d.supplier_name,
   documentNumber:d.supplier_document_number,kind:d.kind,vatOre,
   evidenceReference:d.evidence_reference||"",period:vatDocumentPeriod(d.document_date)?.title});
 }
 rows.sort((a,b)=>a.documentDate.localeCompare(b.documentDate)||a.documentNumber.localeCompare(b.documentNumber));
 return {firstTerm:true,rows,count:rows.length,netPotentialOre,
  cutoff,warning:"Dette er registrerte historiske kandidater – IKKE kontrollert fradragsrett og IKKE lagt til MVA i første termin. Tidligere omsatte varer og andre vilkår kan begrense fradraget. Sammenlign med bokføringen og dokumenter kravet ved eventuell innsending."};
}

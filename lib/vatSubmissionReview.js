import {vatPeriodKey} from "./vatReportingControl";
// Safeguarded read-only review. It never asserts that the VAT return is complete.
export function buildVatSubmissionReview({period,profile,filing,purchases,externalSales,purchaseFileIds,externalFileIds}){
 if(!period||typeof period.from!=="string"||typeof period.to!=="string"||
    !Array.isArray(purchases)||!Array.isArray(externalSales)||
    !Array.isArray(purchaseFileIds)||!Array.isArray(externalFileIds))
  throw Error("MVA-kontrollen mangler dokumentgrunnlag.");
 const pFiles=new Set(purchaseFileIds),eFiles=new Set(externalFileIds),checks=[];
 const invalid=doc=>!doc||typeof doc.id!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(doc.document_date||"")||
   doc.document_date<period.from||doc.document_date>period.to;
 if(purchases.some(invalid)||externalSales.some(invalid))
  throw Error("Bilagene i kontrollen ligger ikke i riktig termin.");
 const filingStatus=filing?.status||"unverified";
 if(!["unverified","filed","not_filed","preparing"].includes(filingStatus))
  throw Error("Ugyldig MVA-status.");
 const normal=profile&&vatPeriodKey(period.year,period.term)>=
  vatPeriodKey(profile.first_term_year,profile.first_term);
 const before=profile&&vatPeriodKey(period.year,period.term)<
  vatPeriodKey(profile.first_term_year,profile.first_term);
 if(profile&&!vatPeriodKey(profile.first_term_year,profile.first_term))
  throw Error("Ugyldig MVA-registreringsperiode.");
 if(!profile)checks.push({level:"attention",code:"registration_unknown",title:"MVA-registrering må kontrolleres",
  detail:"Bekreft virkningsdatoen hos Skatteetaten før du avgjør hvilke terminer som skal leveres."});
 else if(before)checks.push({level:"attention",code:"before_registration",title:"Denne terminen er før registreringen",
  detail:"Ikke lag en ordinær MVA-melding bare fordi gamle kjøp ligger her. Vurder eventuell tilbakegående avgiftsoppgjør i registreringsterminen."});
 const preRegistrationPurchases=profile?.registration_date?
  purchases.filter(doc=>doc.document_date<profile.registration_date):[];
 if(normal&&preRegistrationPurchases.length)checks.push({
  level:"review",code:"pre_registration_purchases",title:"Kjøp før registreringsdato i valgt termin",
  count:preRegistrationPurchases.length,
  detail:vatPeriodKey(period.year,period.term)===vatPeriodKey(profile.first_term_year,profile.first_term)?
   "Kjøp fra tidligere i registreringsterminen kan normalt fradragsføres i første MVA-melding når vilkårene er oppfylt. Kontroller dato, tilknytning og dokumentasjon.":
   "Kontroller fakturadato, dokumentasjon og riktig fradragsbehandling i regnskapssystemet."
 });
 const missingExternalFiles=externalSales.filter(doc=>!eFiles.has(doc.id));
 if(missingExternalFiles.length)checks.push({
  level:"attention",code:"external_original_missing",title:"Importerte kundefakturaer mangler fil her",
  count:missingExternalFiles.length,
  detail:"Åpne importen og kontroller at originalfakturaene er arkivert. Registrering uten fil kan skyldes avbrutt opplasting."
 });
 const missingPurchaseFiles=purchases.filter(doc=>!pFiles.has(doc.id));
 if(missingPurchaseFiles.length)checks.push({
  level:"review",code:"purchase_attachment_missing",title:"Innkjøpsbilag uten opplastet fil her",
  count:missingPurchaseFiles.length,
  detail:"Originalbilag kan ligge i regnskapssystemet. Kontroller dokumentasjonen der – fravær av en lokal fil betyr ikke at bilaget mangler."
 });
 if(filingStatus==="filed"){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(filing?.filed_on||""))
   throw Error("Levert-status mangler innsendingsdato.");
  const later=[...purchases,...externalSales].filter(doc=>
   typeof doc.confirmed_at==="string"&&doc.confirmed_at.slice(0,10)>filing.filed_on);
  if(later.length)checks.push({level:"attention",code:"post_filing_entries",
   title:"Bilag registrert her etter oppgitt innsendingsdato",count:later.length,
   detail:"Kontroller mot den faktiske innsendte MVA-meldingen om en endringsmelding trengs. Registreringsdato her beviser ikke at bilaget manglet i regnskapet."
  });
  checks.push({level:"review",code:"filed_reconciliation",title:"Kontroller tall mot levert MVA-melding",
   detail:"Status «levert» er manuelt registrert, ikke bekreftet av Skatteetaten. Sammenlign faktiske innsendte beløp og dette grunnlaget."});
 }else if(filingStatus==="not_filed"){
  checks.push({level:"attention",code:"missing_return",title:"MVA-melding markert som ikke levert",
   detail:"Kontroller terminen hos Skatteetaten og lever korrekt fullstendig melding om den mangler. Dette systemet leverer ikke meldingen."});
 }else if(filingStatus==="unverified"){
  checks.push({level:"review",code:"filing_unknown",title:"Innsendingsstatus er ikke kontrollert",
   detail:"Sjekk Skatteetaten og merk om terminen er levert, under arbeid eller ikke levert."});
 }
 if(!purchases.length&&!externalSales.length)checks.push({level:"review",
  code:"no_imports",title:"Ingen manuelle innkjøp eller eldre kundefakturaer i terminen",
  detail:"Dette betyr ikke at det mangler omsetning eller at du skal levere en nullmelding. Kontroller regnskapssystemet."});
 checks.push({level:"review",code:"bookkeeping_reconciliation",
  title:"Avstem hele regnskapet og MVA-kodene før innsending",
  detail:"Kontroller alle salgskanaler, originalbilag, kreditnotaer, særtilfeller og bokføring. Avstemmingen her er ikke en komplett MVA-melding."});
 return {filingStatus,registrationKnown:Boolean(profile),beforeRegistration:Boolean(before),
  documentCounts:{purchase:purchases.length,externalSales:externalSales.length,
   // Distinguish individual files from number of documents with a file.
   purchaseFiles:purchaseFileIds.length,externalFiles:externalFileIds.length,
   purchaseAttachments:purchases.length-missingPurchaseFiles.length,
   externalAttachments:externalSales.length-missingExternalFiles.length,
   preRegistrationPurchases:preRegistrationPurchases.length},
  checks,readyForSubmission:false,verifiedWithSkatteetaten:false,
  warning:"Dette er intern kontroll, ikke godkjenning for innsending eller bekreftelse på betaling."};
}

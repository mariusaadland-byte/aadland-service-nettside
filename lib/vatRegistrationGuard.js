import {vatPeriodKey} from "./vatReportingControl";
// Never promote purely historical document arithmetic into an apparent VAT settlement.
export function applyVatRegistrationGuard(report,profile){
 const period=report?.period;
 const selected=vatPeriodKey(period?.year,period?.term);
 if(!selected||!report?.comparison)throw Error("MVA-rapporten mangler en gyldig termin.");
 let kind="registration_unknown",message="Registreringsdatoen er ikke bekreftet i Aadland Service. Beløpet å betale eller få tilbake vises ikke før registreringsterminen er kontrollert.";
 if(profile){
  const start=vatPeriodKey(profile.first_term_year,profile.first_term);
  if(!start||typeof profile.registration_date!=="string"||
     !/^\d{4}-\d{2}-\d{2}$/.test(profile.registration_date))
   throw Error("MVA-registreringsdatoen kan ikke avstemmes.");
  if(selected<start){
   kind="before_registration";
   message="Dette er før første oppgitte MVA-termin. Registrerte kjøp vises historisk og skal ikke automatisk føres til fradrag i denne terminen. Kontroller mulig tilbakegående avgiftsoppgjør i første termin.";
  }else if(selected===start){
   kind="first_term";
   message="Første oppgitte MVA-termin. Kjøp i registreringsterminen kan normalt vurderes i første MVA-melding, også om fakturadatoen er før registreringsdagen. Eldre terminer krever særskilt vurdering av tilbakegående avgiftsoppgjør.";
  }else{
   kind="later_term";
   message="Oppgitt registreringstermin er passert. Kontroller alle bilag og MVA-koder i regnskapet før innsending.";
  }
 }
 const estimateAllowed=kind==="first_term"||kind==="later_term";
 return {...report,
  registrationReview:{kind,estimateAllowed,message,registrationDate:profile?.registration_date||null,
   firstTerm:profile?{year:profile.first_term_year,term:profile.first_term}:null},
  comparison:{...report.comparison,estimateAllowed,isComplete:false,
   warning:estimateAllowed?report.comparison.warning:message}
 };
}

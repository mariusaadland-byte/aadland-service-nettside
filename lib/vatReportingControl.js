import {vatDocumentPeriod} from "./vatDocumentPeriod";
const isoDate=value=>typeof value==="string"&&vatDocumentPeriod(value)!==null;
export function vatPeriodKey(year,term){
 const y=Number(year),t=Number(term);
 if(!Number.isSafeInteger(y)||y<2000||y>2100||!Number.isSafeInteger(t)||t<1||t>6)return null;
 return y*10+t;
}
export function validateVatReportingProfile(input,today){
 if(input?.confirmed!==true)throw Error("Bekreft registreringsdatoen fra Skatteetaten før lagring.");
 const registrationDate=String(input.registrationDate||"");
 const period=vatDocumentPeriod(registrationDate);
 if(!period||today&&registrationDate>today)throw Error("Oppgi gyldig MVA-registreringsdato fra Skatteetaten, ikke en fremtidig dato.");
 return {id:"primary",registration_date:registrationDate,
  first_term_year:period.year,first_term:period.term};
}
export function validateVatReportingStatus(input,today){
 const y=Number(input?.year),t=Number(input?.term),status=String(input?.status||"");
 const key=vatPeriodKey(y,t);
 if(!key)throw Error("Velg gyldig MVA-termin.");
 if(!["not_filed","preparing","filed"].includes(status))
  throw Error("Velg gyldig status for MVA-meldingen.");
 if(input?.confirmed!==true)throw Error("Du må bekrefte statusen manuelt.");
 const rawDate=String(input?.filedOn||"");
 const filedOn=status==="filed"?rawDate:null;
 if(status==="filed"&&(!isoDate(filedOn)||filedOn>today))
  throw Error("Oppgi faktisk innsendingsdato fra Skatteetaten.");
 if(status==="filed"&&typeof input?.submissionReference!=="string")
  throw Error("Kontroller innsendingsreferansen.");
 const notes=String(input?.notes||"").trim(),reference=String(input?.submissionReference||"").trim();
 if(notes.length>500||reference.length>160)throw Error("Notat eller referanse er for langt.");
 return {year:y,term:t,status,filed_on:filedOn,
  submission_reference:status==="filed"?reference:null,notes:notes||null};
}
export function vatReportingAdvice(profile,year,term){
 if(!profile)return {kind:"unknown",text:"MVA-registreringen er ikke bekreftet her. Ikke bruk avstemmingen som ferdig MVA-melding."};
 const a=vatPeriodKey(year,term),b=vatPeriodKey(profile.first_term_year,profile.first_term);
 if(!a||!b)return {kind:"unknown",text:"MVA-termin kan ikke vurderes."};
 if(a<b)return {kind:"before_registration",text:"Terminen er før oppgitt MVA-registrering. Eldre innkjøp kan kreve vurdering av tilbakegående avgiftsoppgjør i registreringsterminen, og skal ikke automatisk inn i en eldre MVA-melding."};
 return {kind:"normal",text:"Oppgitt registreringsdato er kontrollert internt, men den faktiske MVA-meldingen må avstemmes og leveres hos Skatteetaten."};
}

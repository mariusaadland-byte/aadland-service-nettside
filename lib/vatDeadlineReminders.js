// Norwegian standard bi-monthly VAT deadlines.
// Skatteetaten: 10 Apr, 10 Jun, 31 Aug, 10 Oct, 10 Dec, 10 Feb following year.
// Non-working days (including Norwegian public holidays) move to the next working day.
// Dates are local calendar keys, never dependent on server UTC/DST arithmetic.
const MS=86400000;
const ISO=/^\d{4}-\d{2}-\d{2}$/;
function utcDate(year,month,day){return new Date(Date.UTC(year,month-1,day));}
function key(date){return date.toISOString().slice(0,10);}
function addDays(date,days){return new Date(date.getTime()+days*MS);}
function easterSunday(year){
 const a=year%19,b=Math.floor(year/100),c=year%100,
  d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),
  g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30,
  i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k+7)%7,
  m=Math.floor((a+11*h+22*l)/451);
 const month=Math.floor((h+l-7*m+114)/31);
 const day=(h+l-7*m+114)%31+1;
 return utcDate(year,month,day);
}
export function isNorwegianNonWorkingDay(date){
 const day=date.getUTCDay(),year=date.getUTCFullYear();
 if(day===0||day===6)return true;
 const dateKey=key(date);
 const fixed=[year+"-01-01",year+"-05-01",year+"-05-17",year+"-12-25",year+"-12-26"];
 if(fixed.includes(dateKey))return true;
 const easter=easterSunday(year);
 return [-3,-2,0,1,39,49,50].some(offset=>key(addDays(easter,offset))===dateKey);
}
export function vatDeadline(year,term){
 const y=Number(year),t=Number(term);
 if(!Number.isInteger(y)||y<2000||y>2099||!Number.isInteger(t)||t<1||t>6)
  throw Error("Ugyldig MVA-termin.");
 const raw=[
  [y,4,10],[y,6,10],[y,8,31],[y,10,10],[y,12,10],[y+1,2,10]
 ][t-1];
 let date=utcDate(...raw);
 for(let n=0;n<8&&isNorwegianNonWorkingDay(date);n++)date=addDays(date,1);
 if(isNorwegianNonWorkingDay(date))throw Error("MVA-frist kunne ikke beregnes.");
 return key(date);
}
export function daysBetweenCivilDates(start,end){
 if(!ISO.test(start)||!ISO.test(end))throw Error("Ugyldig kalenderdato.");
 const a=Date.parse(start+"T00:00:00Z"),b=Date.parse(end+"T00:00:00Z");
 if(!Number.isFinite(a)||!Number.isFinite(b)||key(new Date(a))!==start||key(new Date(b))!==end)
  throw Error("Ugyldig kalenderdato.");
 return (b-a)/MS;
}
export const VAT_REMINDER_DAYS=[28,14];
export const VAT_TERM_NAMES=[
 "Januar–februar","Mars–april","Mai–juni",
 "Juli–august","September–oktober","November–desember"
];
export function vatDeadlineEvents(today,profile,statuses=[]){
 if(!profile||!Number.isInteger(Number(profile.first_term_year))||
    !Number.isInteger(Number(profile.first_term))||!ISO.test(today))
  return [];
 const first=Number(profile.first_term_year)*10+Number(profile.first_term);
 const thisYear=Number(today.slice(0,4));
 const statusMap=new Map(statuses.map(s=>[Number(s.year)*10+Number(s.term),s.status]));
 const result=[];
 for(let year=thisYear-1;year<=thisYear+1;year++){
  for(let term=1;term<=6;term++){
   if(year*10+term<first)continue;
   const deadline=vatDeadline(year,term),daysLeft=daysBetweenCivilDates(today,deadline);
   if(daysLeft<0||daysLeft>45)continue;
   const status=statusMap.get(year*10+term)||"unverified";
   result.push({year,term,deadline,daysLeft,status,
    reminderDays:VAT_REMINDER_DAYS.includes(daysLeft)?daysLeft:null});
  }
 }
 return result.sort((a,b)=>a.daysLeft-b.daysLeft);
}
export function vatReminderEmail({year,term,deadline,daysLeft,status}){
 if(!VAT_REMINDER_DAYS.includes(daysLeft))throw Error("Ikke en konfigurert varslingsdag.");
 const currentStatus={
  unverified:"ikke kontrollert i Aadland Service",
  preparing:"registrert som under arbeid",
  not_filed:"manuelt registrert som ikke levert"
 }[status]||"ikke kontrollert";
 return {
  subject:"MVA: "+term+". termin "+year+" – "+daysLeft+" dager til "+deadline,
  text:[
   "Aadland Service – automatisk MVA-fristvarsel",
   "",
   term+". termin "+year+" ("+VAT_TERM_NAMES[term-1]+"): ordinær leverings-/betalingsfrist "+deadline+".",
   "Det er "+daysLeft+" dager til fristen.",
   "Registrert innsendingsstatus er "+currentStatus+". Dette beviser ikke at meldingen ikke er levert hos Skatteetaten.",
   "",
   "Kontroller faktiske MVA-meldinger i Skatteetaten eller Tripletex, og dokumenter status i Aadland Service.",
   "Hvis meldingen er levert, oppdater terminen med dato og kvitteringsreferanse; senere påminnelser stoppes da.",
   "",
   "Aadland Service: https://www.aadland-service.no/admin/faktura/mva#mva-oversikt",
   "",
   "Dette er kun et internt varsel. Ingen MVA-melding er levert, og ingen betaling er utført."
  ].join("\n")
 };
}

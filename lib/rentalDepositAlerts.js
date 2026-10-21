import {shiftDateKey} from "./osloTime";
export function rentalDepositAlerts(bookings,today){
 const lastStart=shiftDateKey(today,2);
 if(!lastStart)throw new Error("Ugyldig varslingsdato.");
 return (bookings||[]).filter(booking=>
  ["confirmed","active"].includes(booking.status)&&
  booking.deposit_status==="not_paid"&&Number(booking.deposit_ore)>0&&
  booking.start_date&&booking.start_date<=lastStart&&booking.end_date>=today
 ).map(booking=>({
  bookingId:booking.id,bookingNumber:booking.booking_number,
  customerName:booking.customer?.name||"Ukjent kunde",
  itemName:booking.rental_items?.name||"Utleieutstyr",
  startDate:booking.start_date,endDate:booking.end_date,
  depositOre:Number(booking.deposit_ore)
 })).sort((a,b)=>a.startDate.localeCompare(b.startDate)||String(a.bookingNumber).localeCompare(String(b.bookingNumber)));
}
export function rentalDepositEmail(items,today){
 const date=day=>day.split("-").reverse().join(".");
 const money=ore=>new Intl.NumberFormat("nb-NO",{style:"currency",currency:"NOK"}).format(ore/100);
 return {subject:"Depositum mangler – "+items.length+" utleie(r) trenger oppfølging",
 body:["Hei!","","Disse leieavtalene starter innen to dager, eller er i gang, og mangler registrert depositum per "+date(today)+".",
 "Følg opp kunden og avtal innbetaling eller reservasjon av depositum før utlevering.","",
 ...items.flatMap(item=>[item.bookingNumber+" – "+item.customerName,item.itemName,"Leiestart: "+date(item.startDate)+" · Depositum: "+money(item.depositOre),""]),
 "Åpne utleiebestillingene: https://www.aadland-service.no/admin",
 "Registrer mottatt/holdt depositum på riktig booking når du har kontrollert betalingen.",
 "Dette er et internt varsel. Det er ikke sendt noe Vipps-krav eller noen e-post til kundene.",
 "Vipps-reservasjon for depositum kobles på etter at løsningen er avklart med Vipps.",
 "Du får en oppdatert oversikt daglig så lenge depositum mangler og leieperioden ikke er avsluttet.","","Aadland Utleie"].join("\n")};
}

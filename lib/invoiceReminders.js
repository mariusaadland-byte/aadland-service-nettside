const money=ore=>new Intl.NumberFormat("nb-NO",{style:"currency",currency:"NOK"}).format(ore/100);
export function reminderDateAfter(day,days=14){
 const value=new Date(day+"T12:00:00Z");value.setUTCDate(value.getUTCDate()+days);return value.toISOString().slice(0,10);
}
export function reminderText(invoice,kind,dueDate,outstandingOre){
 const name=kind==="inkasso"?"Inkassovarsel":"Purring";
 const date=day=>day.split("-").reverse().join(".");
 const description=kind==="inkasso"
  ?"Dersom det utestående beløpet ikke betales innen betalingsfristen, vil kravet bli oversendt til inkasso for videre inndrivelse. Dette kan medføre ytterligere kostnader."
  :"Vi kan ikke se å ha mottatt full betaling for fakturaen. Vi ber om at det gjenstående beløpet betales innen fristen nedenfor.";
 return {subject:name+" – faktura "+invoice.invoice_number,
 body:[name.toUpperCase(),"","Hei "+invoice.customer?.name+"!","",description,"","Faktura: "+invoice.invoice_number,"Kravet gjelder: "+invoice.title,"Opprinnelig forfall: "+date(invoice.due_date),"Gjenstående beløp: "+money(outstandingOre),"Ny betalingsfrist: "+date(dueDate),"Kontonummer: 8450 46 22699","Merk betalingen med fakturanummer "+invoice.invoice_number+".","","Vedlagt følger "+name.toLowerCase()+" og kopi av original faktura.","Har du allerede betalt, kan du se bort fra denne meldingen. Ta kontakt hvis du har spørsmål eller mener kravet er feil.","","Med vennlig hilsen","Aadland Service","Telefon: 471 54 898","E-post: post@aadland-service.no"].join("\n"),
 description};
}
export function nextInvoiceReminder(records,today){
 const pending=records.find(x=>x.status!=="sent");if(pending)return {kind:pending.kind,dueDate:pending.due_date,pending};
 const sent=records.filter(x=>x.status==="sent").sort((a,b)=>String(b.sent_at).localeCompare(String(a.sent_at)));
 const last=sent[0];if(!last)return {kind:"purring",dueDate:reminderDateAfter(today)};
 if(last.kind==="inkasso")return {done:true,dueDate:last.due_date};
 return {kind:"inkasso",dueDate:reminderDateAfter(today),waitUntil:last.due_date};
}

const types={
 change:{label:"Endre leieperiode",question:"Ønsket ny leieperiode (fra–til):"},
 extend:{label:"Forlenge leieperiode",question:"Ønsket ny returdato:"},
 cancel:{label:"Avbestille leie",question:"Eventuelle merknader:"}
};
export function rentalChangeChoices(status){
 if(status==="new"||status==="confirmed")return ["change","extend","cancel"];
 if(status==="active")return ["extend"];
 return [];
}
export function rentalChangeMailto(booking,type,email){
 if(!rentalChangeChoices(booking?.status).includes(type)||!types[type]||!/^[^\s@?&#]+@[^\s@?&#]+\.[^\s@?&#]+$/.test(email||""))return null;
 const safe=v=>String(v??"").replace(/[\r\n]/g," ").slice(0,180);
 const {label,question}=types[type];
 const number=safe(booking.booking_number);
 const subject=label+" – "+number;
 const body=["Hei Aadland Utleie,","","Jeg ønsker å "+label.toLowerCase()+".","Bookingnummer: "+number,"Utstyr: "+safe(booking.rental_items?.name),"Avtalt periode: "+safe(booking.start_date)+" – "+safe(booking.end_date),"",question,"","","Vennligst bekreft mottak og avklar eventuell ny pris, tilgjengelighet og oppgjør."].join("\n");
 return "mailto:"+email+"?subject="+encodeURIComponent(subject)+"&body="+encodeURIComponent(body);
}
export function rentalChangeLabel(type){return types[type]?.label||"";}
export function rentalDateChangeAttempt(body,current){
 return (body.startDate!==undefined&&body.startDate!==current.start_date)||(body.endDate!==undefined&&body.endDate!==current.end_date);
}

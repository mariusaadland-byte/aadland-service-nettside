export function rentalReturnReminderEligible(booking,targetDate){
 return booking?.status==="active"&&!booking.archived_at&&booking.end_date===targetDate&&/^\d{4}-\d{2}-\d{2}$/.test(targetDate)&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(booking.customer?.email||"").trim());
}
export function rentalReturnReminderKey(booking){
 return "rental-return:"+booking.id+":"+booking.end_date;
}
export function rentalReturnReminderMessage(booking,{replyTo,siteUrl,logoHtml=""}){
 const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
 const name=String(booking.customer?.name||"kunde"),item=String(booking.rental_items?.name||"utstyret"),number=String(booking.booking_number||""),date=booking.end_date.split("-").reverse().join(".");
 const text=["Hei "+name+",","","Dette er en påminnelse om avtalt tilbakelevering av "+item+".","Bookingnummer: "+number,"Returdato: "+date,"","Følg avtalen om tidspunkt og sted. Trenger du å forlenge leien, kontakt oss før returdatoen. Opprinnelig returdato gjelder til ny avtale er bekreftet.","Kontakt: "+replyTo+" / 471 54 898",siteUrl+"/min-side","","Aadland Utleie"].join("\n");
 const html='<div style="background:#171717;color:#f5f2ec;padding:28px;font:16px Arial,sans-serif;line-height:1.6">'+logoHtml+'<h1 style="color:#d7a74e">Påminnelse om tilbakelevering</h1><p>Hei '+esc(name)+',</p><p>Husk avtalt tilbakelevering av <b>'+esc(item)+'</b>.</p><p>Bookingnummer: '+esc(number)+'<br>Returdato: <b>'+esc(date)+'</b></p><p>Følg avtalen om tidspunkt og sted. Kontakt oss før returdatoen dersom du trenger forlengelse. Opprinnelig returdato gjelder til ny avtale er bekreftet.</p><p><a style="color:#d7a74e" href="'+esc(siteUrl+'/min-side')+'">Åpne Min side</a></p><p>Aadland Utleie · 471 54 898 · '+esc(replyTo)+'</p></div>';
 return {subject:"Påminnelse om tilbakelevering – Aadland Utleie",text,html};
}

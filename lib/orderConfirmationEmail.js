function esc(value){return String(value??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[ch]))}
function money(ore){return (Number(ore||0)/100).toLocaleString("nb-NO",{minimumFractionDigits:0,maximumFractionDigits:2})+" kr"}

export function buildOrderConfirmationEmail({
 orderNumber,
 customerName,
 totalOre=0,
 isCustom=false,
 fulfillmentType="pickup",
 accountUrl="",
 minSideUrl="",
 vippsPending=false
}){
 const title=isCustom?"Forespørselen er mottatt":"Bestillingen er mottatt";
 const intro=isCustom
  ?"Vi har mottatt forespørselen din og tar kontakt så snart vi kan."
  :vippsPending
   ?"Bestillingen er registrert og Vipps-betalingen er startet. Hvis du allerede har fullført betalingen, trenger du ikke gjøre noe mer."
   :"Takk for bestillingen. Vi tar kontakt dersom noe må avklares før levering eller henting.";
 const actionUrl=accountUrl||minSideUrl;
 const actionLabel=accountUrl?"Åpne Min side →":"Opprett Min side →";
 return `<!doctype html><html><body style="margin:0;background:#111;font-family:Arial,Helvetica,sans-serif;color:#f5f2ec">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#111;padding:28px 12px"><tr><td align="center">
<table role="presentation" width="640" cellpadding="0" cellspacing="0" style="width:100%;max-width:640px;background:#181818;border:1px solid #34312b">
<tr><td style="padding:22px 30px;background:#0d0d0d"><img src="https://www.aadland-service.no/aadland-service-logo.webp" alt="Aadland Service" width="180" style="display:block;width:180px;max-width:100%;height:auto;border:0"/><div style="margin-top:8px;color:#d9b365;font-size:10px;font-weight:800;letter-spacing:.12em">${isCustom?"FORESPØRSEL":"BESTILLING"}</div></td></tr>
<tr><td style="padding:30px">
<div style="color:#d9b365;font-size:11px;font-weight:800;letter-spacing:.12em">${esc(orderNumber)}</div>
<h1 style="font-size:27px;line-height:1.15;margin:9px 0 14px;color:#fff">${esc(title)}</h1>
<p style="color:#c9c3b8;line-height:1.65;margin:0 0 20px">Hei ${esc(customerName||"kunde")}! ${esc(intro)}</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:#101010;border:1px solid #2d2d2d">
<tr><td style="padding:12px 14px;color:#8e887f;font-size:11px">Referanse</td><td style="padding:12px 14px;color:#fff;font-weight:700;text-align:right">${esc(orderNumber)}</td></tr>
${!isCustom?`<tr><td style="padding:12px 14px;color:#8e887f;font-size:11px;border-top:1px solid #2d2d2d">Sum</td><td style="padding:12px 14px;color:#fff;font-weight:700;text-align:right;border-top:1px solid #2d2d2d">${esc(money(totalOre))}</td></tr>`:""}
</table>
${!isCustom&&fulfillmentType==="delivery"?`<div style="margin-top:16px;padding:14px;background:#101010;border:1px solid #2d2d2d"><div style="color:#d9b365;font-size:11px;font-weight:800">LOKAL LEVERING</div><p style="margin:6px 0 0;color:#c9c3b8;line-height:1.55">Leveringsadressen kontrolleres mot leveringsområdet på 15 km før bestillingen bekreftes.</p></div>`:""}
${actionUrl?`<a href="${esc(actionUrl)}" style="display:inline-block;margin-top:20px;${accountUrl?"background:#d7a74e;color:#111":"border:1px solid #d7a74e;color:#d7a74e"};text-decoration:none;font-weight:900;padding:13px 18px">${actionLabel}</a>`:""}
${!accountUrl&&minSideUrl?`<p style="margin:10px 0 0;color:#8e887f;font-size:11px;line-height:1.55">Opprett konto med samme e-postadresse, så kobles bestillinger og tilbud til kontoen din.</p>`:""}
<p style="margin:22px 0 0;color:#8e887f;font-size:11px;line-height:1.55">${isCustom?"Vi tar kontakt videre om forespørselen.":vippsPending?"Dette er en ordrebekreftelse, ikke en kvittering. Kvittering sendes når Vipps-beløpet blir trukket etter at varen eller tjenesten kan leveres.":"Dette er en ordrebekreftelse. Kvittering sendes når betalingen senere er registrert/trukket."}</p>
</td></tr>
<tr><td style="padding:18px 30px;border-top:1px solid #34312b;color:#8e887f;font-size:11px">Aadland Service · 471 54 898 · post@aadland-service.no</td></tr>
</table></td></tr></table></body></html>`;
}

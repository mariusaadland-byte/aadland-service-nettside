function esc(value){
 return String(value??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[ch]));
}
function currency(ore){
 return new Intl.NumberFormat("nb-NO",{style:"currency",currency:"NOK",minimumFractionDigits:2,maximumFractionDigits:2}).format((Number(ore)||0)/100);
}
function dateTime(value){
 const d=value instanceof Date?value:new Date(value||Date.now());
 return d.toLocaleString("nb-NO",{dateStyle:"medium",timeStyle:"short",timeZone:"Europe/Oslo"});
}
function textBlock(value){
 return esc(value).replace(/\n/g,"<br>");
}

export function buildReceiptEmail({
 test=false,
 orderNumber,
 customerName,
 customerEmail="",
 customerPhone="",
 customerAddress="",
 fulfillmentLabel="",
 reference,
 items=[],
 shippingOre=0,
 totalOre=0,
 paidAt=new Date(),
 accountUrl="",
 orderNote="",
 quoteNumber="",
 quoteNote="",
 vatRate=25
}){
 const safeOrder=esc(orderNumber||"—");
 const safeName=esc(customerName||"kunde");
 const safeReference=esc(reference||"—");
 const rate=Math.max(0,Number(vatRate)||0);
 const gross=Math.max(0,Number(totalOre)||0);
 const net=rate>0?Math.round(gross/(1+rate/100)):gross;
 const vat=Math.max(0,gross-net);
 const itemRows=(Array.isArray(items)?items:[]).map(item=>{
  const qty=Math.max(1,Number(item?.quantity)||1);
  const name=esc(item?.name||"Produkt");
  const unit=Number(item?.unitPriceOre)||0;
  const line=unit*qty;
  const details=(Array.isArray(item?.details)?item.details:[])
   .map(detail=>{
    const label=String(detail?.label||"").trim();
    const value=String(detail?.value||"").trim();
    if(!value)return "";
    return `<div style="margin-top:4px;color:#777269;font-size:11px;line-height:1.45">${label?`<b style="color:#555149">${esc(label)}:</b> `:""}${esc(value)}</div>`;
   })
   .filter(Boolean)
   .join("");
  return `<tr>
   <td style="padding:16px 0;border-bottom:1px solid #ece8df;vertical-align:top">
    <div style="color:#20201e;font-size:14px;line-height:1.35;font-weight:800">${name}</div>
    ${details}
    <div style="margin-top:7px;color:#777269;font-size:11px">Antall: <b style="color:#555149">${qty}</b> · Stykkpris: <b style="color:#555149">${esc(currency(unit))}</b></div>
   </td>
   <td style="padding:16px 0 16px 18px;border-bottom:1px solid #ece8df;color:#20201e;font-size:14px;font-weight:800;text-align:right;vertical-align:top;white-space:nowrap">${esc(currency(line))}</td>
  </tr>`;
 }).join("");

 const shippingRow=Number(shippingOre)>0?`<tr>
  <td style="padding:15px 0;border-bottom:1px solid #ece8df;color:#55524c;font-size:14px">Frakt / levering</td>
  <td style="padding:15px 0 15px 18px;border-bottom:1px solid #ece8df;color:#20201e;font-size:14px;font-weight:800;text-align:right;white-space:nowrap">${esc(currency(shippingOre))}</td>
 </tr>`:"";

 const customerRows=[
  customerName?["Kunde",customerName]:null,
  customerEmail?["E-post",customerEmail]:null,
  customerPhone?["Telefon",customerPhone]:null,
  customerAddress?["Adresse",customerAddress]:null,
  fulfillmentLabel?["Levering",fulfillmentLabel]:null
 ].filter(Boolean).map(([label,value],index,arr)=>`<tr>
  <td style="padding:12px 15px;${index<arr.length-1?"border-bottom:1px solid #e5e1d8;":""}width:34%;color:#807b72;font-size:10px;font-weight:800;letter-spacing:.05em">${esc(label.toUpperCase())}</td>
  <td style="padding:12px 15px;${index<arr.length-1?"border-bottom:1px solid #e5e1d8;":""}color:#20201e;font-size:12px;font-weight:700;text-align:right;word-break:break-word">${esc(value)}</td>
 </tr>`).join("");

 const noteSections=[
  orderNote?{label:"MERKNAD TIL BESTILLINGEN",text:orderNote}:null,
  quoteNote?{label:quoteNumber?"NOTAT FRA TILBUD "+quoteNumber:"NOTAT FRA TILBUD",text:quoteNote}:null
 ].filter(Boolean).map(note=>`
 <tr><td style="padding:0 28px 16px">
  <div style="padding:16px 17px;background:#f7f6f2;border-left:3px solid #cfa153">
   <div style="margin-bottom:7px;color:#8b6a2c;font-size:10px;font-weight:900;letter-spacing:.12em">${esc(note.label)}</div>
   <div style="color:#4f4b45;font-size:13px;line-height:1.6">${textBlock(note.text)}</div>
  </div>
 </td></tr>`).join("");

 const testBadge=test?`<div style="margin:0 0 20px"><span style="display:inline-block;padding:7px 10px;border:1px solid #d7a74e;background:#fff8e7;color:#7a5b20;font-size:11px;font-weight:900;letter-spacing:.08em">TEST · INGEN BETALING REGISTRERT</span></div>`:"";

 return `<!doctype html>
<html>
<body style="margin:0;padding:0;background:#efefec;font-family:Arial,Helvetica,sans-serif;color:#20201e">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;background:#efefec;padding:24px 10px">
<tr><td align="center">
<table role="presentation" width="620" cellpadding="0" cellspacing="0" style="width:100%;max-width:620px;background:#ffffff;border-collapse:collapse;border:1px solid #dedbd4">
 <tr>
  <td style="padding:0;background:#11110f">
   <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    <tr>
     <td style="padding:18px 28px">
      <table role="presentation" cellpadding="0" cellspacing="0">
       <tr>
        <td style="vertical-align:middle">
         <img src="cid:aadland-service-logo" alt="Aadland Service" width="178" style="display:block;width:178px;max-width:100%;height:auto;border:0;outline:none;text-decoration:none"/>
        </td>
        <td style="padding-left:18px;vertical-align:middle">
         <div style="color:#cfa153;font-size:10px;font-weight:800;letter-spacing:.14em">BETALINGSBEKREFTELSE</div>
        </td>
       </tr>
      </table>
     </td>
     <td style="padding:24px 28px;text-align:right;color:#9b978f;font-size:11px;vertical-align:middle">Org.nr. 937 781 873 MVA</td>
    </tr>
   </table>
  </td>
 </tr>

 <tr>
  <td style="padding:30px 28px 10px">
   ${testBadge}
   <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    <tr>
     <td style="vertical-align:top">
      <div style="color:#8b6a2c;font-size:10px;font-weight:900;letter-spacing:.14em">KVITTERING ${safeOrder}</div>
      <h1 style="margin:8px 0 8px;color:#171714;font-size:28px;line-height:1.15">Betaling mottatt</h1>
      <p style="margin:0;color:#6d6961;font-size:14px;line-height:1.6">Hei ${safeName}. Vi har registrert betalingen din. Her er detaljene for bestillingen.</p>
     </td>
     <td style="width:92px;text-align:right;vertical-align:top">
      <span style="display:inline-block;padding:8px 12px;background:#eaf5ec;border:1px solid #b8d9bf;color:#2c6b38;font-size:11px;font-weight:900;letter-spacing:.08em">BETALT</span>
     </td>
    </tr>
   </table>
  </td>
 </tr>

 <tr>
  <td style="padding:16px 28px 6px">
   <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:#f7f6f2;border:1px solid #e5e1d8">
    <tr>
     <td style="padding:14px 16px;border-bottom:1px solid #e5e1d8;width:38%;color:#807b72;font-size:11px;font-weight:800;letter-spacing:.05em">ORDRENUMMER</td>
     <td style="padding:14px 16px;border-bottom:1px solid #e5e1d8;color:#20201e;font-size:13px;font-weight:800;text-align:right">${safeOrder}</td>
    </tr>
    <tr>
     <td style="padding:14px 16px;border-bottom:1px solid #e5e1d8;color:#807b72;font-size:11px;font-weight:800;letter-spacing:.05em">BETALINGSDATO</td>
     <td style="padding:14px 16px;border-bottom:1px solid #e5e1d8;color:#20201e;font-size:13px;font-weight:800;text-align:right">${esc(dateTime(paidAt))}</td>
    </tr>
    <tr>
     <td style="padding:14px 16px;${quoteNumber?"border-bottom:1px solid #e5e1d8;":""}color:#807b72;font-size:11px;font-weight:800;letter-spacing:.05em">REFERANSE</td>
     <td style="padding:14px 16px;${quoteNumber?"border-bottom:1px solid #e5e1d8;":""}color:#20201e;font-size:13px;font-weight:800;text-align:right;word-break:break-word">${safeReference}</td>
    </tr>
    ${quoteNumber?`<tr>
     <td style="padding:14px 16px;color:#807b72;font-size:11px;font-weight:800;letter-spacing:.05em">TILBUDSNUMMER</td>
     <td style="padding:14px 16px;color:#20201e;font-size:13px;font-weight:800;text-align:right">${esc(quoteNumber)}</td>
    </tr>`:""}
   </table>
  </td>
 </tr>

 ${customerRows?`<tr><td style="padding:14px 28px 6px">
  <div style="margin-bottom:8px;color:#8b6a2c;font-size:10px;font-weight:900;letter-spacing:.14em">KUNDE OG LEVERING</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:#f7f6f2;border:1px solid #e5e1d8">${customerRows}</table>
 </td></tr>`:""}

 <tr>
  <td style="padding:20px 28px 4px">
   <div style="margin-bottom:8px;color:#8b6a2c;font-size:10px;font-weight:900;letter-spacing:.14em">BESTILLING</div>
   <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
    ${itemRows||`<tr><td style="padding:15px 0;border-bottom:1px solid #ece8df;color:#6d6961;font-size:14px">Bestilling</td><td style="padding:15px 0;border-bottom:1px solid #ece8df"></td></tr>`}
    ${shippingRow}
   </table>
  </td>
 </tr>

 ${noteSections}

 <tr>
  <td style="padding:18px 28px 30px">
   <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:10px">
    <tr>
     <td style="padding:8px 4px;color:#777269;font-size:11px">Sum eks. MVA</td>
     <td style="padding:8px 4px;color:#555149;font-size:12px;font-weight:700;text-align:right">${esc(currency(net))}</td>
    </tr>
    <tr>
     <td style="padding:8px 4px;color:#777269;font-size:11px">MVA ${rate}%</td>
     <td style="padding:8px 4px;color:#555149;font-size:12px;font-weight:700;text-align:right">${esc(currency(vat))}</td>
    </tr>
   </table>
   <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#171714">
    <tr>
     <td style="padding:18px 20px;color:#cfa153;font-size:11px;font-weight:900;letter-spacing:.13em">TOTALT BETALT</td>
     <td style="padding:18px 20px;color:#ffffff;font-size:24px;font-weight:900;text-align:right;white-space:nowrap">${esc(currency(gross))}</td>
    </tr>
   </table>
   <p style="margin:14px 0 0;color:#858078;font-size:11px;line-height:1.55">Ta kontakt med oss dersom noe i betalingsbekreftelsen ikke stemmer.</p>
   ${accountUrl?`<a href="${esc(accountUrl)}" style="display:inline-block;margin-top:18px;background:#cfa153;color:#11110f;text-decoration:none;font-size:12px;font-weight:900;padding:13px 18px">Åpne Min side →</a>`:""}
  </td>
 </tr>

 <tr>
  <td style="padding:20px 28px;background:#f5f3ee;border-top:1px solid #e1ddd4">
   <div style="color:#20201e;font-size:12px;font-weight:900">Aadland Service</div>
   <div style="margin-top:6px;color:#777269;font-size:11px;line-height:1.7">Org.nr. 937 781 873 MVA · 471 54 898<br>
   <a href="mailto:post@aadland-service.no" style="color:#8b6a2c;text-decoration:none">post@aadland-service.no</a> ·
   <a href="https://www.aadland-service.no" style="color:#8b6a2c;text-decoration:none">www.aadland-service.no</a></div>
  </td>
 </tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

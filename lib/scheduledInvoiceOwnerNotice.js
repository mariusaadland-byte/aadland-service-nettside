// Owner-only warning for scheduled invoices that need human review.
// This is deliberately separate from the customer's invoice delivery path.
export function scheduledInvoiceOwnerNotice({invoiceId,reason=""}){
 const id=String(invoiceId||"").trim();
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))
  throw Error("Ugyldig faktura-ID for kontrollvarsel.");
 const explanation=String(reason||"Automatisk sending ble avbrutt eller kunne ikke bekreftes.")
  .replace(/\s+/g," ").slice(0,220);
 return {
  from:"Aadland Service <noreply@aadland-service.no>",
  to:"post@aadland-service.no",
  subject:"Handling kreves: kontroll av planlagt del-faktura",
  text:["Planlagt utsendelse av faktura 2 er stoppet og trenger kontroll.",
   "",
   "Årsak: "+explanation,
   "",
   "Åpne fakturasystemet og finn fakturaen:",
   "https://www.aadland-service.no/admin/faktura?id="+encodeURIComponent(id),
   "",
   "Kontroller mottaker, første faktura og e-postloggen før manuell sending.",
   "Det er ikke bekreftet at e-post ble sendt til kunden.",
   "Dette varselet oppretter ingen faktura og forsøker ikke å sende til kunden."
  ].join("\n"),
  idempotencyKey:"scheduled-invoice-review/"+id
 };
}
export async function sendScheduledInvoiceOwnerNotice({invoiceId,reason,apiKey}){
 if(!apiKey)throw Error("E-posttjenesten er ikke konfigurert.");
 const {idempotencyKey,...payload}=scheduledInvoiceOwnerNotice({invoiceId,reason});
 const {Resend}=await import("resend");
 const result=await new Resend(apiKey).emails.send(payload,{idempotencyKey});
 if(result.error||!result.data?.id)throw Error("Kontrollvarselet kunne ikke bekreftes.");
 return {sent:true};
}

import "server-only";
import crypto from "node:crypto";

const UUID_V4=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Canonicalize nested JSON to recognize the same request irrespective of
// property insertion order. Only server-side SHA-256 is stored in the DB.
function canonical(value){
 if(Array.isArray(value))return value.map(canonical);
 if(value&&typeof value==="object"){
  return Object.fromEntries(Object.keys(value).sort().filter(k=>value[k]!==undefined)
   .map(k=>[k,canonical(value[k])]));
 }
 return value;
}
export function parseOrderIntent(body){
 const key=String(body?.idempotencyKey||"").trim().toLowerCase();
 if(!UUID_V4.test(key))return {error:"Bestillingen mangler en sikker bestillingsnøkkel. Oppdater siden og prøv igjen."};
 const payload={...body};
 delete payload.idempotencyKey;
 const hash=crypto.createHash("sha256").update(JSON.stringify(canonical(payload))).digest("hex");
 return {key,hash};
}

export function existingServiceOrderResponse(order,fingerprint){
 if(!order)return null;
 if(order.checkout_request_fingerprint!==fingerprint)
  return {status:409,payload:{error:"Denne bestillingsnøkkelen er brukt med andre opplysninger. Kontroller bestillingen før du prøver igjen.",intentConflict:true}};
 const vipps=order.payment_provider==="vipps";
 if(order.status==="cancelled"||order.checkout_provider_state==="cancelled")
  return {status:409,payload:{orderNumber:order.order_number,alreadyRecorded:true,
   error:"Denne bestillingen er kansellert. Kontroller Min side eller kontakt oss før du starter en ny bestilling."}};
 if(!vipps)return {status:200,payload:{orderNumber:order.order_number,alreadyRecorded:true,
  confirmationSent:!!order.confirmation_sent_at,payment:{method:"manual"},
  message:"Bestillingen var allerede registrert. Ingen ny bestilling, lagerreservasjon eller e-post er opprettet."}};
 if(order.checkout_provider_state==="ready"&&order.checkout_redirect_url)
  return {status:200,payload:{orderNumber:order.order_number,alreadyRecorded:true,
   confirmationSent:!!order.confirmation_sent_at,
   payment:{method:"vipps",redirectUrl:order.checkout_redirect_url},
   message:"Bestillingen finnes allerede. Fortsett til samme Vipps-betaling."}};
 return {status:202,payload:{orderNumber:order.order_number,alreadyRecorded:true,
  payment:{method:"vipps",pending:true},
  message:"Bestillingen er allerede registrert. Vipps-statusen må avklares før du prøver å betale. Ingen ny ordre eller betalingsforespørsel er opprettet."}};
}

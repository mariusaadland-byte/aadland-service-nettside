const fallbackIntents=new Map();

// Browser-side retry identity for the SAME checkout payload. Only a digest
// and random UUID are kept in sessionStorage (no customer PII, card data,
// photos or secret image-upload receipts).
export async function getCheckoutIntent(payload,storageKey){
 const api=globalThis.crypto;
 if(!api?.randomUUID||!api?.subtle)throw Error("Sikker bestillingsnøkkel kan ikke opprettes. Bruk en oppdatert nettleser.");
 const bytes=new TextEncoder().encode(JSON.stringify(payload));
 const digest=await api.subtle.digest("SHA-256",bytes);
 const hash=Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,"0")).join("");
 let old=null;
 try{
  old=JSON.parse(globalThis.sessionStorage?.getItem(storageKey)||"null");
 }catch{/* Session storage can be blocked by browser privacy settings. */}
 if(!old)old=fallbackIntents.get(storageKey)||null;
 // Do not rotate a still-unconfirmed identical request just because time passed.
 // A previous order or payment may already exist. Clear only on known completion.
 if(old?.hash===hash&&typeof old?.key==="string"&&
  Number.isFinite(old?.createdAt))
  return old.key;
 const key=api.randomUUID();
 const entry={hash,key,createdAt:Date.now()};
 fallbackIntents.set(storageKey,entry);
 try{globalThis.sessionStorage?.setItem(storageKey,JSON.stringify(entry))}
 catch{/* In-memory form state still avoids concurrent submissions. */}
 return key;
}
export function clearCheckoutIntent(storageKey){
 fallbackIntents.delete(storageKey);
 try{globalThis.sessionStorage?.removeItem(storageKey)}catch{}
}

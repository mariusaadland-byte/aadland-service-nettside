import "server-only";
import crypto from "node:crypto";

// Derive a distinct encryption key; do NOT use the session HMAC key directly.
// The existing SESSION_SECRET stays server-only. If rotated, stored JWT
// must be reconnected; this is intentional fail-closed behavior.
function aesKey(){
 const secret=String(process.env.TRIPLETEX_ENCRYPTION_KEY||process.env.SESSION_SECRET||"");
 if(secret.length<32)throw Error("Sikker servernøkkel mangler.");
 return Buffer.from(crypto.hkdfSync("sha256",Buffer.from(secret),
  Buffer.from("aadland-service-tripletex-credential-salt-v1"),
  Buffer.from("tripletex-jwt-aes256gcm-v1"),32));
}
export function protectTripletexToken(value){
 const text=String(value||"").trim();
 if(text.length<30||text.length>8192)throw Error("Ugyldig nøkkellengde.");
 const nonce=crypto.randomBytes(12);
 const cipher=crypto.createCipheriv("aes-256-gcm",aesKey(),nonce);
 const ciphertext=Buffer.concat([cipher.update(text,"utf8"),cipher.final()]);
 return {
  ciphertext:ciphertext.toString("base64"),
  nonce:nonce.toString("base64"),tag:cipher.getAuthTag().toString("base64")
 };
}
export function unprotectTripletexToken(record){
 if(!record?.ciphertext||!record?.nonce||!record?.tag)
  throw Error("Lagret API-nøkkel er ufullstendig.");
 const iv=Buffer.from(record.nonce,"base64");
 const tag=Buffer.from(record.tag,"base64");
 if(iv.length!==12||tag.length!==16)throw Error("Ugyldig kryptert API-nøkkel.");
 const decipher=crypto.createDecipheriv("aes-256-gcm",aesKey(),iv);
 decipher.setAuthTag(tag);
 return Buffer.concat([decipher.update(Buffer.from(record.ciphertext,"base64")),
  decipher.final()]).toString("utf8");
}
export const tripletexConnectionFields="id,environment,ciphertext,nonce,tag,created_at,updated_at,verified_at";
export async function storedTripletexConnection(s){
 const result=await s.from("tripletex_api_connections").select(tripletexConnectionFields)
  .eq("id","primary").maybeSingle();
 if(result.error)throw Error("Kunne ikke lese lagret Tripletex-tilkobling.");
 return result.data||null;
}

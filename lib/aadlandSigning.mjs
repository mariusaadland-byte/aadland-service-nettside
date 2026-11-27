// Node-only primitives. No email delivery or persistence. Never import in a client component.
import {createHash,createHmac,randomInt,randomUUID,timingSafeEqual} from "node:crypto";
import {rentalUnitId} from "./rentalUnitQr.mjs";
export const SIGNING_VERSION="aadland-email-otp-v1";
export const CODE_TTL_MS=10*60*1000, MAX_CODE_ATTEMPTS=5;
export const SIGNING_STATEMENT="Jeg har lest den viste leieavtalen og godtar den avtalte betalingsforpliktelsen og ansvaret som følger av avtalen.";
const hex=v=>typeof v==="string"&&/^[0-9a-f]{64}$/.test(v);
const keyOK=k=>Buffer.isBuffer(k)&&k.length>=32;
const emailOK=v=>typeof v==="string"&&v.length<=254&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)&&v===v.trim().toLowerCase();
const equal=(a,b)=>hex(a)&&hex(b)&&timingSafeEqual(Buffer.from(a,"hex"),Buffer.from(b,"hex"));
export function agreementDocumentDigest(bytes){
 if(!Buffer.isBuffer(bytes)||!bytes.length||bytes.length>10*1024*1024)throw Error("INVALID_DOCUMENT");
 return createHash("sha256").update(bytes).digest("hex");
}
function binding(x){
 return !!x&&rentalUnitId(x.agreementId)&&rentalUnitId(x.customerId)&&hex(x.documentDigest)&&hex(x.quoteDigest)&&emailOK(x.email)&&typeof x.termsVersion==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(x.termsVersion);
}
function mac(key,x,code){
 if(!keyOK(key))throw Error("SIGNING_KEY_INVALID");
 return createHmac("sha256",key).update(JSON.stringify([SIGNING_VERSION,x.challengeId,x.agreementId,x.customerId,x.email,x.documentDigest,x.quoteDigest,x.termsVersion,x.issuedAt,x.expiresAt,code])).digest("hex");
}
// Email must come from a fresh, confirmed auth account, not the form or profile.
export function issueSigningChallenge({agreementId,customerId,email,documentDigest,quoteDigest,termsVersion,now,key}){
 const t=Date.parse(now),b={agreementId,customerId,email,documentDigest,quoteDigest,termsVersion};
 if(!binding(b)||!Number.isFinite(t)||!keyOK(key))throw Error("INVALID_SIGNING_CONTEXT");
 const code=String(randomInt(0,1000000)).padStart(6,"0");
 const challenge={...b,challengeId:randomUUID(),issuedAt:new Date(t).toISOString(),expiresAt:new Date(t+CODE_TTL_MS).toISOString(),attempts:0,state:"pending"};
 return {code,challenge:{...challenge,codeMac:mac(key,challenge,code)}};
}
// Decision only. Caller MUST hold a database lock, persist attempts even when
// wrong, atomically consume on success and create append-only evidence.
export function verifySigningCode({challenge,expected,code,now,key}){
 if(!binding(challenge)||!binding(expected)||!rentalUnitId(challenge.challengeId)||!keyOK(key))return "review";
 if(["agreementId","customerId","email","documentDigest","quoteDigest","termsVersion"].some(k=>challenge[k]!==expected[k]))return "review";
 if(challenge.state!=="pending")return "closed";
 if(!Number.isInteger(challenge.attempts)||challenge.attempts<0)return "review";
 if(challenge.attempts>=MAX_CODE_ATTEMPTS)return "locked";
 const t=Date.parse(now),issued=Date.parse(challenge.issuedAt),expiry=Date.parse(challenge.expiresAt);
 if(!Number.isFinite(t)||!Number.isFinite(issued)||!Number.isFinite(expiry)||expiry-issued!==CODE_TTL_MS||t<issued)return "review";
 if(t>=expiry)return "expired";
 if(typeof code!=="string"||!/^\d{6}$/.test(code)||!equal(challenge.codeMac,mac(key,challenge,code)))return "wrong_code";
 return "verified";
}
export function signingConsent(input,expected){
 if(!binding(expected)||input?.accepted!==true||input?.paymentObligation!==true||input.documentDigest!==expected.documentDigest||input.quoteDigest!==expected.quoteDigest||input.termsVersion!==expected.termsVersion)return null;
 const name=typeof input.name==="string"?input.name.trim():"";
 if(name.length<2||name.length>120||/[\x00-\x1f\x7f]/.test(name))return null;
 return {name,statement:SIGNING_STATEMENT,statementVersion:SIGNING_VERSION};
}
// Internal evidence construction only, AFTER successful verification inside transaction.
// A server HMAC is an integrity seal, not a qualified electronic signature or identity proof.
export function sealSigningEvidence({expected,challenge,consent,verifiedAt,key}){
 if(!binding(expected)||!binding(challenge)||!rentalUnitId(challenge.challengeId)||!keyOK(key)||!consent||consent.statement!==SIGNING_STATEMENT||consent.statementVersion!==SIGNING_VERSION||typeof consent.name!=="string"||consent.name.trim().length<2||consent.name.length>120||/[\x00-\x1f\x7f]/.test(consent.name)||["agreementId","customerId","email","documentDigest","quoteDigest","termsVersion"].some(k=>expected[k]!==challenge[k])||challenge.state!=="consumed")return null;
 const t=Date.parse(verifiedAt),a=Date.parse(challenge.issuedAt),b=Date.parse(challenge.expiresAt);
 if(!Number.isFinite(t)||!Number.isFinite(a)||!Number.isFinite(b)||b-a!==CODE_TTL_MS||t<a||t>=b)return null;
 const evidence={version:SIGNING_VERSION,method:"typed_name_email_otp",agreementId:expected.agreementId,customerId:expected.customerId,email:expected.email,documentDigest:expected.documentDigest,quoteDigest:expected.quoteDigest,termsVersion:expected.termsVersion,challengeId:challenge.challengeId,name:consent.name,statement:SIGNING_STATEMENT,signedAt:new Date(t).toISOString()};
 const seal=createHmac("sha256",key).update("evidence-v1:"+JSON.stringify(evidence)).digest("hex");
 return {evidence,seal};
}
export function signingEvidenceIntact(record,key){
 if(!keyOK(key)||!record?.evidence||record.evidence.version!==SIGNING_VERSION)return false;
 return equal(record.seal,createHmac("sha256",key).update("evidence-v1:"+JSON.stringify(record.evidence)).digest("hex"));
}

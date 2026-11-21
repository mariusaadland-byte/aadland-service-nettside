import "server-only";
import crypto from "node:crypto";

const CONTACT_PREFIX="private-image:contact-images:";
const PATH_RE=/^contact\/[0-9]{4}-[0-9]{2}-[0-9]{2}\/[0-9a-f-]{36}\.(?:jpg|png|webp)$/i;
const PROOF_RE=/^[0-9a-f]{64}$/i;

export function privateContactImagePath(ref){
 const value=String(ref||"");
 if(!value.startsWith(CONTACT_PREFIX))return null;
 const path=value.slice(CONTACT_PREFIX.length);
 return PATH_RE.test(path)?path:null;
}

export function createContactImageReceipt(path){
 if(!PATH_RE.test(String(path||"")))throw Error("Invalid private contact image path");
 const proof=crypto.randomBytes(32).toString("hex");
 return {
  ref:CONTACT_PREFIX+path,
  receipt:proof,
  receiptHash:crypto.createHash("sha256").update(proof).digest("hex")
 };
}

export function validateContactImageReceipts(entries){
 if(!Array.isArray(entries)||entries.length>8)throw Error("For mange bildekvitteringer.");
 const seen=new Set(),proofs=[];
 for(const value of entries){
  const path=privateContactImagePath(value?.ref);
  const receipt=String(value?.receipt||"").trim().toLowerCase();
  if(!path||!PROOF_RE.test(receipt)||seen.has(path))
   throw Error("Ugyldig eller duplisert bildekvittering. Last opp bildet på nytt.");
  seen.add(path);
  proofs.push({
   path,receiptHash:crypto.createHash("sha256").update(receipt).digest("hex")
  });
 }
 return proofs;
}

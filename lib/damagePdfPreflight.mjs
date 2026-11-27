import {createHash} from "node:crypto";
import {DAMAGE_MAX_BYTES} from "./damageEvidence.mjs";
// File-format preflight ONLY. Not a PDF parser, sanitizer or malware scanner.
export function damagePdfPreflight(bytes,type){
 if(type!=="application/pdf"||!Buffer.isBuffer(bytes)||bytes.length<32||bytes.length>DAMAGE_MAX_BYTES)return null;
 const head=bytes.subarray(0,12).toString("ascii"),tail=bytes.subarray(Math.max(0,bytes.length-2048)).toString("ascii");
 if(!/^%PDF-(?:1\.[0-7]|2\.0)[\r\n]/.test(head)||!/%%EOF\s*$/.test(tail))return null;
 return {digest:createHash("sha256").update(bytes).digest("hex"),type,extension:"pdf",size:bytes.length,preflightOnly:true};
}

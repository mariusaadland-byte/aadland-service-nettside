import crypto from "node:crypto";
export const vatAttachmentBucket="aadland-vat-documents";
export const MAX_VAT_FILE_SIZE=4*1024*1024;
export const vatAttachmentTypes={
 "application/pdf":{ext:"pdf",label:"PDF"},
 "image/jpeg":{ext:"jpg",label:"JPEG"},
 "image/png":{ext:"png",label:"PNG"},
 "image/webp":{ext:"webp",label:"WebP"}
};
export function safeVatAttachmentFilename(name){
 const cleaned=String(name||"").normalize("NFKC")
  .replace(/[\\/\u0000-\u001f\u007f<>:"|?*]/g,"_")
  .trim().slice(0,160).replace(/^[.\s]+/,"");
 return cleaned||"bilag";
}
export function inspectVatAttachment(buffer,mimeType,originalName){
 if(!Buffer.isBuffer(buffer)||buffer.length<12||buffer.length>MAX_VAT_FILE_SIZE)
  throw Error("Bilaget må være PDF/JPG/PNG/WebP på maks 4 MB.");
 const t=vatAttachmentTypes[mimeType];
 if(!t)throw Error("Kun PDF, JPG, PNG eller WebP kan lastes opp.");
 const png=buffer.subarray(0,8).equals(Buffer.from("89504e470d0a1a0a","hex"));
 const jpg=buffer.subarray(0,3).equals(Buffer.from("ffd8ff","hex"));
 const pdf=buffer.subarray(0,5).toString("ascii")==="%PDF-";
 const webp=buffer.subarray(0,4).toString("ascii")==="RIFF"&&
  buffer.subarray(8,12).toString("ascii")==="WEBP";
 const valid=t.ext==="pdf"?pdf:t.ext==="jpg"?jpg:t.ext==="png"?png:webp;
 if(!valid)throw Error("Filinnhold og valgt filtype stemmer ikke.");
 const filename=safeVatAttachmentFilename(originalName);
 const ext=filename.split(".").pop().toLowerCase();
 const accepted=t.ext==="jpg"?["jpg","jpeg"]:[t.ext];
 if(!accepted.includes(ext))throw Error("Filnavnet må ha riktig filendelse for filtypen.");
 return {mimeType,filename,fileSize:buffer.length,sha256:crypto.createHash("sha256").update(buffer).digest("hex"),ext:t.ext};
}
export function vatAttachmentDownloadName(value){
 return safeVatAttachmentFilename(value).replace(/[^a-zA-Z0-9_.-]/g,"_");
}

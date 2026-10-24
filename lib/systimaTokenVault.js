import crypto from "node:crypto";
export function secureSystimaSeal(value,keyBase64){
 const key=Buffer.from(String(keyBase64||""),"base64");
 if(key.length!==32)throw Error("Ugyldig nøkkel.");
 const iv=crypto.randomBytes(12);
 const cipher=crypto.createCipheriv("aes-256-gcm",key,iv);
 const data=Buffer.from(JSON.stringify(value),"utf8");
 const encrypted=Buffer.concat([cipher.update(data),cipher.final()]);
 return [iv.toString("base64url"),encrypted.toString("base64url"),cipher.getAuthTag().toString("base64url")].join(".");
}
export function secureSystimaOpen(blob,keyBase64){
 const key=Buffer.from(String(keyBase64||""),"base64");
 if(key.length!==32)throw Error("Ugyldig nøkkel.");
 const parts=String(blob||"").split(".");
 if(parts.length!==3)throw Error("Ugyldig kryptert verdi.");
 const d=crypto.createDecipheriv("aes-256-gcm",key,Buffer.from(parts[0],"base64url"));
 d.setAuthTag(Buffer.from(parts[2],"base64url"));
 return JSON.parse(Buffer.concat([d.update(Buffer.from(parts[1],"base64url")),d.final()]).toString("utf8"));
}

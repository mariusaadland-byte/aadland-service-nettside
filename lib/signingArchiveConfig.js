import "server-only";
export function signingArchiveEnabled(){return process.env.VERCEL_ENV==="production"&&process.env.AADLAND_SIGNING_ENABLED==="true"&&process.env.AADLAND_SIGNING_ARCHIVE_ENABLED==="true";}
export function evidenceKey(id){
 try{
  if(typeof id!=="string"||!/^[a-zA-Z0-9_-]{1,64}$/.test(id))return null;
  const keys=JSON.parse(process.env.AADLAND_SIGNING_KEYS_JSON||"{}");
  if(!Object.hasOwn(keys,id)||typeof keys[id]!=="string"||! /^[A-Za-z0-9+/]{43}=$/.test(keys[id]))return null;
  const key=Buffer.from(keys[id],"base64");return key.length===32?key:null;
 }catch{return null;}
}

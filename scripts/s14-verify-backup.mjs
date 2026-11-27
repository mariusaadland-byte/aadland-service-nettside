// Offline, read-only verification. The expected manifest MUST come from
// an independently authenticated source inventory, not the downloaded copy.
import {createHash} from "node:crypto";
import {createReadStream} from "node:fs";
import {lstat,readFile,realpath} from "node:fs/promises";
import path from "node:path";
import {pathToFileURL} from "node:url";
const required=["roles.sql","schema.sql","data.sql"];
export async function verifyBackup(root,manifest){
 if(manifest?.version!==1||manifest.projectRef!=="codaywjmjmtvvnzzaaas"||
    !Number.isFinite(Date.parse(manifest.snapshotAt))||!Array.isArray(manifest.files)||
    !manifest.storageCounts||typeof manifest.storageCounts!=="object")throw Error("Ugyldig kildemanifest");
 const base=await realpath(root);
 const seen=new Set(),counts=new Map();
 let bytes=0;
 for(const entry of manifest.files){
  const key=entry?.path;
  if(typeof key!=="string"||key.includes("\\")||key.includes("\0")||
   key.split("/").some(x=>!x||x==="."||x==="..")||seen.has(key)||
   !Number.isSafeInteger(entry.bytes)||entry.bytes<1||
   !/^[a-f0-9]{64}$/.test(entry.sha256))throw Error("Ugyldig filoppføring");
  const parts=key.split("/");
  if(parts[0]==="storage"){
   if(parts.length<3||!Object.hasOwn(manifest.storageCounts,parts[1]))throw Error("Ukjent bøtte");
   counts.set(parts[1],(counts.get(parts[1])||0)+1);
  }
  seen.add(key);
  let candidate=base;
  for(const part of parts){
   candidate=path.join(candidate,part);
   const st=await lstat(candidate).catch(()=>null);
   if(!st||st.isSymbolicLink())throw Error("Fil mangler eller har symbolsk lenke");
  }
  const st=await lstat(candidate);
  if(!st.isFile()||st.size!==entry.bytes)throw Error("Uventet filstørrelse");
  const hash=createHash("sha256");
  for await(const chunk of createReadStream(candidate))hash.update(chunk);
  if(hash.digest("hex")!==entry.sha256)throw Error("SHA-256 avvik");
  bytes+=st.size;
 }
 for(const key of required)if(!seen.has(key))throw Error("Databasedump mangler");
 for(const bucket of ["aadland-vat-documents","contact-images","product-images"])
  if(!Object.hasOwn(manifest.storageCounts,bucket))throw Error("Påkrevd bøtte mangler i manifest");
 for(const [bucket,count] of Object.entries(manifest.storageCounts))
  if(!Number.isSafeInteger(count)||count<0||(counts.get(bucket)||0)!==count)throw Error("Antall Storage-filer avviker");
 return {verifiedFiles:seen.size,verifiedBytes:bytes,storageFiles:[...counts.values()].reduce((a,b)=>a+b,0),
  scope:"manifest-byte-integrity-only",restoreVerified:false};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 try{
  if(process.argv.length!==4)throw Error("Bruk: node scripts/s14-verify-backup.mjs PRIVATE_BACKUP_ROOT TRUSTED_MANIFEST_JSON");
  const manifest=JSON.parse(await readFile(process.argv[3],"utf8"));
  console.log(JSON.stringify(await verifyBackup(process.argv[2],manifest)));
 }catch(e){console.error("S14: verifisering feilet; kontroller manifest og filer lokalt.");process.exitCode=1;}
}

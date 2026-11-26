import "server-only";
import crypto from "crypto";

const PWNED_PASSWORDS_URL="https://api.pwnedpasswords.com/range/";
const PASSWORD_CHECK_TIMEOUT_MS=5000;

async function isCompromisedPassword(password){
 const hash=crypto.createHash("sha1").update(String(password),"utf8").digest("hex").toUpperCase();
 const prefix=hash.slice(0,5);
 const suffix=hash.slice(5);
 const controller=new AbortController();
 const timeout=setTimeout(()=>controller.abort(),PASSWORD_CHECK_TIMEOUT_MS);

 try{
  const response=await fetch(PWNED_PASSWORDS_URL+prefix,{
   method:"GET",
   headers:{
    "user-agent":"Aadland-Service/1.0",
    "Add-Padding":"true"
   },
   cache:"no-store",
   signal:controller.signal
  });

  if(!response.ok)throw new Error("Pwned Passwords svarte "+response.status);

  const body=await response.text();
  // A successful HTTP response is not sufficient: reject invalid range data.
  const lines=body.trim().split(/\r?\n/);
  if(lines.length<1||lines.length>100000)throw Error("Ugyldig passordkontrollsvar.");
  let compromised=false;
  for(const line of lines){
   const match=/^([0-9A-F]{35}):([0-9]+)$/i.exec(line.trim());
   if(!match||!Number.isSafeInteger(Number(match[2])))throw Error("Ugyldig passordkontrollsvar.");
   if(match[1].toUpperCase()===suffix&&Number(match[2])>0)compromised=true;
  }
  return compromised;
 }finally{
  clearTimeout(timeout);
 }
}

export async function checkNewPassword(password){
 const value=String(password||"");
 if(value.length<8||value.length>128){
  return {ok:false,status:400,error:"Passordet må være mellom 8 og 128 tegn."};
 }

 try{
  if(await isCompromisedPassword(value)){
   return {
    ok:false,
    status:400,
    error:"Dette passordet er kjent fra tidligere datalekkasjer. Velg et annet passord."
   };
  }
  return {ok:true};
 }catch(error){
  console.error("PWNED PASSWORD CHECK FAILED");
  return {
   ok:false,
   status:503,
   error:"Passordsikkerheten kunne ikke kontrolleres akkurat nå. Prøv igjen."
  };
 }
}

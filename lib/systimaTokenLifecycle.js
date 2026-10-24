import {secureSystimaOpen,secureSystimaSeal} from "./systimaTokenVault";
import {systimaSetupStatus} from "./systimaIntegrationStatus";

export function systimaTokenDates(credentials,now=Date.now()){
 const evaluate=value=>{
  if(typeof value!=="string"||!value)return {status:"unknown",at:null};
  const stamp=Date.parse(value);
  if(!Number.isFinite(stamp))return {status:"unknown",at:null};
  const at=new Date(stamp).toISOString();
  return {status:stamp<=now?"expired":stamp-now<=15*60*1000?"expiring":"valid",at};
 };
 return {access:evaluate(credentials?.expiresAt),refresh:evaluate(credentials?.refreshTokenExpiresAt)};
}
export function systimaPublicTokenHealth(encrypted,key,now=Date.now()){
 if(!encrypted)return {status:"not_connected",accessExpiresAt:null,refreshExpiresAt:null};
 try{
  const credentials=secureSystimaOpen(encrypted,key);
  const dates=systimaTokenDates(credentials,now);
  return {status:dates.refresh.status==="expired"?"reauthorize":
   dates.access.status==="expired"?"needs_refresh":
   dates.access.status==="expiring"?"expiring":"token_stored",
   accessExpiresAt:dates.access.at,refreshExpiresAt:dates.refresh.at,
   expiryVerified:dates.access.status!=="unknown"&&dates.refresh.status!=="unknown"};
 }catch{
  return {status:"cannot_read",accessExpiresAt:null,refreshExpiresAt:null,expiryVerified:false};
 }
}
export async function refreshSystimaTokens(ciphertext,env=process.env,fetcher=fetch){
 const setup=systimaSetupStatus(env);
 if(!setup.connectionAvailable)throw Error("Systima OAuth er ikke aktivert eller konfigurert.");
 const current=secureSystimaOpen(ciphertext,env.SYSTIMA_TOKEN_ENCRYPTION_KEY);
 if(typeof current?.refreshToken!=="string"||!current.refreshToken||
  current.refreshToken.length>16000)throw Error("Ingen gyldig oppfriskningstoken lagret.");
 const refreshExpiry=systimaTokenDates(current).refresh;
 if(refreshExpiry.status==="expired")
  throw Error("Oppfriskningstoken er utløpt. Systima må godkjennes på nytt.");
 // Target is restricted by allowlist validation in systimaSetupStatus.
 const controller=new AbortController();
 const timer=setTimeout(()=>controller.abort(),12000);
 let response;
 try{
  response=await fetcher(env.SYSTIMA_TOKEN_URL,{
   method:"POST",redirect:"error",cache:"no-store",signal:controller.signal,
   headers:{"Content-Type":"application/json","Accept":"application/json"},
   body:JSON.stringify({
    clientId:env.SYSTIMA_CLIENT_ID,
    clientSecret:env.SYSTIMA_CLIENT_SECRET,
    redirectUri:env.SYSTIMA_REDIRECT_URI,
    grantType:"refresh_token",refreshToken:current.refreshToken
   })
  });
 }finally{clearTimeout(timer);}
 if(!response?.ok)throw Error("Systima godtok ikke tokenfornyelsen. Godkjenn på nytt ved behov.");
 const data=await response.json().catch(()=>null);
 if(!data||typeof data.accessToken!=="string"||!data.accessToken||
  data.accessToken.length>16000||
  typeof data.refreshToken!=="string"||!data.refreshToken||
  data.refreshToken.length>16000)
  throw Error("Systima returnerte ikke et komplett, gyldig tokenpar.");
 const refreshed={
  accessToken:data.accessToken,refreshToken:data.refreshToken,
  expiresAt:String(data.expiresAt||"").slice(0,128),
  refreshTokenExpiresAt:String(data.refreshTokenExpiresAt||"").slice(0,128)
 };
 const encrypted=secureSystimaSeal(refreshed,env.SYSTIMA_TOKEN_ENCRYPTION_KEY);
 return {encrypted,health:systimaPublicTokenHealth(encrypted,env.SYSTIMA_TOKEN_ENCRYPTION_KEY)};
}

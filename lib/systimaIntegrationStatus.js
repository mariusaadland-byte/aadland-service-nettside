export const SYSTIMA_CALLBACK_PATH="/api/admin/systima/callback";
export const SYSTIMA_AUTHORIZATION_URL="https://app.systima.no/oauth/login";
export const SYSTIMA_API_REFERENCE="https://hjelp.systima.no/support/solutions/articles/150000171542-api-for-3rd-part-and-end-users-systima-";
const allowedHosts=new Set(["api-systima.azurewebsites.net","api.systima.no","api-stage-systima.azurewebsites.net"]);
export function systimaSetupStatus(env=process.env){
 const enabled=String(env.SYSTIMA_OAUTH_ENABLED||"").trim().toLowerCase()==="true";
 const missing=[];
 if(!String(env.SYSTIMA_CLIENT_ID||"").trim())missing.push("SYSTIMA_CLIENT_ID");
 if(!String(env.SYSTIMA_CLIENT_SECRET||"").trim())missing.push("SYSTIMA_CLIENT_SECRET");
 let tokenEndpointValid=false;
 try{
  const url=new URL(env.SYSTIMA_TOKEN_URL);
  tokenEndpointValid=url.protocol==="https:"&&allowedHosts.has(url.hostname)&&
   ["/token","/api-external/token"].includes(url.pathname)&&
   !url.search&&!url.hash&&!url.username&&!url.password;
 }catch{}
 if(!tokenEndpointValid)missing.push("SYSTIMA_TOKEN_URL");
 let callbackValid=false;
 try{
  const callback=new URL(env.SYSTIMA_REDIRECT_URI);
  const site=new URL(env.NEXT_PUBLIC_SITE_URL);
  callbackValid=callback.protocol==="https:"&&callback.origin===site.origin&&
   callback.pathname===SYSTIMA_CALLBACK_PATH&&!callback.search&&!callback.hash;
 }catch{}
 if(!callbackValid)missing.push("SYSTIMA_REDIRECT_URI");
 const key=String(env.SYSTIMA_TOKEN_ENCRYPTION_KEY||"");
 if(!/^[A-Za-z0-9+/]{43}=$/.test(key))missing.push("SYSTIMA_TOKEN_ENCRYPTION_KEY");
 return {enabled,configurationComplete:missing.length===0,
  connectionAvailable:enabled&&missing.length===0,
  missing,callbackPath:SYSTIMA_CALLBACK_PATH,
  invoiceEndpointVerified:false,autoImportEnabled:false,readOnly:true,
  note:"Lesing av leverandørbilag er ikke aktivert. Krever godkjent Systima-integrasjon, korrekt lese-API, selskaps-ID og dokumentert MVA-mapping."};
}

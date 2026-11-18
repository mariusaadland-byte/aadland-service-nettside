import "server-only";

// Only these two verified Tripletex domains can ever receive credentials.
// Never let a browser argument supply a hostname or request path.
const BASE_URL={
 production:"https://tripletex.no/v2",
 test:"https://api-test.tripletex.tech/v2"
};
const timeoutMs=15000;
export const tripletexEnvironment=env=>BASE_URL[env]?env:null;

export class TripletexApiError extends Error{
 constructor(message,status=0){
  super(message);this.name="TripletexApiError";this.status=status;
 }
}
async function tripletexHttp(fetcher,url,{method="GET",body=null,sessionToken=null}={}){
 const headers={"Accept":"application/json"};
 if(body!==null)headers["Content-Type"]="application/json";
 if(sessionToken)headers.Authorization="Basic "+Buffer.from("0:"+sessionToken).toString("base64");
 let response;
 try{
  response=await fetcher(url,{method,headers,body:body===null?undefined:JSON.stringify(body),
   signal:AbortSignal.timeout(timeoutMs),cache:"no-store",redirect:"error"});
 }catch{
  throw new TripletexApiError("Kunne ikke kontakte Tripletex sikkert. Kontroller nettverk eller prøv igjen.");
 }
 if(!response.ok){
  // Do not return provider bodies or credentials to client logs.
  const msg=response.status===401?"Tripletex avviste API-nøkkelen eller tilgangssesjonen.":
   response.status===403?"Tripletex-nøkkelen mangler nødvendige tilganger.":
   response.status===429?"Tripletex har for mange forespørsler. Prøv senere.":
   "Tripletex returnerte HTTP "+response.status+".";
  throw new TripletexApiError(msg,response.status);
 }
 try{return await response.json();}catch{
  throw new TripletexApiError("Tripletex svarte ikke med gyldig JSON.");
 }
}
export async function tripletexOpenSession(refreshToken,environment,{fetcher=fetch}={}){
 const env=tripletexEnvironment(environment);
 if(!env)throw new TripletexApiError("Ukjent Tripletex-miljø.");
 const token=String(refreshToken||"").trim();
 if(token.length<30||token.length>8192||!(/^[A-Za-z0-9._-]+$/.test(token)))
  throw new TripletexApiError("Skriv inn en gyldig API-nøkkel fra Tripletex.");
 const response=await tripletexHttp(fetcher,BASE_URL[env]+"/token/session/:createFromRefreshToken",{
  method:"POST",body:{refreshToken:token,ttlSeconds:900}
 });
 const session=response?.value?.token||response?.token;
 if(typeof session!=="string"||session.length<8)
  throw new TripletexApiError("Tripletex opprettet ingen gyldig tilgangssesjon.");
 return session;
}
export async function tripletexRead(path,sessionToken,environment,{fetcher=fetch}={}){
 const env=tripletexEnvironment(environment);
 if(!env||!/^\/[a-zA-Z0-9/:>_-]+(?:\?[a-zA-Z0-9%&=,._:-]+)?$/.test(path)||
  path.includes("//")||!sessionToken)
  throw new TripletexApiError("Ugyldig forespørsel til Tripletex.");
 return tripletexHttp(fetcher,BASE_URL[env]+path,{sessionToken});
}
export async function tripletexCheckConnection(refreshToken,environment,{fetcher=fetch}={}){
 const session=await tripletexOpenSession(refreshToken,environment,{fetcher});
 const who=await tripletexRead("/token/session/>whoAmI",session,environment,{fetcher});
 if(!who||typeof who!=="object")throw new TripletexApiError("Tripletex kunne ikke bekrefte kontoen.");
 // Use read-only requests to verify important invoice integration permissions.
 // Invoice searches require BOTH date bounds in Tripletex's OpenAPI.
 const today=new Date();
 const to=today.toISOString().slice(0,10);
 const from=new Date(today.getTime()-31*86400000).toISOString().slice(0,10);
 const probes=[
  ["customer","/customer?count=1"],
  ["invoices","/invoice?invoiceDateFrom="+from+"&invoiceDateTo="+to+"&count=1"],
  ["paymentTypes","/invoice/paymentType?count=1"],
  ["vatTypes","/ledger/vatType?count=1"]
 ];
 const access={};
 for(const [key,path] of probes){
  try{await tripletexRead(path,session,environment,{fetcher});access[key]=true;}
  catch{access[key]=false;}
 }
 return {connected:true,environment,access,
  readyForInvoiceMapping:access.customer&&access.invoices&&access.paymentTypes&&access.vatTypes};
}


// Explicit write endpoint. Never accept a client-supplied URL or arbitrary method.
export async function tripletexCreateCustomer(payload,sessionToken,environment,{fetcher=fetch}={}){
 const env=tripletexEnvironment(environment);
 if(!env||!sessionToken||!payload||typeof payload.name!=="string"||!payload.name.trim())
  throw new TripletexApiError("Ugyldig kundeoverføring til Tripletex.");
 const result=await tripletexHttp(fetcher,BASE_URL[env]+"/customer",{
  method:"POST",body:payload,sessionToken
 });
 const id=Number(result?.value?.id);
 if(!Number.isSafeInteger(id)||id<1)
  throw new TripletexApiError("Tripletex bekreftet ikke kunde-ID. Kontroller Tripletex før nytt forsøk.");
 return id;
}

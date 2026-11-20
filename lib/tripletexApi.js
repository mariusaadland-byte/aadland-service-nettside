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
async function tripletexHttp(fetcher,url,{method="GET",body=null,formData=null,sessionToken=null,expectJson=true}={}){
 const headers={"Accept":"application/json"};
 if(body!==null&&formData===null)headers["Content-Type"]="application/json";
 if(sessionToken)headers.Authorization="Basic "+Buffer.from("0:"+sessionToken).toString("base64");
 let response;
 try{
  response=await fetcher(url,{method,headers,body:formData??(body===null?undefined:JSON.stringify(body)),
   signal:AbortSignal.timeout(timeoutMs),cache:"no-store",redirect:"error"});
 }catch{
  throw new TripletexApiError("Kunne ikke kontakte Tripletex sikkert. Kontroller nettverk eller prøv igjen.");
 }
 if(!response.ok){
  // Only expose known field names for validation errors, never provider messages,
  // customer details, error bodies, credentials or arbitrary external content.
  let fieldHint="";
  if(response.status===400||response.status===422){
   const details=await response.json().catch(()=>null);
   const known=new Set(["name","invoiceSendMethod","email","postalAddress",
    "physicalAddress","organizationNumber","phoneNumber","isPrivateIndividual"]);
   const entries=[...(Array.isArray(details?.validationMessages)?details.validationMessages:[]),
    ...(Array.isArray(details?.validationErrors)?details.validationErrors:[])];
   const fields=[...new Set(entries.map(x=>String(x?.field||"").split(/[.\\[]/)[0])
    .filter(x=>known.has(x)))].slice(0,3);
   if(fields.length)fieldHint=" Kontroller felt: "+fields.join(", ")+".";
  }
  const msg=response.status===401?"Tripletex avviste API-nøkkelen eller tilgangssesjonen.":
   response.status===403?"Tripletex-nøkkelen mangler nødvendige tilganger.":
   response.status===429?"Tripletex har for mange forespørsler. Prøv senere.":
   "Tripletex returnerte HTTP "+response.status+"."+fieldHint;
  throw new TripletexApiError(msg,response.status);
 }
 if(!expectJson)return {accepted:true};
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


// Customer corrections use the existing customer ID and PUT; never POST again.
export async function tripletexUpdateCustomer(id,payload,sessionToken,environment,{fetcher=fetch}={}){
 const env=tripletexEnvironment(environment);
 const customerId=Number(id);
 if(!env||!sessionToken||!Number.isSafeInteger(customerId)||customerId<1||
  Number(payload?.id)!==customerId)
  throw new TripletexApiError("Ugyldig kunde-ID ved Tripletex-korrigering.");
 const result=await tripletexHttp(fetcher,BASE_URL[env]+"/customer/"+customerId,{
  method:"PUT",body:payload,sessionToken
 });
 if(Number(result?.value?.id)!==customerId)
  throw new TripletexApiError("Tripletex bekreftet ikke kundeoppdateringen. Kontroller kunden før nytt forsøk.");
 return customerId;
}


// Direct customer-invoice payment: only validated numeric/date parameters.
// The endpoint records a REAL accounting payment. Caller must hold a unique
// per-payment claim and verify the remote balance before invoking this method.
export async function tripletexRecordInvoicePayment(id,paymentDate,paymentTypeId,amountOre,
 sessionToken,environment,{fetcher=fetch}={}){
 const env=tripletexEnvironment(environment);
 const invoiceId=Number(id),typeId=Number(paymentTypeId),ore=Number(amountOre);
 if(!env||!sessionToken||!Number.isSafeInteger(invoiceId)||invoiceId<=0||
  !Number.isSafeInteger(typeId)||typeId<=0||!Number.isSafeInteger(ore)||ore<=0||
  typeof paymentDate!=="string"||!/^20\d\d-\d\d-\d\d$/.test(paymentDate)||
  !Number.isFinite(Date.parse(paymentDate+"T00:00:00Z"))||
  new Date(paymentDate+"T00:00:00Z").toISOString().slice(0,10)!==paymentDate)
  throw new TripletexApiError("Ugyldig betalingsregistrering. Ingen betaling sendt.");
 const amount=(ore/100).toFixed(2);
 const url=BASE_URL[env]+"/invoice/"+invoiceId+"/:payment?paymentDate="+paymentDate+
  "&paymentTypeId="+typeId+"&paidAmount="+amount;
 return tripletexHttp(fetcher,url,{method:"PUT",sessionToken,expectJson:false});
}


// Explicit ONE-INVOICE write for a controlled pilot only. Never send to customer.
export async function tripletexCreateUnsentedInvoice(body,sessionToken,environment,{fetcher=fetch}={}){
 const env=tripletexEnvironment(environment);
 if(!env||!sessionToken||!body||body.invoiceNumber!==0||
  !Array.isArray(body.orders)||body.orders.length!==1||
  !Array.isArray(body.orders[0]?.orderLines)||!body.orders[0].orderLines.length||
  body.id!==undefined||body.version!==undefined||body.paymentTypeId!==undefined||
  body.paidAmount!==undefined)
  throw new TripletexApiError("Ugyldig direkteoverføring: ingen faktura er opprettet.");
 return tripletexHttp(fetcher,BASE_URL[env]+"/invoice?sendToCustomer=false",{
  method:"POST",body,sessionToken
 });
}


// Controlled Vipps-settlement voucher creation. The calling API must first:
// (1) re-fetch/verify every Vipps ledger entry; (2) match every capture to a
// confirmed Tripletex invoice payment; (3) validate accounts and open posts;
// (4) acquire a unique settlement claim in the database; (5) search the remote
// voucher list for its external marker. Never retry an ambiguous write.
export async function tripletexCreateVippsSettlementVoucher(voucher,sessionToken,environment,
 {fetcher=fetch}={}){
 const env=tripletexEnvironment(environment);
 const postings=voucher?.postings;
 if(!env||!sessionToken||typeof voucher?.description!=="string"||
  !/^Vipps (?:oppgjør ASVP-|gebyr ASVF-)service-[A-Za-z0-9_-]{4,100}$/.test(voucher.description)||voucher.description.length>160||
  typeof voucher.date!=="string"||!/^20\d\d-\d\d-\d\d$/.test(voucher.date)||
  !Array.isArray(postings)||postings.length<2||postings.length>3||
  voucher.id!==undefined||voucher.version!==undefined)
  throw new TripletexApiError("Ugyldig oppgjørsbilag; ingenting sendt til Tripletex.");
 const sum=postings.reduce((n,p)=>n+Math.round(Number(p.amountGross)*100),0);
 if(sum!==0||postings.some(p=>!Number.isSafeInteger(p.account?.id)||
  p.account.id<1||p.date!==voucher.date||p.vatType?.id!==0||
  !Number.isSafeInteger(Math.round(Number(p.amountGross)*100))||
  !Number.isSafeInteger(Math.round(Number(p.amountGrossCurrency)*100))))
  throw new TripletexApiError("Oppgjørsbilaget balanserer ikke eller har ugyldige kontoer.");
 const result=await tripletexHttp(fetcher,BASE_URL[env]+"/ledger/voucher?sendToLedger=true",{
  method:"POST",sessionToken,body:voucher
 });
 const id=Number(result?.value?.id);
 if(!Number.isSafeInteger(id)||id<=0)
  throw new TripletexApiError("Tripletex bekreftet ikke bilags-ID. Ikke send på nytt.");
 return id;
}


// Upload a PDF ONLY to an existing, remotely verified invoice voucher.
// The caller must lock a unique attempt, validate the original's hash, check
// that no attachment already exists and verify it after upload. Do not retry.
export async function tripletexUploadVoucherAttachment(voucherId,bytes,filename,
 sessionToken,environment,{fetcher=fetch}={}){
 const env=tripletexEnvironment(environment),id=Number(voucherId);
 if(!env||!sessionToken||!Number.isSafeInteger(id)||id<=0||
  !Buffer.isBuffer(bytes)||bytes.length<12||bytes.length>4*1024*1024||
  bytes.subarray(0,5).toString()!=="%PDF-"||
  typeof filename!=="string"||!/^originalfaktura-[A-Za-z0-9_-]{1,40}\.pdf$/.test(filename))
  throw new TripletexApiError("Originalfil eller bilags-ID er ugyldig. Ingenting ble lastet opp.");
 const formData=new FormData();
 formData.append("file",new Blob([bytes],{type:"application/pdf"}),filename);
 return tripletexHttp(fetcher,BASE_URL[env]+"/ledger/voucher/"+id+"/attachment",{
  method:"POST",formData,sessionToken
 });
}

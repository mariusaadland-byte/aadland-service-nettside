const DEFINITIONS=[
 {id:"byggern",name:"Bygger’n",capability:"Proffpris / prisliste / godkjent integrasjon"},
 {id:"ahlsell",name:"Ahlsell",capability:"PunchOut / EDI / prisfeed"},
 {id:"optimera",name:"Optimera / MinOptimera",capability:"Avtalepris / godkjent integrasjon"},
 {id:"byggmakker",name:"Byggmakker Proff",capability:"Proffpris / godkjent integrasjon"},
 {id:"megaflis",name:"Megaflis",capability:"Prisfeed / nettpris der avtalt"}
];

const envKey=id=>"MATERIAL_SUPPLIER_"+id.toUpperCase().replace(/[^A-Z0-9]/g,"_");

export function materialSupplierStatuses(){
 return DEFINITIONS.map(def=>{
  const prefix=envKey(def.id),url=process.env[prefix+"_FEED_URL"]||"";
  return {...def,connected:Boolean(url),mode:url?"Direkte prisfeed":"Prisfil / venter på kobling"};
 });
}
function definition(value){
 const q=String(value||"").toLowerCase();
 return DEFINITIONS.find(def=>def.id===q||def.name.toLowerCase()===q)||null;
}
function finite(value){
 const n=Number(value);return Number.isFinite(n)&&n>=0?n:0;
}
function normalizeProduct(row,def){
 const inc=finite(row.priceIncVat??row.price_inc_vat??row.priceInclVat),ex=finite(row.costExVat??row.priceExVat??row.price_ex_vat??row.netPrice);
 return {
  supplier:def.name,
  sku:String(row.sku??row.itemNumber??row.articleNumber??row.artnr??"").slice(0,120),
  name:String(row.name??row.productName??row.description??"").slice(0,300),
  unit:String(row.unit??row.uom??"stk").slice(0,30),
  costExVat:ex||inc/1.25,
  packageSize:finite(row.packageSize??row.packSize),
  priceBasis:String(row.priceBasis??row.price_basis??"unit").toLowerCase().includes("pack")?"package":"unit",
  source:"direct"
 };
}

export async function lookupMaterialSupplier(supplier,query){
 const def=definition(supplier);if(!def)return {error:"Ukjent leverandør.",status:400};
 const prefix=envKey(def.id),base=process.env[prefix+"_FEED_URL"]||"";
 if(!base)return {supplier:def,connected:false,products:[]};
 let url;
 try{url=new URL(base)}catch{return {error:"Leverandørkoblingen har ugyldig URL.",status:500}}
 url.searchParams.set("q",String(query||"").slice(0,240));
 const headers={accept:"application/json"},token=process.env[prefix+"_FEED_TOKEN"]||"";
 if(token)headers.authorization="Bearer "+token;
 const response=await fetch(url,{headers,cache:"no-store",signal:AbortSignal.timeout(10000)});
 const data=await response.json().catch(()=>null);
 if(!response.ok)return {error:"Leverandøren svarte med feil ("+response.status+").",status:502};
 const rows=Array.isArray(data)?data:Array.isArray(data?.products)?data.products:Array.isArray(data?.items)?data.items:[];
 const products=rows.map(row=>normalizeProduct(row,def)).filter(row=>row.name&&row.costExVat>0).slice(0,20);
 return {supplier:def,connected:true,products};
}

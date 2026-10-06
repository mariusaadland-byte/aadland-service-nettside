import {NextResponse} from "next/server";
import {getAdminUser,hasPermission} from "../../../../lib/auth";
import {db} from "../../../../lib/supabase";
import {sameOriginGuard} from "../../../../lib/requestGuard";
import {materialSupplierStatuses,lookupMaterialSupplier} from "../../../../lib/materialSupplierAdapters";

async function allowed(){
 const user=await getAdminUser();
 return Boolean(user&&(user.role==="owner"||await hasPermission("canUpdateOrders")||await hasPermission("canManageProducts")));
}

function slug(value){
 return String(value||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"").slice(0,80);
}
function clean(value,max=300){return String(value??"").trim().slice(0,max)}
function ore(value){
 const n=Number(value);
 return Number.isFinite(n)&&n>=0?Math.round(n):0;
}

async function supplierList(s){
 const {data,error}=await s.from("material_suppliers").select("*").order("is_primary",{ascending:false}).order("name");
 if(error)return {error};
 const direct=new Map(materialSupplierStatuses().map(item=>[item.id,item]));
 const suppliers=await Promise.all((data||[]).map(async item=>{
  const countResult=await s.from("material_supplier_products").select("supplier_id",{count:"exact",head:true}).eq("supplier_id",item.id).eq("active",true);
  const adapter=direct.get(item.id);
  return {
   id:item.id,name:item.name,active:item.active!==false,isPrimary:item.is_primary===true,
   defaultMarkupPercent:Number(item.default_markup_percent)||15,
   lastImportAt:item.last_import_at||null,lastSourceFilename:item.last_source_filename||"",
   productCount:countResult.count||0,
   connected:Boolean(adapter?.connected),
   mode:(countResult.count||0)>0?"Database / prisliste":adapter?.mode||"Klar for prisliste"
  };
 }));
 return {suppliers};
}

async function resolveSupplier(s,value){
 const raw=clean(value,120);
 if(!raw)return null;
 let result=await s.from("material_suppliers").select("*").eq("id",raw.toLowerCase()).maybeSingle();
 if(result.data)return result.data;
 result=await s.from("material_suppliers").select("*").ilike("name",raw).maybeSingle();
 return result.data||null;
}

export async function GET(req){
 if(!(await allowed()))return NextResponse.json({error:"Ingen tilgang."},{status:403});
 const s=db();if(!s)return NextResponse.json({error:"Databasen er ikke tilgjengelig."},{status:503});
 const params=new URL(req.url).searchParams;
 const supplierParam=clean(params.get("supplier"),120);
 const q=clean(params.get("q"),240);

 if(!q){
  const list=await supplierList(s);
  if(list.error)return NextResponse.json({error:"Kunne ikke hente leverandører."},{status:500});
  return NextResponse.json(list);
 }

 let supplierId=null,supplier=null;
 if(supplierParam){
  supplier=await resolveSupplier(s,supplierParam);
  if(!supplier)return NextResponse.json({error:"Ukjent leverandør."},{status:400});
  supplierId=supplier.id;
 }

 const {data,error}=await s.rpc("search_material_supplier_products",{
  search_query:q,supplier_filter:supplierId,result_limit:20
 });
 if(error){
  console.error("MATERIAL SEARCH",error);
  return NextResponse.json({error:"Kunne ikke søke i prisbasen."},{status:500});
 }
 const products=(data||[]).map(row=>({
  supplierId:row.supplier_id,
  supplier:row.supplier_name,
  supplierIsPrimary:row.supplier_is_primary===true,
  sku:row.supplier_sku,
  name:row.product_name,
  unit:row.unit||"STK",
  costExVat:Number(row.cost_ex_vat_ore||0)/100,
  categoryCode:row.category_code||"",
  categoryName:row.category_name||"",
  ean:row.ean||"",
  moduleNumber:row.module_number||"",
  priceBasis:"unit",
  source:"database"
 }));

 if(products.length||!supplierId)return NextResponse.json({supplier,connected:true,products,source:"database"});

 // Ingen lokal treff: forsøk eventuell godkjent direkte prisfeed for denne leverandøren.
 try{
  const fallback=await lookupMaterialSupplier(supplierId,q);
  if(!fallback.error&&fallback.connected&&Array.isArray(fallback.products)){
   return NextResponse.json({...fallback,products:fallback.products.map(item=>({...item,supplierId,source:"direct"}))});
  }
 }catch{}
 return NextResponse.json({supplier,connected:true,products:[],source:"database"});
}

export async function POST(req){
 const originError=sameOriginGuard(req);if(originError)return originError;
 if(!(await allowed()))return NextResponse.json({error:"Ingen tilgang."},{status:403});
 const s=db();if(!s)return NextResponse.json({error:"Databasen er ikke tilgjengelig."},{status:503});

 let body;
 try{body=await req.json()}catch{return NextResponse.json({error:"Ugyldig importfil."},{status:400})}
 const supplierName=clean(body.supplierName,120);
 const supplierId=slug(body.supplierId||supplierName);
 const sourceFilename=clean(body.sourceFilename,240);
 const rows=Array.isArray(body.products)?body.products:[];
 if(!supplierId||!supplierName)return NextResponse.json({error:"Leverandør mangler."},{status:400});
 if(!rows.length)return NextResponse.json({error:"Prislisten inneholder ingen produkter."},{status:400});
 if(rows.length>25000)return NextResponse.json({error:"Prislisten er for stor. Maks 25 000 varer per import."},{status:413});

 const normalized=[];
 const seen=new Set();
 for(const row of rows){
  const sku=clean(row.sku,120),name=clean(row.name,300),cost=ore(row.costExVatOre);
  if(!sku||!name||cost<=0||seen.has(sku))continue;
  seen.add(sku);
  normalized.push({
   supplier_id:supplierId,supplier_sku:sku,name,
   cost_ex_vat_ore:cost,unit:clean(row.unit||"STK",30)||"STK",
   category_code:clean(row.categoryCode,120),category_name:clean(row.categoryName,240),
   ean:clean(row.ean,120),module_number:clean(row.moduleNumber,120),
   active:true,source_filename:sourceFilename
  });
 }
 if(!normalized.length)return NextResponse.json({error:"Fant ingen gyldige varer med varenummer, navn og pris."},{status:400});

 const batch=crypto.randomUUID();
 const {error:supplierError}=await s.from("material_suppliers").upsert({
  id:supplierId,name:supplierName,active:true,updated_at:new Date().toISOString()
 },{onConflict:"id"});
 if(supplierError){
  console.error("MATERIAL SUPPLIER UPSERT",supplierError);
  return NextResponse.json({error:"Kunne ikke lagre leverandøren."},{status:500});
 }

 for(let i=0;i<normalized.length;i+=500){
  const chunk=normalized.slice(i,i+500).map(row=>({...row,import_batch:batch,imported_at:new Date().toISOString(),updated_at:new Date().toISOString()}));
  const {error}=await s.from("material_supplier_products").upsert(chunk,{onConflict:"supplier_id,supplier_sku"});
  if(error){
   console.error("MATERIAL IMPORT",error);
   return NextResponse.json({error:"Importen stoppet under lagring. Eksisterende prisliste er fortsatt beholdt."},{status:500});
  }
 }

 const {error:deactivateError}=await s.from("material_supplier_products")
  .update({active:false,updated_at:new Date().toISOString()})
  .eq("supplier_id",supplierId).neq("import_batch",batch);
 if(deactivateError){
  console.error("MATERIAL DEACTIVATE",deactivateError);
  return NextResponse.json({error:"Varene ble importert, men gamle varer kunne ikke deaktiveres."},{status:500});
 }

 await s.from("material_suppliers").update({
  last_import_at:new Date().toISOString(),last_source_filename:sourceFilename,updated_at:new Date().toISOString()
 }).eq("id",supplierId);

 return NextResponse.json({ok:true,supplierId,supplierName,imported:normalized.length,skipped:rows.length-normalized.length});
}

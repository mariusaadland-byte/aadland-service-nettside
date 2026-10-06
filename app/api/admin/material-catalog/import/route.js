import {NextResponse} from "next/server";
import {getAdminUser,hasPermission} from "../../../../../lib/auth";
import {db} from "../../../../../lib/supabase";
import {sameOriginGuard} from "../../../../../lib/requestGuard";
import {parseMaterialPriceFile} from "../../../../../lib/materialPriceFile";

export const runtime="nodejs";

const MAX_FILE_BYTES=8*1024*1024;
const CHUNK_SIZE=500;

async function allowed(){
 const user=await getAdminUser();
 if(!user)return null;
 if(user.role==="owner"||await hasPermission("canManageProducts"))return user;
 return null;
}
function slugify(value){
 return String(value||"").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/æ/g,"ae").replace(/ø/g,"o").replace(/å/g,"a").replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"").slice(0,60);
}

export async function POST(req){
 const originError=sameOriginGuard(req);
 if(originError)return originError;
 if(!(await allowed()))return NextResponse.json({error:"Ingen tilgang."},{status:403});

 let form;
 try{form=await req.formData()}catch{return NextResponse.json({error:"Kunne ikke lese opplastingen."},{status:400})}

 const file=form.get("file");
 if(!file||typeof file.arrayBuffer!=="function")return NextResponse.json({error:"Velg en prisfil."},{status:400});
 if(file.size<=0)return NextResponse.json({error:"Prisfilen er tom."},{status:400});
 if(file.size>MAX_FILE_BYTES)return NextResponse.json({error:"Prisfilen er for stor. Maks størrelse er 8 MB."},{status:413});

 const requestedId=slugify(form.get("supplierId"));
 const newSupplierName=String(form.get("newSupplierName")||"").trim().slice(0,120);
 const priceIncludesVat=String(form.get("priceIncludesVat")||"")==="true";
 const s=db();
 if(!s)return NextResponse.json({error:"Databasen er ikke tilgjengelig."},{status:503});

 let supplier=null;
 if(requestedId&&requestedId!=="new"){
  const {data,error}=await s.from("material_suppliers").select("id,name,is_primary,default_markup_percent").eq("id",requestedId).maybeSingle();
  if(error)return NextResponse.json({error:"Kunne ikke hente valgt leverandør."},{status:500});
  supplier=data||null;
 }
 if(!supplier){
  if(!newSupplierName)return NextResponse.json({error:"Skriv inn navn på den nye leverandøren."},{status:400});
  const id=slugify(newSupplierName);
  if(!id)return NextResponse.json({error:"Leverandørnavnet er ugyldig."},{status:400});
  const {data,error}=await s.from("material_suppliers").upsert({
   id,
   name:newSupplierName,
   active:true,
   is_primary:false,
   default_markup_percent:15,
   updated_at:new Date().toISOString()
  },{onConflict:"id"}).select("id,name,is_primary,default_markup_percent").single();
  if(error)return NextResponse.json({error:"Kunne ikke opprette leverandøren."},{status:500});
  supplier=data;
 }

 let parsed;
 try{
  const buffer=Buffer.from(await file.arrayBuffer());
  parsed=parseMaterialPriceFile(buffer,file.name,{priceIncludesVat});
 }catch(error){
  return NextResponse.json({error:error?.message||"Kunne ikke lese prisfilen."},{status:400});
 }

 const now=new Date().toISOString();
 const batch=supplier.id+"-"+Date.now().toString(36);
 for(let i=0;i<parsed.products.length;i+=CHUNK_SIZE){
  const rows=parsed.products.slice(i,i+CHUNK_SIZE).map(product=>({
   supplier_id:supplier.id,
   ...product,
   active:true,
   source_filename:String(file.name||"prisfil").slice(0,240),
   import_batch:batch,
   imported_at:now,
   updated_at:now
  }));
  const {error}=await s.from("material_supplier_products").upsert(rows,{onConflict:"supplier_id,supplier_sku"});
  if(error)return NextResponse.json({error:"Importen stoppet under lagring. Eksisterende katalog er ikke deaktivert."},{status:500});
 }

 const {error:deactivateError}=await s.from("material_supplier_products")
  .update({active:false,updated_at:now})
  .eq("supplier_id",supplier.id)
  .neq("import_batch",batch);
 if(deactivateError)return NextResponse.json({error:"Prisene ble importert, men gamle varer kunne ikke deaktiveres."},{status:500});

 const {error:supplierUpdateError}=await s.from("material_suppliers").update({
  active:true,
  last_import_at:now,
  last_source_filename:String(file.name||"prisfil").slice(0,240),
  updated_at:now
 }).eq("id",supplier.id);
 if(supplierUpdateError)return NextResponse.json({error:"Prisene ble importert, men leverandørstatus kunne ikke oppdateres."},{status:500});

 return NextResponse.json({
  ok:true,
  supplier:{id:supplier.id,name:supplier.name},
  imported:parsed.products.length,
  skipped:parsed.skipped,
  priceIncludesVat
 });
}

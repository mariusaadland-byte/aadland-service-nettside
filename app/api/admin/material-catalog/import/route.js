import {NextResponse} from "next/server";
import {getAdminUser} from "../../../../../lib/auth";
import {db} from "../../../../../lib/supabase";
import {sameOriginGuard} from "../../../../../lib/requestGuard";
import {parseMaterialPriceFile} from "../../../../../lib/materialPriceFile";

export const runtime="nodejs";

const MAX_FILE_BYTES=4*1024*1024;
export const maxDuration=60;
import {previewMaterialImport,activateMaterialImport} from "../../../../../lib/materialImportWorkflow";

async function allowed(){
 const user=await getAdminUser();
 if(!user)return null;
 if(user.role==="owner")return user;
 return null;
}
function slugify(value){
 return String(value||"").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/æ/g,"ae").replace(/ø/g,"o").replace(/å/g,"a").replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"").slice(0,60);
}

export async function GET(){
 const user=await allowed();if(!user)return NextResponse.json({error:"Kun eier kan importere priser."},{status:403});
 const s=db();if(!s)return NextResponse.json({error:"Databasen er ikke tilgjengelig."},{status:503});
 const {data,error}=await s.from("material_suppliers").select("id,name,last_import_at").eq("active",true).neq("id","egne-varer").order("name");
 if(error)return NextResponse.json({error:"Kunne ikke hente leverandører for import."},{status:500});
 return NextResponse.json({suppliers:(data||[]).map(item=>({id:item.id,name:item.name,lastImportAt:item.last_import_at||null}))},{headers:{"Cache-Control":"no-store"}});
}

export async function POST(req){
 const originError=sameOriginGuard(req);
 if(originError)return originError;
 const user=await allowed();if(!user)return NextResponse.json({error:"Kun eier kan importere priser."},{status:403});
 if(process.env.VERCEL_ENV!=="production")return NextResponse.json({error:"Prisimport er sperret i testmiljø."},{status:403});

 let form;
 try{form=await req.formData()}catch{return NextResponse.json({error:"Kunne ikke lese opplastingen."},{status:400})}

 const s=db();if(!s)return NextResponse.json({error:"Databasen er ikke tilgjengelig."},{status:503});
 if(form.get("action")==="activate")return activateMaterialImport(s,user,{previewId:form.get("previewId"),phrase:form.get("phrase")});
 const file=form.get("file");
 if(!file||typeof file.arrayBuffer!=="function")return NextResponse.json({error:"Velg en prisfil."},{status:400});
 if(file.size<=0)return NextResponse.json({error:"Prisfilen er tom."},{status:400});
 if(file.size>MAX_FILE_BYTES)return NextResponse.json({error:"Prisfilen er for stor. Maks størrelse er 4 MB. Bruk komprimert CSV (.csv.gz) for store prislister."},{status:413});

 const requestedId=slugify(form.get("supplierId"));
 const newSupplierName=String(form.get("newSupplierName")||"").trim().slice(0,120);
 const priceIncludesVat=String(form.get("priceIncludesVat")||"")==="true";
 let supplierId=requestedId,supplierName=newSupplierName;
 if(requestedId&&requestedId!=="new"){
  const {data,error}=await s.from("material_suppliers").select("id,name").eq("id",requestedId).maybeSingle();
  if(error||!data)return NextResponse.json({error:"Ukjent leverandør."},{status:400});
  supplierName=data.name;
 }else supplierId=slugify(newSupplierName);
 if(!supplierId||!supplierName||supplierId==="egne-varer")return NextResponse.json({error:"Velg en gyldig ekstern leverandør."},{status:400});
 let parsed;
 try{
  const buffer=Buffer.from(await file.arrayBuffer());
  parsed=parseMaterialPriceFile(buffer,file.name,{priceIncludesVat});
 }catch(error){
  return NextResponse.json({error:error?.message||"Kunne ikke lese prisfilen."},{status:400});
 }

 return previewMaterialImport(s,user,{supplierId,supplierName,filename:String(file.name||"prisfil").slice(0,240),products:parsed.products,skipped:parsed.skipped});
}
